#!/usr/bin/env bash
set -eu
umask 077
script_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$script_dir"
if [ "${1:-}" != "--worker" ]; then
  nohup bash "$script_dir/run-install.sh" --worker > /root/garyhub-access-install.log 2>&1 < /dev/null &
  task_pid=$!
  tail --pid="$task_pid" -n +1 -f /root/garyhub-access-install.log
  wait "$task_pid"
else
  python3 -u install.py
fi
