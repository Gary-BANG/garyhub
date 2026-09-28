#!/usr/bin/env bash
set -euo pipefail

archive=${1:?Source archive required}
stage2=garyhub-calendar-isolated-20260927-103502
stamp=$(date -u +%Y%m%d-%H%M%S)
work="/opt/garyhub-isolated-stage3-$stamp"
web="garyhub-calendar-stage3-$stamp"
worker="garyhub-reminder-stage3-$stamp"
image="garyhub-calendar-stage3:$stamp"

if [[ $(id -u) -ne 0 ]]; then echo "Run as root" >&2; exit 1; fi
docker inspect "$stage2" >/dev/null
source_data=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}' "$stage2")
if [[ -z "$source_data" || ! -f "$source_data/calendar.sqlite" ]]; then
  echo "Stage 2 isolated database mount not found" >&2; exit 1
fi
if docker ps --format '{{.Ports}}' | grep -q '127.0.0.1:3103->'; then
  echo "Port 3103 already in use" >&2; exit 1
fi
mkdir -m 700 -p "$work/source" "$work/data" "$work/data/captured-mail"
chmod 700 "$work/data" "$work/data/captured-mail"
tar -xzf "$archive" -C "$work/source"
if [[ ! -f "$work/source/calendar-app/package-lock.json" ]]; then
  echo "Source archive is incomplete" >&2; exit 1
fi

python3 - "$source_data/calendar.sqlite" "$work/data/calendar.sqlite" <<'PY'
import hashlib, json, sqlite3, sys
source, target = sys.argv[1:]
src = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
dst = sqlite3.connect(target)
src.backup(dst)
def users(conn):
    return conn.execute("SELECT id,username,password_hash,role,enabled,created_at FROM users ORDER BY id").fetchall()
before, after = users(src), users(dst)
if before != after or dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
    raise SystemExit("Database copy validation failed")
if dst.execute("PRAGMA foreign_key_check").fetchall():
    raise SystemExit("Database foreign key check failed")
required = {"tasks", "categories", "reminder_settings", "notifications", "email_verifications"}
tables = {r[0] for r in dst.execute("SELECT name FROM sqlite_master WHERE type='table'")}
if not required <= tables:
    raise SystemExit("Stage 2 unified schema is missing")
print("Copied isolated users:", len(after))
print("Copied isolated tasks:", dst.execute("SELECT COUNT(*) FROM tasks").fetchone()[0])
print("User fingerprint:", hashlib.sha256(json.dumps(after,ensure_ascii=False).encode()).hexdigest())
src.close(); dst.close()
PY
chmod 600 "$work/data/calendar.sqlite"

cleanup() {
  docker rm -f "$worker" "$web" >/dev/null 2>&1 || true
}
trap cleanup ERR
docker build -t "$image" "$work/source/calendar-app"
session_secret=$(openssl rand -hex 32)
email_pepper=$(openssl rand -hex 32)
docker run -d --name "$web" --restart unless-stopped \
  -p 127.0.0.1:3103:3000 -v "$work/data:/app/data" \
  -e PORT=3000 -e DATA_DIR=/app/data -e COOKIE_SECURE=false \
  -e SESSION_SECRET="$session_secret" -e EMAIL_CODE_PEPPER="$email_pepper" \
  -e REQUIRE_VERIFIED_EMAIL=true -e MAIL_CAPTURE_DIR=/app/data/captured-mail \
  "$image" >/dev/null
docker run -d --name "$worker" --restart unless-stopped --network none \
  -v "$work/data:/app/data" -e DATA_DIR=/app/data \
  -e MAIL_CAPTURE_DIR=/app/data/captured-mail \
  "$image" node reminder-worker.js >/dev/null
for _ in $(seq 1 20); do
  if curl -fsS --max-time 2 http://127.0.0.1:3103/health >/dev/null; then break; fi
  sleep 1
done
curl -fsS --max-time 2 http://127.0.0.1:3103/health >/dev/null
if [[ $(docker inspect -f '{{.State.Running}}' "$worker") != true ]]; then
  echo "Reminder worker did not start" >&2; exit 1
fi
trap - ERR
echo "STAGE 3 ISOLATED READY"
echo "Work directory: $work"
echo "Web container: $web"
echo "Reminder worker: $worker"
echo "Captured email: $work/data/captured-mail"
echo "Local-only URL on server: http://127.0.0.1:3103"
echo "Production and Stage 2 services were not changed."
