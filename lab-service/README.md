> Production acceptance completed on 2026-10-07: Tools navigation, Calendar-account login, draft persistence and exercise execution/grading/explanations were verified by the user. Historical first-install/maintenance instructions below refer to the original release bundle; those scripts are not included in this source import. The active Files database is /opt/my-services/filebrowser/database.db. Use ../docs/DEPLOYMENT_20261007.md and ../docs/BACKUP_VERIFICATION_20261007.md as the current deployment records.

# GaryHub Tools + ECE 470 Lab — 2026-10-07 v1

This is a deployment candidate. It has not been executed against production by the assistant.

## What changes

- New `garyhub-lab` service on the existing private Docker network. No public application port.
- Tools landing page at `tools.garyhub.uk`; Lab at `lab.garyhub.uk`.
- Main homepage Tools menu becomes a direct link.
- Calendar's existing `/api/csrf`, `/api/login`, `/api/me`, `/api/logout` authenticate Lab requests. Calendar is not rebuilt or restarted. Accounts and passwords are shared; sessions are host-only, so each site has its own sign-in.
- User data stored in `/opt/my-services/lab-data/user-<id>.json`, keyed only by Calendar-authenticated identity. No password copy is stored by Lab. Include this directory in ongoing backups.
- Versioned writes reject stale saves from other tabs/devices. IndexedDB cache is scoped by account. Wait for “已保存到服务器” before switching devices. If a conflict occurs, export the local backup before loading the server version.
- Original Lab runtime, NumPy, Modern Robotics, question imports, explanations and examples are included. Python still runs in the browser. The server only stores the workspace.
- Existing Calendar sessions retain Calendar's existing revocation behavior. This release does not add single sign-on or change Calendar's authentication implementation.

## First deployment

1. Add DNS-only A records `tools` and `lab` with the same IPv4 as the current `garyhub.uk` A record. Remove any conflicting AAAA records for these new names. Do not change existing records.
2. Upload `garyhub-lab-update.tar.gz` to `/root/` using SCP/SFTP.
3. Extract to a new release directory, then run `python3 lab-service/deploy/install.py` as root.

The installer verifies the observed Calendar image, requires that the Lab container/domains are not already configured, validates the homepage target, builds from the existing local image, starts the new container, validates Caddy before reload, edits the mounted file in place, and checks HTTPS responses. It does not read private environment values or touch Calendar data.

Backups are under `/opt/garyhub-lab-backup-<UTC timestamp>/`. Failure after cutover triggers restoration of homepage and Caddy and removes only the new container. New Lab data is retained. Manual rollback command is printed upon success. Manual rollback refuses if the homepage/Caddy changed subsequently, to avoid clobbering later changes; review a merge in that case.

No `git pull` is performed on `/opt/my-services`. No GitHub push is included. This package's source should later be copied into the development repository's `lab-service/` directory and committed; do not commit private production backups, environment files or databases.

## Files account maintenance (separate)

Run `python3 lab-service/deploy/files-maintenance.py` to show account names. It briefly stops only Filebrowser, copies its database consistently, and restarts it before querying a private snapshot using its exact installed image. Hashes are not printed. The database cannot reveal the original plaintext password. A hidden interactive prompt optionally resets a selected account's password. Press Enter to skip reset. A reset requires another short Filebrowser stop; it restores the saved database if the CLI operation fails.

The original upstream Filebrowser repository now reports that it is unmaintained and recommends external authentication. Keeping the outer layer is recommended. To explicitly remove it despite that tradeoff, run with `--remove-outer`; the script requires recognizing inner `json` authentication and typing `REMOVE`. Only the Files basic_auth block is removed. Private backups remain in `/opt/garyhub-files-backup-<timestamp>/`. Calendar, RSS and other authentication blocks are not modified. If the installed Filebrowser CLI/config differs from the known format, the script stops rather than guessing.

Upstream reference: https://github.com/filebrowser/filebrowser

## Migrate old practice data

Export a complete backup from the old website or localhost. Sign into the new Lab, open 我的题库 → 恢复备份. This replaces only the currently signed-in account's workspace. Wait for server-save success. The new origin cannot automatically read the old origin's browser storage.

## Tests and limitations

- `node --test test/server.test.cjs`: unauthenticated access, user isolation (including forged userId), CSRF, origin rejection, stale revision rejection, concurrent writes and restart persistence, using a mock Calendar API.
- Python syntax checks and targeted Files Caddy-block removal test.
- Browser/production results are recorded separately in VALIDATION.md.
- Limits: whole-workspace JSON up to 24 MiB per write; single Lab process only. This format is suited to personal/small-group use, not large uploads or horizontal scaling.
- Source base: Gary-BANG/garyhub commit d757085; deployment image matches the user's inspected sha256:45c2b8d289bbec765d28f2313f030c8630d9b3c8ea750551eed7ef9820da1202.
