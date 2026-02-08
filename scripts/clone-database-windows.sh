#!/bin/bash

# Database Clone Script (Windows Version)
# This script clones a production PostgreSQL database to a local/test database
# Usage: ./scripts/clone-database-windows.sh

set -e  # Exit on error

# PostgreSQL bin path for Windows
PG_BIN="/c/Program Files/PostgreSQL/18/bin"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Database Clone Script (Windows) ===${NC}\n"

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)
else
    echo -e "${RED}Error: .env file not found${NC}"
    exit 1
fi

# Production Database Credentials (from .env or override)
PROD_DB_HOST="${PROD_DB_HOST:-$DB_HOST}"
PROD_DB_PORT="${PROD_DB_PORT:-$DB_PORT}"
PROD_DB_NAME="${PROD_DB_NAME:-$DB_NAME}"
PROD_DB_USER="${PROD_DB_USER:-$DB_USER}"
PROD_DB_PASS="${PROD_DB_PASS:-$DB_PASS}"

# Local/Test Database Credentials
# You can override these by setting environment variables before running the script
LOCAL_DB_HOST="${LOCAL_DB_HOST:-127.0.0.1}"
LOCAL_DB_PORT="${LOCAL_DB_PORT:-5432}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-solar-test}"
LOCAL_DB_USER="${LOCAL_DB_USER:-postgres}"
LOCAL_DB_PASS="${LOCAL_DB_PASS:-root}"

# Temporary dump file
DUMP_FILE="db_dump_$(date +%Y%m%d_%H%M%S).sql"

echo -e "${YELLOW}Production Database:${NC}"
echo "  Host: $PROD_DB_HOST"
echo "  Port: $PROD_DB_PORT"
echo "  Database: $PROD_DB_NAME"
echo "  User: $PROD_DB_USER"
echo ""

echo -e "${YELLOW}Local/Test Database:${NC}"
echo "  Host: $LOCAL_DB_HOST"
echo "  Port: $LOCAL_DB_PORT"
echo "  Database: $LOCAL_DB_NAME"
echo "  User: $LOCAL_DB_USER"
echo ""

# Confirm before proceeding
read -p "Do you want to proceed with cloning? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}Operation cancelled.${NC}"
    exit 0
fi

echo -e "\n${GREEN}Step 1: Dumping production database...${NC}"
export PGPASSWORD="$PROD_DB_PASS"
"$PG_BIN/pg_dump.exe" -h "$PROD_DB_HOST" \
        -p "$PROD_DB_PORT" \
        -U "$PROD_DB_USER" \
        -d "$PROD_DB_NAME" \
        --no-owner \
        --no-acl \
        --clean \
        --if-exists \
        --verbose \
        -f "$DUMP_FILE"

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to dump production database${NC}"
    rm -f "$DUMP_FILE"
    exit 1
fi

echo -e "${GREEN}✓ Database dump created: $DUMP_FILE${NC}\n"

# Get dump file size
DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo -e "Dump file size: $DUMP_SIZE\n"

echo -e "${GREEN}Step 2: Dropping existing local database (if exists)...${NC}"
export PGPASSWORD="$LOCAL_DB_PASS"

# Terminate existing connections to the database
"$PG_BIN/psql.exe" -h "$LOCAL_DB_HOST" \
     -p "$LOCAL_DB_PORT" \
     -U "$LOCAL_DB_USER" \
     -d postgres \
     -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$LOCAL_DB_NAME' AND pid <> pg_backend_pid();" 2>/dev/null || true

# Drop database if it exists
"$PG_BIN/psql.exe" -h "$LOCAL_DB_HOST" \
     -p "$LOCAL_DB_PORT" \
     -U "$LOCAL_DB_USER" \
     -d postgres \
     -c "DROP DATABASE IF EXISTS \"$LOCAL_DB_NAME\";" 2>/dev/null || true

echo -e "${GREEN}Step 3: Creating new local database...${NC}"
"$PG_BIN/psql.exe" -h "$LOCAL_DB_HOST" \
     -p "$LOCAL_DB_PORT" \
     -U "$LOCAL_DB_USER" \
     -d postgres \
     -c "CREATE DATABASE \"$LOCAL_DB_NAME\";"

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to create local database${NC}"
    rm -f "$DUMP_FILE"
    exit 1
fi

echo -e "${GREEN}✓ Local database created${NC}\n"

echo -e "${GREEN}Step 4: Restoring dump to local database...${NC}"
"$PG_BIN/psql.exe" -h "$LOCAL_DB_HOST" \
     -p "$LOCAL_DB_PORT" \
     -U "$LOCAL_DB_USER" \
     -d "$LOCAL_DB_NAME" \
     -f "$DUMP_FILE" \
     --quiet

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to restore database${NC}"
    rm -f "$DUMP_FILE"
    exit 1
fi

echo -e "${GREEN}✓ Database restored successfully${NC}\n"

echo -e "${GREEN}Step 5: Cleaning up dump file...${NC}"
rm -f "$DUMP_FILE"

echo -e "\n${GREEN}=== Database clone completed successfully! ===${NC}"
echo -e "${GREEN}Local database '$LOCAL_DB_NAME' is now a clone of production database '$PROD_DB_NAME'${NC}\n"

# Unset password
unset PGPASSWORD
