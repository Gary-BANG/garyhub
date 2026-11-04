# GaryHub v2.3.0.2-r1 validation

WSL Ubuntu 22.04 with official Node v22.23.4 and Python 3.10.12.

- calendar-app `node --test`: 87 pass, 0 fail. The prebuilt sqlite3 needs GLIBC 2.38, so it was built from source in a scratch copy.
- lab-service `node --test`: 86 pass, 1 fail. The failure is the existing Pudding geometry check. Lili's geometry check, which failed in v2.3.0.1, now passes with the rig.
- Updater unit tests: all pass in WSL.
- Lili rig checks on the real files:
  - safe SVG, required part ids, and pivots and limits inside the square view box;
  - every part turned to its limit leaves no gaps;
  - expressions switch correctly through fall, chute, land, recover, idle and wave.
- Touchdown tilt: Lili 0.65°, Milu 0.94°. It was about 6.7° before.
- Asset hashes were taken from Git blobs. The route-to-file mapping first reproduced all 33 v2.3.0.1 hashes at 5a45333.
- The no-TOTP overrides keep their original 7-line and 12-line differences.

Not run locally:
- The Docker-network phase 3 (seven isolated checks and release-notice count/dedupe).
- The phase-6 HTTPS verifier.
