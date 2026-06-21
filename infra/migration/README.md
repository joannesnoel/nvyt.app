# Production migration runbook: AWS ECS/Fargate → on-prem k3s

Move production off AWS (ECS Fargate, RDS, S3, ALB) and onto the same on-prem
k3s cluster as staging, in a new `nvyt-production` namespace. Goal: eliminate the
AWS bill while traffic is low. Cutover is a single DNS switch in Cloudflare, so
rollback is fast until AWS is torn down.

```
Cloudflare (DNS + TLS)
  ├─ nvyt.app          → nginx ingress → nvyt-web-service (ns: nvyt-production)
  └─ uploads.nvyt.app  → nginx ingress → garage-s3 (ns: garage)

k3s node (192.168.0.20)
  ├─ ns nvyt-production : nvyt-web, postgres (PVC), expire-orders + backup CronJobs
  ├─ ns nvyt-staging    : unchanged
  └─ ns garage          : shared Garage — buckets nvyt-uploads-prod + nvyt-db-backups
```

## Prerequisites (operator workstation)

- `kubectl` configured against the k3s cluster
- `aws` CLI with the `nvyt-prod` profile (region `ap-southeast-1`)
- `session-manager-plugin` (required for ECS Exec during the DB dump)
- Access to the live secret values: pull from AWS Secrets Manager before teardown
  ```sh
  aws --profile nvyt-prod --region ap-southeast-1 secretsmanager get-secret-value --secret-id nvyt-production/app-secrets --query SecretString --output text
  aws --profile nvyt-prod --region ap-southeast-1 secretsmanager get-secret-value --secret-id nvyt-production/db-password --query SecretString --output text
  ```

---

## 1. Garage: create the production bucket, backups bucket, and key

Garage already runs in the `garage` namespace (staging uses it). Create the prod
bucket, a backups bucket, and an access key with read+write on both. The binary
is `/garage` inside the pod.

```sh
G() { kubectl exec -n garage deploy/garage -- /garage "$@"; }

G bucket create nvyt-uploads-prod
G bucket create nvyt-db-backups

# Create a key; CAPTURE the printed Key ID and Secret key.
G key create nvyt-prod-key

G bucket allow --read --write --owner nvyt-uploads-prod --key nvyt-prod-key
G bucket allow --read --write          nvyt-db-backups   --key nvyt-prod-key

# Sanity check
G bucket list
G key info nvyt-prod-key
```

Put the captured **Key ID / Secret** into `NUXT_S3_ACCESS_KEY_ID` /
`NUXT_S3_SECRET_ACCESS_KEY` in the production secret (next step). The backup
CronJob reuses the same key.

---

## 2. Secrets and config

Production uses **live** keys, which must never be committed.

```sh
cp k8s/production/secret.example.yaml k8s/production/secret.yaml
# Fill in live values from Secrets Manager + the Garage key above.
# k8s/production/secret.yaml is git-ignored.
```

Key fields to set: a strong `POSTGRES_PASSWORD` (must match `DATABASE_URL` /
`NUXT_DATABASE_URL`), live PayMongo/PayPal (`PAYPAL_MODE: live`), `JWT_SECRET`,
Resend/SMTP, Pusher, Google Maps, VAPID, `CRON_SECRET`, the Garage key, and:
- `NUXT_S3_BUCKET: nvyt-uploads-prod`
- `NUXT_PUBLIC_S3_PUBLIC_URL: https://uploads.nvyt.app/nvyt-uploads-prod`
- `NUXT_PUBLIC_APP_URL: https://nvyt.app`

---

## 3. Cluster RBAC + bring up production (no traffic yet)

```sh
# Extend the self-hosted runner's RBAC to nvyt-production (idempotent)
kubectl apply -f k8s/github-runner/runner-deployment.yaml

# Namespace, config, secrets, database
kubectl apply -f k8s/production/namespace.yaml
kubectl apply -f k8s/production/configmap.yaml
kubectl apply -f k8s/production/secret.yaml
kubectl apply -f k8s/production/postgres.yaml
kubectl -n nvyt-production rollout status deploy/postgres

# App + routing + jobs (web pods stay unhealthy until the first image is pushed)
kubectl apply -f k8s/production/service.yaml
kubectl apply -f k8s/production/hpa.yaml
kubectl apply -f k8s/production/ingress.yaml
kubectl apply -f k8s/production/uploads-ingress.yaml
kubectl apply -f k8s/production/cronjob-expire-orders.yaml
kubectl apply -f k8s/production/backup-cronjob.yaml
```

Build & push the first production image by pushing to `main` (the
`production-deploy.yml` workflow handles build → migrate → deploy), **or** for a
pre-cutover dry run, run the migration job + a deploy manually.

---

## 4. Data migration

All steps are in [`migrate-prod-data.sh`](./migrate-prod-data.sh). Each is small
and re-runnable. **Rehearse the full sequence once**, then repeat for the real
cutover during a maintenance window.

```sh
cd infra/migration

# Database: RDS → S3 → local → in-cluster Postgres
./migrate-prod-data.sh db-export      # pg_dump inside the Fargate task (ECS Exec) → S3
./migrate-prod-data.sh db-download     # S3 → ./db-dump
./migrate-prod-data.sh db-restore      # → nvyt-production/postgres (refuses non-empty DB)
./migrate-prod-data.sh db-verify       # exact per-table row-count diff (fails on mismatch)

# Uploads: S3 → Garage  (set the Garage key first)
export GARAGE_ACCESS_KEY_ID=...  GARAGE_SECRET_ACCESS_KEY=...
./migrate-prod-data.sh uploads-download
./migrate-prod-data.sh uploads-upload
./migrate-prod-data.sh uploads-verify
```

> The DB restore brings the full schema **and** the `__drizzle_migrations`
> tracking table from RDS, so no migration job is needed for the initial load;
> future deploys apply only new migrations.

---

## 5. Cutover

1. Confirm internally: `kubectl -n nvyt-production get pods` all Ready;
   `kubectl -n nvyt-production exec deploy/nvyt-web -- wget -qO- localhost:3000/api/health`.
2. **Final pass under a freeze:** put the app in maintenance / stop writes (keep
   one ECS task running so `db-export` can Exec), then re-run
   `db-export → db-download → db-restore → db-verify` so no rows are lost.
3. In **Cloudflare**, point `nvyt.app`, `www.nvyt.app`, and `uploads.nvyt.app` at
   the on-prem cluster (proxied; TLS terminated at Cloudflare — same mechanism as
   `staging.nvyt.app`). Lower TTL beforehand for a fast switch.
4. Watch: `kubectl -n nvyt-production logs -f deploy/nvyt-web` and
   `curl -I https://nvyt.app/api/health`.

PayMongo/PayPal **webhooks keep working** — the domain is unchanged — as long as
the prod webhook secrets in `nvyt-secrets` match the gateway dashboards.

### Rollback
Until AWS is destroyed, revert the Cloudflare DNS records to the ALB. The AWS
stack is still running, so traffic returns to Fargate immediately.

---

## 6. Post-cutover verification

- Log in; create a test event/order.
- Run a small **live** payment; confirm the PayMongo + PayPal webhooks hit
  `nvyt.app` and update the order.
- Upload an image; confirm it saves and renders via `uploads.nvyt.app`.
- `kubectl -n nvyt-production get cronjob` — confirm `expire-stale-orders` and
  `postgres-backup` schedules; trigger a manual run to validate:
  ```sh
  kubectl -n nvyt-production create job --from=cronjob/postgres-backup backup-test
  kubectl -n nvyt-production logs job/backup-test
  ```

---

## 7. Decommission AWS (after a soak period)

Only once production is stable on k3s for an agreed window.

```sh
cd infra/migration && ./migrate-prod-data.sh cleanup-remote   # remove S3 scratch dump

cd ../terraform
# INSURANCE: take a final RDS snapshot and a final S3 copy before destroying.
aws --profile nvyt-prod rds create-db-snapshot \
  --db-instance-identifier nvyt-production-postgres \
  --db-snapshot-identifier nvyt-final-pre-teardown

terraform destroy   # ECS, ALB, RDS, VPC/NAT, ECR, Secrets Manager, EventBridge
```

Then remove the now-dead GitHub Actions secrets: `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_ACCOUNT_ID`. Decide whether to keep the Route53
zone (not needed if DNS lives in Cloudflare).

---

## Backups (ongoing)

`k8s/production/backup-cronjob.yaml` dumps Postgres every 6h to
`s3://nvyt-db-backups` in Garage and keeps the last `BACKUP_KEEP` (28 ≈ 7 days).

Restore from a backup:
```sh
aws s3 cp s3://nvyt-db-backups/nvyt-YYYYMMDD-HHMMSS.sql.gz - \
  --endpoint-url http://192.168.0.20:30900 --region garage \
  | gunzip \
  | kubectl exec -i -n nvyt-production deploy/postgres -- psql -U nvyt -d nvyt
```

> Durability caveat: the cluster has 3 nodes, but Postgres and Garage each run
> as a single replica, and `nvyt-db-backups` lives in the same on-prem Garage.
> For real off-site durability, periodically replicate `nvyt-db-backups` off the
> cluster (e.g. `rclone` to remote storage).
