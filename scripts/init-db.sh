#!/usr/bin/env bash
#
# Initialize PostgreSQL databases, migration user, and app service accounts
# for rapi-bot dev and prod environments.
#
# Usage:
#   ./scripts/init-db.sh                          # Interactive (prompts for passwords)
#   PGHOST=localhost PGPORT=5432 ./scripts/init-db.sh  # With custom connection
#
# Prerequisites:
#   - PostgreSQL server running
#   - psql client installed
#   - Connection as a superuser (postgres) or user with CREATEROLE + CREATEDB
#
# This script creates:
#   - rapibot_migration  (migration user — owns schemas, runs DDL)
#   - rapibot_dev        (dev app user — DML only on rapibot_dev database)
#   - rapibot_prod       (prod app user — DML only on rapibot_prod database)
#   - rapibot_dev        (dev database)
#   - rapibot_prod       (prod database)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log()   { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; exit 1; }

# Connection defaults (connect as superuser)
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"

# Generate secure random passwords if not provided
generate_password() {
    openssl rand -base64 24 | tr -d '/+=' | head -c 32
}

echo ""
echo "=========================================="
echo "  Rapi-Bot PostgreSQL Initialization"
echo "=========================================="
echo ""
echo "Connecting to PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}"
echo ""

# Check psql is available
command -v psql >/dev/null 2>&1 || error "psql not found. Install PostgreSQL client first."

# Check connection
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -c "SELECT 1;" >/dev/null 2>&1 || \
    error "Cannot connect to PostgreSQL. Check PGHOST, PGPORT, PGUSER, and PGPASSWORD."

log "Connected to PostgreSQL successfully"

# Generate passwords
MIGRATION_PASS="${RAPIBOT_MIGRATION_PASS:-$(generate_password)}"
DEV_PASS="${RAPIBOT_DEV_PASS:-$(generate_password)}"
PROD_PASS="${RAPIBOT_PROD_PASS:-$(generate_password)}"

# ── Create Roles ──

log "Creating migration user: rapibot_migration"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=0 <<SQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rapibot_migration') THEN
        CREATE ROLE rapibot_migration WITH LOGIN PASSWORD '${MIGRATION_PASS}';
        RAISE NOTICE 'Created role rapibot_migration';
    ELSE
        ALTER ROLE rapibot_migration WITH PASSWORD '${MIGRATION_PASS}';
        RAISE NOTICE 'Updated password for rapibot_migration';
    END IF;
END
\$\$;
SQL

log "Creating dev app user: rapibot_dev"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=0 <<SQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rapibot_dev') THEN
        CREATE ROLE rapibot_dev WITH LOGIN PASSWORD '${DEV_PASS}';
        RAISE NOTICE 'Created role rapibot_dev';
    ELSE
        ALTER ROLE rapibot_dev WITH PASSWORD '${DEV_PASS}';
        RAISE NOTICE 'Updated password for rapibot_dev';
    END IF;
END
\$\$;
SQL

log "Creating prod app user: rapibot_prod"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=0 <<SQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rapibot_prod') THEN
        CREATE ROLE rapibot_prod WITH LOGIN PASSWORD '${PROD_PASS}';
        RAISE NOTICE 'Created role rapibot_prod';
    ELSE
        ALTER ROLE rapibot_prod WITH PASSWORD '${PROD_PASS}';
        RAISE NOTICE 'Updated password for rapibot_prod';
    END IF;
END
\$\$;
SQL

# ── Create Databases ──

log "Creating dev database: rapibot_dev"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=0 <<SQL
SELECT 'CREATE DATABASE rapibot_dev OWNER rapibot_migration'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'rapibot_dev')\gexec
SQL

log "Creating prod database: rapibot_prod"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=0 <<SQL
SELECT 'CREATE DATABASE rapibot_prod OWNER rapibot_migration'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'rapibot_prod')\gexec
SQL

# ── Grant Permissions ──

for DB in rapibot_dev rapibot_prod; do
    if [ "$DB" = "rapibot_dev" ]; then
        APP_USER="rapibot_dev"
    else
        APP_USER="rapibot_prod"
    fi

    log "Granting permissions on ${DB} to ${APP_USER}"
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB" -v ON_ERROR_STOP=0 <<SQL
-- Migration user owns the schema and can create/alter tables
GRANT ALL PRIVILEGES ON DATABASE ${DB} TO rapibot_migration;

-- App user gets DML access (SELECT, INSERT, UPDATE, DELETE)
GRANT CONNECT ON DATABASE ${DB} TO ${APP_USER};
GRANT USAGE ON SCHEMA public TO ${APP_USER};

-- Grant DML on all existing tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_USER};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_USER};

-- Auto-grant DML on future tables created by migration user
ALTER DEFAULT PRIVILEGES FOR ROLE rapibot_migration IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_USER};
ALTER DEFAULT PRIVILEGES FOR ROLE rapibot_migration IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO ${APP_USER};
SQL
done

# ── Output Connection Strings ──

echo ""
echo "=========================================="
echo "  Setup Complete"
echo "=========================================="
echo ""
echo "Connection strings (save these securely):"
echo ""
echo -e "${YELLOW}Migration user (for drizzle-kit migrations):${NC}"
echo "  DEV:  postgresql://rapibot_migration:${MIGRATION_PASS}@${PGHOST}:${PGPORT}/rapibot_dev"
echo "  PROD: postgresql://rapibot_migration:${MIGRATION_PASS}@${PGHOST}:${PGPORT}/rapibot_prod"
echo ""
echo -e "${YELLOW}App service user (for DATABASE_URL):${NC}"
echo "  DEV:  postgresql://rapibot_dev:${DEV_PASS}@${PGHOST}:${PGPORT}/rapibot_dev"
echo "  PROD: postgresql://rapibot_prod:${PROD_PASS}@${PGHOST}:${PGPORT}/rapibot_prod"
echo ""
echo -e "${YELLOW}Permissions:${NC}"
echo "  rapibot_migration — DDL (CREATE, ALTER, DROP tables) + DML"
echo "  rapibot_dev/prod  — DML only (SELECT, INSERT, UPDATE, DELETE)"
echo ""
warn "Add DATABASE_URL to your .env file and GitHub Secrets."
warn "Add MIGRATION_DATABASE_URL to GitHub Secrets for CI migrations."
