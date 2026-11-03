# GaryHub v2.2.0.0-r2 validation

r1 stopped in phase 3 on the server: `sites-http.cjs` requires the Elsewhere page to reference `?v=<release>` and the page still said 2.1.0.0; nothing was deployed. r2 bumps those four references. The local phase-3 stand-in now copies every test input from the release config and runs all seven isolated checks in order: useful 29, study 19, asset-response 45, music 25, companion 301, sites 59, assistant 36 — all pass, with notices to 5 synthetic accounts and deduplication.

Run on Windows 11 with Python 3.10 and Git 2.52; Node suites ran in WSL Ubuntu 22.04 on official Node v20.20.2 (servers, syntax) and v22.23.4 (tests that use `node:sqlite`), with calendar-app dependencies from `npm ci --build-from-source`.

- calendar-app `node --test`: 86 pass, 0 fail. The new assistant suite covers:
  - proposals only, until the owner confirms (no confirmation by another account);
  - applies once; cancel blocks a later confirm;
  - delete via `list_tasks` ids;
  - category matching, with tool errors returned to the model;
  - the 92-day range cap;
  - page permissions;
  - upstream 401 mapping;
  - the daily limit;
  - the API key absent from every response;
  - audit rows;
  - the account time zone.
- lab-service `node --test`: 85 pass, 2 fail. Both failures are the Lili/Pudding geometry checks: the harness ring sits 17 units above the view box. That has been the case since v2.0.1.0 and is left for a later framing fix. The companion-brain visibility test was fixed for v2.1.0.0's `public` access level.
- Local stand-in for phase 3: seeded synthetic accounts, Calendar and Tools/Lab on Node 20 and a stand-in model server.
  - `assistant-http.cjs`: 36 assertions.
  - `asset-response.cjs`: 45.
  - `companion-http.cjs`: 301.
  - `music-http.cjs`: 25.
  - The release notice reached 5 accounts including admins (20 notices); a second run reported `alreadyPublished`.
- The no-TOTP overrides keep their original 7-line (`server.cjs`) and 12-line (`app.js`) differences. The companion bundle is byte-identical in both services, and so are both dictionaries.
- Browser (companion demo with a stand-in assistant):
  - AI subtitle, chips and hint;
  - disclosure;
  - add card with range, category, reminder and note;
  - page card;
  - delete card;
  - confirmed state;
  - remaining-quota note.

Not run locally: a real model call (needs the admin's key), outbound HTTPS from the production Calendar container, the Docker-network checks for useful/study/sites, and the phase-6 HTTPS verifier. The installer runs the isolated checks inside both new images before any switch and stops without deploying if one fails. No production connection or real GitHub push/merge is performed.
