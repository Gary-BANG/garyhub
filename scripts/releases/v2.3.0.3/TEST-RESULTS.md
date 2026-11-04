# GaryHub v2.3.0.3-r1 validation

WSL Ubuntu 22.04 with official Node v22.23.4 and Python 3.10.12.

- lab-service `node --test`: 87 pass, 0 fail. Pudding's geometry check, failing since v2.0.1.0, now passes.
- calendar-app `node --test`: 87 pass, 0 fail, with sqlite3 built from source in a scratch copy. `/health` reports 2.3.0.3.
- Updater unit tests: all pass in WSL.
- Pudding rig renders match the model sheet at rest. Expressions sit on her own eyes and mouth.
- Demo page:
  - Ear tips swing 4–5° on landing and the tail tip 7°.
  - Petting switches to happy eyes and a tongue, with a 9° wag.
  - Waves swap in the raised paw.
  - After 60 s she lies down, then wakes with a yawn.
  - Quiet mode leaves only blinking and breathing.
- Asset hashes come from Git blobs. All 33 v2.3.0.2 hashes reproduce at 9c61d24; 42 in all, now including puppet.js, pet.css and Pudding's rig.svg on three hosts.
- The no-TOTP overrides keep their original 7-line and 12-line differences.

Not run locally:
- The Docker-network phase 3 (seven isolated checks and release-notice count/dedupe).
- The phase-6 HTTPS verifier.
- Touch petting on a real phone.
