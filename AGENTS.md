

<!-- GARYHUB_RELEASE_POLICY_20261011 -->
Every user-visible production update must publish unread in-app release notes to all approved, enabled accounts, including administrators. Follow docs/RELEASE_POLICY.md and verify recipient counts and idempotency. Deployment state and current effective Compose paths are recorded in /opt/my-services/garyhub-active-deployment.json. Never commit private Compose files, runtime data or server backups.

## GaryHub update workflow

For maintenance and upgrade requests, read `docs/PROJECT_CONTEXT.md` and
`docs/UPDATE_WORKFLOW.md` first. Read `releases/current.json` for the source
release and its manifest. These files describe source state; production state
must come from server evidence. Do not assume a merged PR has been deployed.

Use `python scripts/updater/manage.py context` for a compact project snapshot,
then `plan --base <reviewed-commit>` to identify changed modules and checks.
Read only relevant source and bounded failure logs. Do not print vendored bundles,
whole historical release directories, secrets or production data into context.

Reuse `scripts/updater/` entry points and reviewed release adapters. Do not copy
an entire previous release directory or globally replace version strings to make
a new release. A future release requires its own small manifest and reviewed
adapter/configuration changes; never point a new version at an old hardcoded
installer. Run checks needed by the actual changed behavior, then build once.
Repeat a check only after a related change, failure or unresolved concern.

Update the project context, release manifest and validation record together.
Keep source-prepared, locally-validated, GitHub-merged and production-verified
states distinct. A documentation/tooling-only PR does not bump the running app
version or publish production release notices. Existing production release
policy above remains mandatory for user-visible production deployments.

Deliver an upgrade ZIP with install and rollback entry points, or a GitHub push
ZIP when requested. GitHub push packages must protect existing work, push a
review branch without force, and leave main merging to the maintainer.
