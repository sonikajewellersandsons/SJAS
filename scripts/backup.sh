#!/usr/bin/env bash
#
# One-command Supabase backup — schema + data dumps with timestamps.
#
# Requirements:
#   - supabase CLI installed (https://supabase.com/docs/guides/cli)
#   - `supabase link --project-ref <ref>` done once
#
# Usage:
#   ./scripts/backup.sh            # dump schema + data into backups/
#   ./scripts/backup.sh --schema   # schema only
#   ./scripts/backup.sh --data     # data only
#
# Restore hint:
#   Schema: run in Supabase SQL Editor (schema.sql is the canonical deploy path)
#   Data:   supabase db reset  →  psql "$SUPABASE_DB_URL" < backups/data-*.sql

set -euo pipefail

cd "$(dirname "$0")/.."

MODE="${1:-all}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT_DIR="backups"
mkdir -p "$OUT_DIR"

echo "==> Backing up ($MODE) to $OUT_DIR/$STAMP …"

if [[ "$MODE" == "all" || "$MODE" == "--schema" ]]; then
  echo "==> Dumping schema …"
  supabase db dump --schema public --file "$OUT_DIR/schema-$STAMP.sql" 2>&1 | tail -1 || true
fi

if [[ "$MODE" == "all" || "$MODE" == "--data" ]]; then
  echo "==> Dumping data …"
  supabase db dump --data-only --file "$OUT_DIR/data-$STAMP.sql" 2>&1 | tail -1 || true
fi

echo "==> Done."
ls -lh "$OUT_DIR"/"$STAMP"* 2>/dev/null || ls -lh "$OUT_DIR"
