# GaryHub v2.0.0.0-r2 validation

r1 stopped on the server in phase 3 (isolated checks, before any backup or switch): `companion-http.cjs` expected 404 for `/admin.html` on the homepage host, but admin pages are sign-in gated before the homepage list and a guest receives a 302 to the login page. That is existing, intended behaviour. r2 checks existing non-listed Tools files (`/tools-dock.js`, `/hub.js`, including dot-segment escapes from `/companion/`) for 404 and the admin page for a 302; the phase-6 HTTPS verifier was corrected the same way. Production was not changed by r1.

Run on Windows 11 with Python 3.10, Git 2.52 and the Claude desktop browser (Chromium). **Node.js was not installed on the build machine**, so no `node --test` suite and no local Calendar/Lab server ran.

- Intent engine: 67 regression checkpoints (58 single messages in Chinese and English, 4 multi-turn conversations) passed in the browser against the shipped `brain.js`/`knowledge.js`. Every catalogue phrase reaches its own tool; no admin or subscriber tool is suggested to guests or standard accounts; all five voice packs are complete.
- Character manifest and rig: Milu geometry inside the view box, all animated layers present, no scripts, embedded documents or external references in the SVG.
- Motion: free placement, gravity drop with parachute, landing, recovery and idle states run end to end; key poses were rendered and inspected. Click-to-chat, panel placement, Escape/focus return, arrow keys, Home reset and the missing-artwork fallback passed.
- Pages: Tools and the Calendar ledger page were exercised from static copies of each service's `public/` folder at desktop and narrow widths, in light and dark themes: loader order, full/collapsed defaults, settings menu, shared cookie, edge-tab restore and tool cards.
- Wiring: both services' companion bundles and tool catalogues are byte-identical; 11 pages reference one asset version; sign-in pages are untouched.
- Release tooling: updater unit tests and `manage.py check` results are recorded in docs/GARYHUB_V2_0_0_0_TESTS.md. Asset hashes were computed from committed Git blobs (LF), and the three unchanged protected Tools pages match the v1.4.3.2 values.

Not run locally: the Node service suites, `companion-http.cjs` and the other isolated HTTP checks, and the phase-6 HTTPS verifier. The installer runs the isolated checks inside both new images with synthetic accounts before any switch, and stops without deploying if one fails. No production connection or real GitHub push/merge is performed.
