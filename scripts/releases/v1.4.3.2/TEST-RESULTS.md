# GaryHub v1.4.3.2-r1 validation

Completed with real Node 20.20.2, locked Express/sqlite3 6.0.1, Chrome 151.0.7922.34 and PowerShell 7.4.6:

- Math/KaTeX unit tests: 7 passed. Existing Lab/Reading/Markdown/lecture/subscription/music regressions: 23 passed.
- Each actual capability variant passed 112 HTTP assertions and 61 browser assertions. Final asset response hashes were rechecked with 39 assertions per variant after the last rendering adjustment.
- The actual phase-6 deployment verifier passed against local Node services, real curl redirects/responses and real Node file hashing in both variants.
- Synthetic notices: 5 recipients in each variant, repeat publication idempotent.
- Shared updater/rollback checks: 35 passed. New adapter checks: 8 passed. Node/Python/JSON syntax, release manifest and PowerShell template parsing passed.
- Browser coverage includes screenshot notation, four LaTeX delimiters, code protection, unsafe content, fallback, run/submit rendering and answer gate, five players without library links, mobile/themes/languages, synthetic R2 audio CSP and tab leases.

Python worker responses in the browser tests are synthetic to exercise render paths; the WASM engine is unchanged. R2 media is synthetic; no private bucket was accessed. Details: docs/GARYHUB_V1_4_3_2_TESTS.md.

The final archive is checked once after building: outer/payload hashes, both capability baselines and target bytes, CMD line endings, PowerShell parsing and real source-import tests against a temporary local remote.

No production connection or real GitHub push/merge is performed. No local Docker daemon is available. The installer requires both services to be actual v1.4.3.1 and retains strict source, Compose, backup, rollback, HTTPS and release-notice gates.
