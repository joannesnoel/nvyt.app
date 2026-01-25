#!/bin/bash
#
# Sync Production Database to Local
#
# This script pulls the database from production (AWS RDS) and restores it to local PostgreSQL.
#
# Prerequisites:
# - AWS CLI configured with nvyt-prod profile
# - psql client installed locally
# - Access to local PostgreSQL server (192.168.0.250)
#
# Usage:
#   ./scripts/sync-db-prod-to-local.sh [options]
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

# Production Configuration
AWS_PROFILE="nvyt-prod"
AWS_REGION="ap-southeast-1"
SECRETS_NAME="nvyt-production/app-secrets"

# Local Database Configuration
LOCAL_DB_HOST="192.168.0.250"
LOCAL_DB_PORT="5432"
LOCAL_DB_NAME="nvyt"
LOCAL_DB_USER="nvyt"
LOCAL_DB_PASS="nvyt"

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
echo -e "${BLUE}  NVYT Database Sync: Production → Local${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v aws &> /dev/null; then
  echo -e "${RED}Error: AWS CLI not installed${NC}"
  exit 1
fi

if ! command -v psql &> /dev/null; then
  echo -e "${RED}Error: psql client not installed${NC}"
  exit 1
fi

if ! command -v pg_dump &> /dev/null; then
  echo -e "${RED}Error: pg_dump not installed${NC}"
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

# Test local database access
if ! PGPASSWORD="$LOCAL_DB_PASS" psql -h "$LOCAL_DB_HOST" -p "$LOCAL_DB_PORT" -U "$LOCAL_DB_USER" -d postgres -c "SELECT 1" &> /dev/null; then
  echo -e "${RED}Error: Cannot connect to local PostgreSQL at $LOCAL_DB_HOST:$LOCAL_DB_PORT${NC}"
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
echo ""

# Confirmation
if [[ "$SKIP_CONFIRM" != "true" ]]; then
  echo -e "${RED}⚠️  WARNING: This will REPLACE all data in local database!${NC}"
  echo ""
  echo "Source: Production RDS"
  echo "Target: Local PostgreSQL ($LOCAL_DB_HOST:$LOCAL_DB_PORT/$LOCAL_DB_NAME)"
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
echo -e "${YELLOW}[1/3] Dumping production database...${NC}"
echo "      This may take a few minutes depending on database size."

# Since RDS is in private subnet, we need to dump via a method that has access
# Try direct connection first (works if you have VPN/bastion)
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

  echo -e "${GREEN}✓ Database dumped via ECS Exec${NC}"
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

# Step 2: Restore to local database
echo -e "${YELLOW}[2/3] Restoring to local database...${NC}"
echo "      Dropping and recreating database..."

export PGPASSWORD="$LOCAL_DB_PASS"

# Terminate existing connections
psql -h "$LOCAL_DB_HOST" -p "$LOCAL_DB_PORT" -U "$LOCAL_DB_USER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$LOCAL_DB_NAME' AND pid <> pg_backend_pid();" 2>/dev/null || true

# Drop and recreate database
dropdb -h "$LOCAL_DB_HOST" -p "$LOCAL_DB_PORT" -U "$LOCAL_DB_USER" --if-exists "$LOCAL_DB_NAME"
createdb -h "$LOCAL_DB_HOST" -p "$LOCAL_DB_PORT" -U "$LOCAL_DB_USER" "$LOCAL_DB_NAME"

# Restore
echo "      Restoring database (this may take a moment)..."
psql -h "$LOCAL_DB_HOST" -p "$LOCAL_DB_PORT" -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" -f "$DUMP_FILE" > /tmp/restore_output.log 2>&1 || true

# Check for critical errors (ignore notice/warning messages)
if grep -iE "ERROR:" /tmp/restore_output.log | grep -v "does not exist" | grep -v "already exists" > /dev/null 2>&1; then
  echo -e "${YELLOW}Warning: Some errors occurred during restore (may be non-critical):${NC}"
  grep -iE "ERROR:" /tmp/restore_output.log | head -5
fi
rm -f /tmp/restore_output.log

# Verify tables were created
TABLE_COUNT=$(psql -h "$LOCAL_DB_HOST" -p "$LOCAL_DB_PORT" -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')

if [[ -z "$TABLE_COUNT" || "$TABLE_COUNT" -lt 1 ]]; then
  echo -e "${RED}Error: No tables found after restore - restore may have failed${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Database restored successfully ($TABLE_COUNT tables)${NC}"
echo ""

# Step 3: Cleanup
echo -e "${YELLOW}[3/3] Cleaning up...${NC}"
rm -f "$DUMP_FILE"
echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""

# Done
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✓ Database sync complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Local database now contains production data."
echo ""
echo "Connection details:"
echo "  Host: $LOCAL_DB_HOST"
echo "  Port: $LOCAL_DB_PORT"
echo "  Database: $LOCAL_DB_NAME"
echo "  User: $LOCAL_DB_USER"
echo ""
