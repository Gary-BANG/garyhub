# Unified Calendar isolated development

> Historical development procedure. The unified Calendar is now in production.
> Its active data lives under `/opt/garyhub-cutover-20260927-203135/data`;
> do not treat the old `/opt/my-services/calendar-app/data` as current.
> For the personal records candidate, do not execute the historical
> `--clear-legacy-data` examples below. That flag was only for the original
> unified Calendar cutover. The current migration creates new tables on an
> isolated copy and retains existing tasks.

This workflow is deliberately separate from `/opt/my-services` and the
production `calendar-app` container. It does not stop, replace, or mount the
production service.

## Local checks

From `calendar-app`:

```powershell
npm ci
npm test
npm run check
```

The migration tests use Node's in-memory SQLite implementation. They do not
read a production database and they do not need account passwords.

## Prepare a database copy

Create a consistent SQLite backup of the production database in a new,
timestamped test directory. Do not use `copy`, `cp`, or File Explorer against
a database that may be receiving writes. Use SQLite's online backup API during
the server rehearsal step.

Before migration, verify the copy:

- `PRAGMA integrity_check` returns `ok`;
- `PRAGMA foreign_key_check` returns no rows;
- user count, IDs, usernames, roles, enabled flags, creation times, and password
  hashes match the source database;
- the test directory is not `/opt/my-services/calendar-app/data`.

## Run the copy-only migration

The migration command requires an explicit copy confirmation and refuses the
known host production path:

```powershell
npm run migrate -- --database D:\garyhub-test\calendar.sqlite --confirm-isolated-copy --clear-legacy-data
```

`--clear-legacy-data` removes old Calendar events and an incompatible prototype
Tasks table. Use it only on the disposable copy during this phase.

The command logs only aggregate validation results and a combined user
fingerprint. It never logs passwords, individual password hashes, sessions,
verification codes, or secrets.

## Isolated server container

Copy `.env.isolated.example` to `.env.isolated`, select a brand-new test data
directory, and generate a test-only session secret. Then run:

```bash
docker compose --env-file .env.isolated -f docker-compose.isolated.yml build
docker compose --env-file .env.isolated -f docker-compose.isolated.yml run --rm \
  calendar-isolated npm run migrate -- \
  --database /app/data/calendar.sqlite \
  --confirm-isolated-copy --clear-legacy-data
docker compose --env-file .env.isolated -f docker-compose.isolated.yml up -d
```

The service binds only to `127.0.0.1:3102`. This avoids the existing test
container on `127.0.0.1:3101` and prevents public exposure. Access it through an
SSH tunnel when browser testing begins.

## Safety boundary during the original rehearsal

This historical isolated procedure never migrated the production database.
The later production cutover was performed separately with backups, automated
tests, manual verification, and an explicit deployment approval.
