#!/bin/sh
# Daily PostgreSQL backup: one compressed dump per run in /backups, keeping
# the last BACKUP_KEEP_DAYS days. Runs once at start, then every
# BACKUP_INTERVAL_SECONDS (a day by default).
#
# Restore: gunzip -c backups/<file>.sql.gz | docker exec -i resume-screener-postgres psql -U screener -d screener
set -eu

: "${BACKUP_INTERVAL_SECONDS:=86400}"
: "${BACKUP_KEEP_DAYS:=7}"

# The same POSTGRES_* settings as the app and the database (.env.defaults, .env).
export PGHOST="${POSTGRES_HOST}" PGPORT="${POSTGRES_PORT:-5432}"
export PGUSER="${POSTGRES_USER}" PGPASSWORD="${POSTGRES_PASSWORD}"
export PGDATABASE="${POSTGRES_DB}"

while true; do
  file="/backups/${PGDATABASE}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  if pg_dump --no-owner --clean --if-exists | gzip > "${file}.partial"; then
    mv "${file}.partial" "${file}"
    echo "$(date -u) backup written: ${file}"
  else
    rm -f "${file}.partial"
    echo "$(date -u) backup FAILED" >&2
  fi
  find /backups -name '*.sql.gz' -type f -mtime "+${BACKUP_KEEP_DAYS}" -delete
  sleep "${BACKUP_INTERVAL_SECONDS}"
done
