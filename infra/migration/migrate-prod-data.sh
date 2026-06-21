#!/usr/bin/env bash
#
# migrate-prod-data.sh — move production DATA from AWS to the on-prem k3s cluster.
#
# Two independent migrations, each broken into small re-runnable steps so you can
# rehearse, inspect, and verify before the real cutover:
#
#   Database  : pg_dump from RDS (private) -> S3 -> local -> in-cluster Postgres
#   Uploads   : S3 bucket -> local -> on-prem Garage bucket
#
# RDS is NOT publicly accessible, so the dump is produced INSIDE the running
# Fargate "web" task via ECS Exec (which has psql, the AWS CLI, $DATABASE_URL,
# and $S3_BUCKET) and streamed to the uploads bucket. The remote command is
# base64-encoded to avoid shell-quoting hell over the SSM channel.
#
# Recommended order:
#   1. ./migrate-prod-data.sh db-export       # dump RDS -> S3 (+ row counts)
#   2. ./migrate-prod-data.sh db-download      # S3 -> local
#   3. ./migrate-prod-data.sh db-restore       # local -> in-cluster Postgres
#   4. ./migrate-prod-data.sh db-verify        # compare per-table row counts
#   5. ./migrate-prod-data.sh uploads-download # S3 -> local
#   6. ./migrate-prod-data.sh uploads-upload   # local -> Garage
#   7. ./migrate-prod-data.sh uploads-verify   # compare object counts
#   8. ./migrate-prod-data.sh cleanup-remote   # delete the dump from S3
#
# Do a full dry-run rehearsal first. For the FINAL pass, freeze writes
# (scale the ECS service down to keep one task for Exec, or put the app in
# maintenance) so no rows are written between export and DNS cutover.
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration (override via environment)
# ---------------------------------------------------------------------------
AWS_PROFILE="${AWS_PROFILE:-nvyt-prod}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"

ECS_CLUSTER="${ECS_CLUSTER:-nvyt-production-cluster}"
ECS_SERVICE="${ECS_SERVICE:-nvyt-production-web}"
ECS_CONTAINER="${ECS_CONTAINER:-web}"

PROD_BUCKET="${PROD_BUCKET:-nvyt-uploads-prod}"
DUMP_KEY="${DUMP_KEY:-_migration/nvyt-db.sql.gz}"
COUNTS_KEY="${COUNTS_KEY:-_migration/rds-counts.txt}"

K8S_NS="${K8S_NS:-nvyt-production}"
PG_DEPLOY="${PG_DEPLOY:-deploy/postgres}"
PG_USER="${PG_USER:-nvyt}"
PG_DB="${PG_DB:-nvyt}"

# Garage (on-prem) target for uploads. Keys come from the prod Garage access key
# you created for the nvyt-uploads-prod bucket.
GARAGE_ENDPOINT="${GARAGE_ENDPOINT:-http://192.168.0.20:30900}"
GARAGE_BUCKET="${GARAGE_BUCKET:-nvyt-uploads-prod}"
GARAGE_ACCESS_KEY_ID="${GARAGE_ACCESS_KEY_ID:-}"
GARAGE_SECRET_ACCESS_KEY="${GARAGE_SECRET_ACCESS_KEY:-}"

# Local scratch dir (./db-dump is already git-ignored)
WORKDIR="${WORKDIR:-./db-dump}"
UPLOADS_DIR="${WORKDIR}/uploads"

AWS=(aws --profile "$AWS_PROFILE" --region "$AWS_REGION")

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

confirm() {
  read -r -p "$1 [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || die "Aborted."
}

require() { command -v "$1" >/dev/null 2>&1 || die "Missing required tool: $1"; }

preflight_aws() {
  require aws
  "${AWS[@]}" sts get-caller-identity >/dev/null \
    || die "AWS credentials/profile '$AWS_PROFILE' not working."
}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

# Find a running web task to Exec into.
get_task_arn() {
  "${AWS[@]}" ecs list-tasks \
    --cluster "$ECS_CLUSTER" --service-name "$ECS_SERVICE" \
    --desired-status RUNNING \
    --query 'taskArns[0]' --output text
}

# Run an arbitrary shell script inside the web container via ECS Exec.
# The script is base64-encoded so no quoting/expansion happens on our side —
# $DATABASE_URL, $S3_BUCKET etc. are resolved inside the container.
ecs_exec() {
  local remote_script="$1" task b64
  task="$(get_task_arn)"
  [[ "$task" != "None" && -n "$task" ]] || die "No RUNNING task in $ECS_SERVICE."
  log "ECS Exec into task: ${task##*/}"
  b64="$(printf '%s' "$remote_script" | base64 | tr -d '\n')"
  "${AWS[@]}" ecs execute-command \
    --cluster "$ECS_CLUSTER" \
    --task "$task" \
    --container "$ECS_CONTAINER" \
    --interactive \
    --command "/bin/sh -c \"echo $b64 | base64 -d | /bin/sh\""
}

cmd_db_export() {
  preflight_aws
  require session-manager-plugin
  log "Dumping RDS -> s3://$PROD_BUCKET/$DUMP_KEY and writing row counts."
  # NOTE: runs inside the container; $DATABASE_URL and $S3_BUCKET are its env.
  # --no-owner/--no-privileges so it restores cleanly into the k3s 'nvyt' role.
  ecs_exec "$(cat <<REMOTE
set -e
echo 'Streaming pg_dump to S3...'
pg_dump --no-owner --no-privileges --format=plain "\$DATABASE_URL" \
  | gzip \
  | aws s3 cp - "s3://\$S3_BUCKET/$DUMP_KEY"
echo 'Capturing per-table row counts...'
psql "\$DATABASE_URL" -At -F'|' <<'SQL' | sort | aws s3 cp - "s3://\$S3_BUCKET/$COUNTS_KEY"
SELECT format('SELECT %L, count(*) FROM %I', tablename, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY 1
\gexec
SQL
echo 'Export complete.'
REMOTE
)"
  log "Verifying the dump landed in S3..."
  "${AWS[@]}" s3 ls "s3://$PROD_BUCKET/$DUMP_KEY" \
    || die "Dump object not found — check the Exec output above."
}

cmd_db_download() {
  preflight_aws
  mkdir -p "$WORKDIR"
  log "Downloading dump + counts from S3 -> $WORKDIR"
  "${AWS[@]}" s3 cp "s3://$PROD_BUCKET/$DUMP_KEY"   "$WORKDIR/nvyt-db.sql.gz"
  "${AWS[@]}" s3 cp "s3://$PROD_BUCKET/$COUNTS_KEY" "$WORKDIR/rds-counts.txt"
  log "Downloaded:"
  ls -lh "$WORKDIR/nvyt-db.sql.gz" "$WORKDIR/rds-counts.txt"
}

cmd_db_restore() {
  require kubectl
  [[ -f "$WORKDIR/nvyt-db.sql.gz" ]] || die "Run db-download first."

  # Safety: refuse to restore over a non-empty database.
  local existing
  existing="$(kubectl exec -i -n "$K8S_NS" "$PG_DEPLOY" -- \
    psql -U "$PG_USER" -d "$PG_DB" -At \
    -c "SELECT count(*) FROM pg_tables WHERE schemaname='public'" 2>/dev/null || echo 0)"
  if [[ "${existing:-0}" -gt 0 ]]; then
    warn "Target DB already has $existing public tables."
    confirm "Restore anyway (objects may conflict)?"
  fi

  log "Restoring dump into $K8S_NS/$PG_DEPLOY ($PG_DB)..."
  gunzip -c "$WORKDIR/nvyt-db.sql.gz" \
    | kubectl exec -i -n "$K8S_NS" "$PG_DEPLOY" -- \
        psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 --single-transaction
  log "Restore complete."
}

cmd_db_verify() {
  require kubectl
  [[ -f "$WORKDIR/rds-counts.txt" ]] || die "Run db-download first (need rds-counts.txt)."

  log "Collecting per-table counts from the restored DB..."
  kubectl exec -i -n "$K8S_NS" "$PG_DEPLOY" -- \
    psql -U "$PG_USER" -d "$PG_DB" -At -F'|' <<'SQL' | sort > "$WORKDIR/local-counts.txt"
SELECT format('SELECT %L, count(*) FROM %I', tablename, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY 1
\gexec
SQL

  log "Diffing RDS vs restored (left = RDS, right = k3s):"
  if diff -u "$WORKDIR/rds-counts.txt" "$WORKDIR/local-counts.txt"; then
    log "✅ Row counts match exactly."
  else
    die "❌ Row counts differ — investigate before cutover."
  fi
}

# ---------------------------------------------------------------------------
# Uploads (S3 -> Garage)
# ---------------------------------------------------------------------------

cmd_uploads_download() {
  preflight_aws
  mkdir -p "$UPLOADS_DIR"
  log "Syncing s3://$PROD_BUCKET -> $UPLOADS_DIR (excluding the DB dump)"
  "${AWS[@]}" s3 sync "s3://$PROD_BUCKET" "$UPLOADS_DIR" --exclude "_migration/*"
  log "Local object count: $(find "$UPLOADS_DIR" -type f | wc -l | tr -d ' ')"
}

cmd_uploads_upload() {
  require aws
  [[ -d "$UPLOADS_DIR" ]] || die "Run uploads-download first."
  [[ -n "$GARAGE_ACCESS_KEY_ID" && -n "$GARAGE_SECRET_ACCESS_KEY" ]] \
    || die "Set GARAGE_ACCESS_KEY_ID and GARAGE_SECRET_ACCESS_KEY (prod Garage key)."
  log "Syncing $UPLOADS_DIR -> Garage s3://$GARAGE_BUCKET @ $GARAGE_ENDPOINT"
  AWS_ACCESS_KEY_ID="$GARAGE_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$GARAGE_SECRET_ACCESS_KEY" \
  aws s3 sync "$UPLOADS_DIR" "s3://$GARAGE_BUCKET" \
    --endpoint-url "$GARAGE_ENDPOINT" --region garage
  log "Upload complete."
}

cmd_uploads_verify() {
  preflight_aws
  [[ -n "$GARAGE_ACCESS_KEY_ID" && -n "$GARAGE_SECRET_ACCESS_KEY" ]] \
    || die "Set GARAGE_ACCESS_KEY_ID and GARAGE_SECRET_ACCESS_KEY."
  local src dst
  src="$("${AWS[@]}" s3 ls "s3://$PROD_BUCKET" --recursive \
        | grep -v ' _migration/' | wc -l | tr -d ' ')"
  dst="$(AWS_ACCESS_KEY_ID="$GARAGE_ACCESS_KEY_ID" \
         AWS_SECRET_ACCESS_KEY="$GARAGE_SECRET_ACCESS_KEY" \
         aws s3 ls "s3://$GARAGE_BUCKET" --recursive \
           --endpoint-url "$GARAGE_ENDPOINT" --region garage \
         | wc -l | tr -d ' ')"
  log "S3 objects: $src   |   Garage objects: $dst"
  [[ "$src" == "$dst" ]] && log "✅ Object counts match." \
    || warn "❌ Counts differ — re-run uploads-upload or investigate."
}

cmd_cleanup_remote() {
  preflight_aws
  confirm "Delete s3://$PROD_BUCKET/_migration/ (DB dump + counts) from S3?"
  "${AWS[@]}" s3 rm "s3://$PROD_BUCKET/_migration/" --recursive
  log "Removed migration scratch objects from S3."
}

# ---------------------------------------------------------------------------
usage() {
  cat <<EOF
Usage: $0 <command>

Database:
  db-export         Dump RDS -> S3 (+ per-table row counts) via ECS Exec
  db-download       Download dump + counts from S3 to $WORKDIR
  db-restore        Restore dump into in-cluster Postgres ($K8S_NS/$PG_DEPLOY)
  db-verify         Diff RDS vs restored per-table row counts

Uploads:
  uploads-download  Sync s3://$PROD_BUCKET -> $UPLOADS_DIR
  uploads-upload    Sync $UPLOADS_DIR -> Garage ($GARAGE_ENDPOINT)
  uploads-verify    Compare object counts (S3 vs Garage)

Cleanup:
  cleanup-remote    Delete _migration/ scratch objects from S3

Prereqs: aws CLI, kubectl (pointed at k3s), session-manager-plugin.
Override any setting via env vars — see the top of this script.
EOF
}

case "${1:-}" in
  db-export)        cmd_db_export ;;
  db-download)      cmd_db_download ;;
  db-restore)       cmd_db_restore ;;
  db-verify)        cmd_db_verify ;;
  uploads-download) cmd_uploads_download ;;
  uploads-upload)   cmd_uploads_upload ;;
  uploads-verify)   cmd_uploads_verify ;;
  cleanup-remote)   cmd_cleanup_remote ;;
  ""|-h|--help|help) usage ;;
  *) usage; die "Unknown command: $1" ;;
esac
