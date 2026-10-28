# GaryHub v1.4.3.1-r3 validation

r3: 15 new stateful rollback/index tests pass, reproducing rollback -> stale-path failure -> verified reconciliation -> strict retry. Future automatic/manual rollback now records the actual Compose path and verifies it. Recovery rejects unknown package/state, later images/config/index/Caddy changes, concurrent changes, missing/symlink evidence; interrupted audited repair can resume. Shared core tests: 35 passed. App payload is unchanged. Two Node capability variants each still pass 71 HTTP assertions, notice checks and the actual local phase-6 verifier. r2 stopped in phase 1; r3 server recovery/install remains unverified.

r2: each capability variant passes 23 new real HTTP assertions (71 total) and the actual phase-6 verifier against local Node services with real curl responses and Node file hashing. This reproduces the r1 redirect/body mismatch and verifies the protected HTML without removing authentication. Adapter checks expand from 5 to 8. Application/UI bytes and shared updater logic are unchanged; prior browser and business results below remain applicable.

User-supplied r1 output reports rollback to v1.4.3.0 after phase-6 validation failed, before notices were published. r2 production installation remains unverified.

Completed locally with real Node 20.20.2, locked Express/sqlite3 6.0.1 and Chromium 151:

- Markdown ZIP/lecture-loader unit tests: 14 passed.
- Two actual capability variants, with and without TOTP: each passed 48 HTTP assertions, 47 browser assertions, and release-notice recipient count 5 plus repeat-publication idempotency.
- Browser coverage: desktop/mobile, Chinese/English, light/dark, icon navigation, actual new tab, selected note/images, nested and repeated headings, outline reveal, source edit state, math/tables, ZIP document switching, unsafe content and account changes. No page errors or horizontal overflow.
- Existing Lab/Reading regressions: 3 passed. Shared updater core checks: 20 passed. Release-specific deployment/configuration checks: 5 passed.
- Modified Node/Python syntax, source manifest, document links and PowerShell installer-template parsing passed.

The final ZIP is checked after its single build: outer/payload checksums, both source baselines and target variants, CMD entry points, PowerShell parsing and isolated source-import tests using a temporary local remote. The final outcome and external ZIP hash accompany delivery.

No production connection or real GitHub push/merge was performed. There is no local Docker daemon; actual image build, switch, rollback, HTTPS and production notice counts remain installer checks. The installer requires both running services to be v1.4.3.0 and retains all current records, music/R2 settings and host integrations.

Full scope: docs/GARYHUB_V1_4_3_1_TESTS.md in the source package.
