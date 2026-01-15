#!/bin/bash
# Run Drizzle migrations using psql

set -e

echo "=========================================="
echo "nvyt.app Database Migration Runner"
echo "=========================================="

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is required"
  exit 1
fi

# Parse DATABASE_URL
# Format: postgresql://user:pass@host:port/dbname
PGHOST=$(echo $DATABASE_URL | sed -E 's|.*@([^:]+):.*|\1|')
PGPORT=$(echo $DATABASE_URL | sed -E 's|.*:([0-9]+)/.*|\1|')
PGUSER=$(echo $DATABASE_URL | sed -E 's|.*://([^:]+):.*|\1|')
PGPASSWORD=$(echo $DATABASE_URL | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
PGDATABASE=$(echo $DATABASE_URL | sed -E 's|.*/([^?]+).*|\1|')

# URL decode password
PGPASSWORD=$(printf '%b' "${PGPASSWORD//%/\\x}")

export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

# Use SSL mode from environment or default to 'prefer' (works with both SSL and non-SSL)
export PGSSLMODE=${PGSSLMODE:-prefer}

echo "Host: $PGHOST:$PGPORT"
echo "SSL Mode: $PGSSLMODE"
echo "Database: $PGDATABASE"
echo "User: $PGUSER"
echo ""

# Test connection
echo "Testing connection..."
if ! psql -c "SELECT 1" > /dev/null 2>&1; then
  echo "ERROR: Cannot connect to database"
  echo "Trying with verbose output:"
  psql -c "SELECT 1" 2>&1 || true
  exit 1
fi
echo "Connected successfully!"
echo ""

# Create migrations table if not exists
psql -c "
CREATE TABLE IF NOT EXISTS \"__drizzle_migrations\" (
  id SERIAL PRIMARY KEY,
  hash TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
" > /dev/null

# Get applied migrations
APPLIED=$(psql -t -c "SELECT hash FROM \"__drizzle_migrations\"" | tr -d ' ' | tr -d '\n')

# Read journal and process migrations
JOURNAL="./migrations/meta/_journal.json"
if [ ! -f "$JOURNAL" ]; then
  echo "ERROR: Journal not found at $JOURNAL"
  exit 1
fi

# Process each migration from journal (using grep compatible with Alpine)
APPLIED_COUNT=0
SKIPPED_COUNT=0

# Extract tags from journal JSON (works with basic grep)
TAGS=$(grep '"tag":' "$JOURNAL" | sed 's/.*"tag": *"\([^"]*\)".*/\1/')

for TAG in $TAGS; do
  SQL_FILE="./migrations/${TAG}.sql"
  
  # Check if already applied
  if echo "$APPLIED" | grep -q "$TAG"; then
    echo "[SKIP] $TAG (already applied)"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi
  
  if [ ! -f "$SQL_FILE" ]; then
    echo "ERROR: Migration file not found: $SQL_FILE"
    exit 1
  fi
  
  echo "[RUN]  $TAG..."
  
  # Run migration file directly - psql handles multiple statements
  if ! psql -f "$SQL_FILE" > /dev/null 2>&1; then
    echo "ERROR running migration $TAG"
    echo "Trying with verbose output:"
    psql -f "$SQL_FILE" 2>&1 || true
    exit 1
  fi
  
  # Record migration
  psql -c "INSERT INTO \"__drizzle_migrations\" (hash, created_at) VALUES ('$TAG', $(date +%s)000)" > /dev/null
  
  echo "       $TAG applied successfully"
  APPLIED_COUNT=$((APPLIED_COUNT + 1))
done

echo ""
echo "=========================================="
echo "Migration complete!"
echo "  Applied: $APPLIED_COUNT"
echo "  Skipped: $SKIPPED_COUNT"
echo "=========================================="
