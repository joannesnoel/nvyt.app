#!/bin/bash
#
# Sync Production Database to Staging
#
# This script pulls the database from production (AWS RDS) and restores it to staging (Kubernetes).
#
# Prerequisites:
# - AWS CLI configured with nvyt-prod profile
# - kubectl configured with access to staging cluster
# - Session Manager plugin installed (for AWS SSM)
#
# Usage:
#   ./scripts/sync-db-prod-to-staging.sh [options]
#
# Options:
#   --skip-confirm    Skip confirmation prompt
#   --tables TABLE    Only sync specific tables (comma-separated)
#   --exclude-tables  Exclude specific tables (comma-separated)
#   --data-only       Only sync data, not schema
#   --schema-only     Only sync schema, not data
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AWS_PROFILE="nvyt-prod"
AWS_REGION="ap-southeast-1"
SECRETS_NAME="nvyt-production/app-secrets"
RDS_IDENTIFIER="nvyt-production-postgres"

K8S_NAMESPACE="nvyt-staging"
K8S_POSTGRES_LABEL="app=postgres"
STAGING_DB_NAME="nvyt"
STAGING_DB_USER="nvyt"

DUMP_FILE="/tmp/nvyt_prod_dump_$(date +%Y%m%d_%H%M%S).sql"

# Parse arguments
SKIP_CONFIRM=false
TABLES=""
EXCLUDE_TABLES=""
DATA_ONLY=false
SCHEMA_ONLY=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-confirm)
      SKIP_CONFIRM=true
      shift
      ;;
    --tables)
      TABLES="$2"
      shift 2
      ;;
    --exclude-tables)
      EXCLUDE_TABLES="$2"
      shift 2
      ;;
    --data-only)
      DATA_ONLY=true
      shift
      ;;
    --schema-only)
      SCHEMA_ONLY=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  NVYT Database Sync: Production → Staging${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v aws &> /dev/null; then
  echo -e "${RED}Error: AWS CLI not installed${NC}"
  exit 1
fi

if ! command -v kubectl &> /dev/null; then
  echo -e "${RED}Error: kubectl not installed${NC}"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo -e "${RED}Error: jq not installed${NC}"
  exit 1
fi

# Test AWS access
if ! aws sts get-caller-identity --profile "$AWS_PROFILE" &> /dev/null; then
  echo -e "${RED}Error: Cannot authenticate with AWS profile '$AWS_PROFILE'${NC}"
  echo "Run: aws configure --profile $AWS_PROFILE"
  exit 1
fi

# Test kubectl access
if ! kubectl get namespace "$K8S_NAMESPACE" &> /dev/null; then
  echo -e "${RED}Error: Cannot access Kubernetes namespace '$K8S_NAMESPACE'${NC}"
  exit 1
fi

echo -e "${GREEN}✓ All prerequisites met${NC}"
echo ""

# Get production database URL from Secrets Manager
echo -e "${YELLOW}Fetching production database credentials...${NC}"
PROD_DB_URL=$(aws secretsmanager get-secret-value \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --secret-id "$SECRETS_NAME" \
  --query 'SecretString' \
  --output text | jq -r '.DATABASE_URL')

if [[ -z "$PROD_DB_URL" || "$PROD_DB_URL" == "null" ]]; then
  echo -e "${RED}Error: Could not retrieve DATABASE_URL from Secrets Manager${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Retrieved production database credentials${NC}"

# Get staging pod
echo -e "${YELLOW}Finding staging PostgreSQL pod...${NC}"
STAGING_POD=$(kubectl get pods -n "$K8S_NAMESPACE" -l "$K8S_POSTGRES_LABEL" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [[ -z "$STAGING_POD" ]]; then
  echo -e "${RED}Error: No PostgreSQL pod found in namespace '$K8S_NAMESPACE' with label '$K8S_POSTGRES_LABEL'${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Found staging pod: $STAGING_POD${NC}"
echo ""

# Confirmation
if [[ "$SKIP_CONFIRM" != "true" ]]; then
  echo -e "${RED}⚠️  WARNING: This will REPLACE all data in staging database!${NC}"
  echo ""
  echo "Source: Production RDS (nvyt-production-postgres)"
  echo "Target: Staging K8s ($STAGING_POD)"
  echo ""
  read -p "Are you sure you want to continue? (yes/no): " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "Aborted."
    exit 0
  fi
  echo ""
fi

# Build pg_dump options
PG_DUMP_OPTS="--no-owner --no-acl --clean --if-exists"

if [[ "$DATA_ONLY" == "true" ]]; then
  PG_DUMP_OPTS="$PG_DUMP_OPTS --data-only"
elif [[ "$SCHEMA_ONLY" == "true" ]]; then
  PG_DUMP_OPTS="$PG_DUMP_OPTS --schema-only"
fi

if [[ -n "$TABLES" ]]; then
  IFS=',' read -ra TABLE_ARRAY <<< "$TABLES"
  for table in "${TABLE_ARRAY[@]}"; do
    PG_DUMP_OPTS="$PG_DUMP_OPTS --table=$table"
  done
fi

if [[ -n "$EXCLUDE_TABLES" ]]; then
  IFS=',' read -ra EXCLUDE_ARRAY <<< "$EXCLUDE_TABLES"
  for table in "${EXCLUDE_ARRAY[@]}"; do
    PG_DUMP_OPTS="$PG_DUMP_OPTS --exclude-table=$table"
  done
fi

# Step 1: Dump production database
echo -e "${YELLOW}[1/4] Dumping production database...${NC}"
echo "      This may take a few minutes depending on database size."

# Since RDS is in private subnet, we need to dump via a method that has access
# Option A: If you have a bastion or can run pg_dump locally with VPN
# Option B: Use ECS Exec to run pg_dump from an ECS task

# First, try direct connection (works if you have VPN/bastion)
if pg_dump "$PROD_DB_URL" $PG_DUMP_OPTS > "$DUMP_FILE" 2>/dev/null; then
  echo -e "${GREEN}✓ Database dumped successfully (direct connection)${NC}"
else
  echo -e "${YELLOW}  Direct connection failed, trying via ECS Exec...${NC}"

  # Get a running ECS task
  CLUSTER_NAME="nvyt-production-cluster"
  SERVICE_NAME="nvyt-production-web"

  TASK_ARN=$(aws ecs list-tasks \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --cluster "$CLUSTER_NAME" \
    --service-name "$SERVICE_NAME" \
    --desired-status RUNNING \
    --query 'taskArns[0]' \
    --output text)

  if [[ -z "$TASK_ARN" || "$TASK_ARN" == "None" ]]; then
    echo -e "${RED}Error: No running ECS tasks found${NC}"
    echo ""
    echo "Alternative: Run pg_dump manually from a machine with database access:"
    echo "  pg_dump \"\$DATABASE_URL\" --no-owner --no-acl > dump.sql"
    exit 1
  fi

  TASK_ID=$(echo "$TASK_ARN" | awk -F'/' '{print $NF}')
  echo "      Using ECS task: $TASK_ID"

  # Run pg_dump via ECS Exec - save to file in container, then copy via S3
  S3_BUCKET="nvyt-uploads-prod"
  S3_KEY="db-dumps/prod_dump_$(date +%Y%m%d_%H%M%S).sql"

  echo "      Running pg_dump in ECS container and uploading to S3..."

  # Use sh instead of bash (container may be minimal/distroless)
  # Run pg_dump, save to temp file, upload to S3, cleanup
  aws ecs execute-command \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --cluster "$CLUSTER_NAME" \
    --task "$TASK_ID" \
    --container "web" \
    --interactive \
    --command "sh -c 'pg_dump \"\$DATABASE_URL\" $PG_DUMP_OPTS > /tmp/db_dump.sql && aws s3 cp /tmp/db_dump.sql s3://$S3_BUCKET/$S3_KEY && rm /tmp/db_dump.sql && echo DUMP_UPLOAD_SUCCESS'" 2>&1 | tee /tmp/ecs_output.log

  # Check if upload succeeded
  if ! grep -q "DUMP_UPLOAD_SUCCESS" /tmp/ecs_output.log; then
    echo -e "${RED}Error: Failed to dump database via ECS Exec${NC}"
    echo ""
    echo "ECS Exec may not be enabled or S3 upload failed. To enable ECS Exec:"
    echo "  1. Update your ECS service with --enable-execute-command"
    echo "  2. Ensure task role has ssmmessages and S3 permissions"
    echo ""
    echo "Alternative: Run pg_dump manually:"
    echo "  pg_dump \"\$DATABASE_URL\" --no-owner --no-acl --clean --if-exists > dump.sql"
    rm -f /tmp/ecs_output.log
    exit 1
  fi
  rm -f /tmp/ecs_output.log

  echo "      Downloading dump from S3..."
  aws s3 cp "s3://$S3_BUCKET/$S3_KEY" "$DUMP_FILE" --profile "$AWS_PROFILE" --region "$AWS_REGION"

  if [[ $? -ne 0 ]]; then
    echo -e "${RED}Error: Failed to download dump from S3${NC}"
    exit 1
  fi

  # Cleanup S3
  aws s3 rm "s3://$S3_BUCKET/$S3_KEY" --profile "$AWS_PROFILE" --region "$AWS_REGION" 2>/dev/null || true

  echo "      S3 dump size: $(numfmt --to=iec $S3_SIZE 2>/dev/null || echo $S3_SIZE bytes)"

  # Download from S3
  echo "      Downloading from S3..."
  aws s3 cp \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    "s3://$S3_BUCKET/$S3_KEY" "$DUMP_FILE"

  # Clean up S3
  aws s3 rm \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    "s3://$S3_BUCKET/$S3_KEY" 2>/dev/null || true

  echo -e "${GREEN}✓ Database dumped via ECS/S3${NC}"
fi

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "      Dump size: $DUMP_SIZE"

# Validate dump file contains actual SQL
if ! grep -q "CREATE TABLE" "$DUMP_FILE"; then
  echo -e "${RED}Error: Dump file appears invalid (no CREATE TABLE statements found)${NC}"
  echo "      The dump may have failed or been corrupted."
  rm -f "$DUMP_FILE"
  exit 1
fi
echo -e "${GREEN}✓ Dump file validated${NC}"

# Filter out PostgreSQL 17+ settings that don't exist in older versions
echo "      Filtering incompatible PostgreSQL settings..."
sed -i 's/SET transaction_timeout = 0;//g' "$DUMP_FILE"
echo -e "${GREEN}✓ Dump file filtered${NC}"
echo ""

# Step 2: Copy dump to staging pod
echo -e "${YELLOW}[2/4] Copying dump to staging pod...${NC}"
kubectl cp "$DUMP_FILE" "$K8S_NAMESPACE/$STAGING_POD:/tmp/prod_dump.sql"
echo -e "${GREEN}✓ Dump copied to staging pod${NC}"
echo ""

# Step 3: Restore to staging database
echo -e "${YELLOW}[3/4] Restoring to staging database...${NC}"
echo "      Dropping and recreating database..."

# Get the staging postgres password
STAGING_DB_PASS=$(kubectl get secret nvyt-db-secrets -n "$K8S_NAMESPACE" -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)

kubectl exec -n "$K8S_NAMESPACE" "$STAGING_POD" -- sh -c "
  export PGPASSWORD='$STAGING_DB_PASS'

  # Terminate existing connections
  psql -U $STAGING_DB_USER -d postgres -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$STAGING_DB_NAME' AND pid <> pg_backend_pid();\" 2>/dev/null || true

  # Drop and recreate database
  dropdb -U $STAGING_DB_USER --if-exists $STAGING_DB_NAME
  createdb -U $STAGING_DB_USER $STAGING_DB_NAME

  # Restore (continue on errors for minor compatibility issues)
  psql -U $STAGING_DB_USER -d $STAGING_DB_NAME -f /tmp/prod_dump.sql
"

if [[ $? -ne 0 ]]; then
  echo -e "${RED}Error: Failed to restore database${NC}"
  exit 1
fi

# Verify tables were created
TABLE_COUNT=$(kubectl exec -n "$K8S_NAMESPACE" "$STAGING_POD" -- bash -c "
  export PGPASSWORD='$STAGING_DB_PASS'
  psql -U $STAGING_DB_USER -d $STAGING_DB_NAME -t -c \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';\"
" | tr -d ' ')

if [[ -z "$TABLE_COUNT" || "$TABLE_COUNT" -lt 1 ]]; then
  echo -e "${RED}Error: No tables found after restore - restore may have failed${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Database restored successfully ($TABLE_COUNT tables)${NC}"
echo ""

# Step 4: Cleanup
echo -e "${YELLOW}[4/4] Cleaning up...${NC}"
kubectl exec -n "$K8S_NAMESPACE" "$STAGING_POD" -- rm -f /tmp/prod_dump.sql
rm -f "$DUMP_FILE"
echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""

# Done
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✓ Database sync complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Staging database now contains production data."
echo ""
echo -e "${YELLOW}Note: You may need to restart the staging application:${NC}"
echo "  kubectl rollout restart deployment/nvyt-web -n $K8S_NAMESPACE"
echo ""
