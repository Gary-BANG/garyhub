# Production acceptance update (2026-10-07)

The user confirmed Tools, Calendar-account Lab login, draft save/reload and exercise execution/grading/explanations. Real two-account manual isolation remains untested. The development-only results below are historical.

# Validation results

Passed in the development environment:

- Node syntax checks: backend, cloud adapter, modified Lab app, Tools animation, login script.
- Backend integration test with a mock Calendar server: unauthorized access rejected; authenticated users isolated; forged userId ignored; invalid origin and CSRF rejected; stale and simultaneous saves rejected; saved state survives service restart.
- Python deployment and maintenance scripts compile.
- Targeted Caddy transformation test removes only the Files basic_auth block and preserves adjacent sites and reverse proxy.

Not yet verified:

- Real Calendar integration and Docker/Caddy execution on production. The deployment script checks the observed image fingerprint and validates Caddy before changing it.
- Browser visual/end-to-end testing: the environment has no installed Chromium and the attempted browser download failed. The prepared UI smoke-test could not run. Check Tools on desktop/mobile, Calendar credentials on Lab, save/reload, two accounts, import/submit and an old backup restore after deployment.
- Installed Filebrowser CLI behavior: the maintenance script uses the exact installed image, works on a private snapshot first, and stops if the expected format is absent.

No production deployment, account lookup or password reset has been performed by the assistant.
