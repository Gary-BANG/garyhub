#!/usr/bin/env bash
set -eu
umask 077
if [ "${1:-}" != "--worker" ]; then
  nohup bash /opt/garyhub-access/finish-migration.sh --worker > /root/garyhub-access-finish.log 2>&1 < /dev/null &
  task_pid=$!
  tail --pid="$task_pid" -n +1 -f /root/garyhub-access-finish.log
  wait "$task_pid"
else
  python3 -u /opt/garyhub-access/finish-migration.py --confirmed-working
fi
