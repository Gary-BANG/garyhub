This makes the website companion's landing look continuous and turns Lili into a rigged character like Milu.

**Why**
Frame-swapping companions looked jerky on landing. Recording a landing frame by frame showed that:
- Characters touched down with about 6.7° of parachute tilt. The body turns about the ring above the head, so the feet slid about 13 screen pixels after landing.
- The pose image cut straight from parachute to crouch, held for about a second, then cut to standing.
- Pagey's and Navi's parachute frames were drawn about 20% smaller than idle, and Lili's idle faced the other way.

**What changed**
- Lili is a layered vector rig (`characters/lili/rig.svg`, 187 KiB). It has tail, body, paws, a head with ears, and open, closed and happy eyes plus smile and "o" mouths. The layers come from generated puppet and expression sheets, traced with vtracer and slimmed with `slim_rig.py`. Her tail swings at most 3°.
- `pet.js` eases the parachute sway to zero over the last 200 px. Touchdown tilt is now under 1° for every character.
- Frame characters fade between poses on landing and standing up, get a lighter squash and no hop, and hold the crouch for 0.7 s instead of 1.06 s. Pagey's and Navi's parachute frames are rescaled to their idle head size.
- Lili's old pose SVGs stay in place because the overlay installer can only add and replace files.
- No schema, route or permission change. Version and asset `?v=` move to 2.3.0.2.

**Release adapter**
- Registers v2.3.0.2 on top of the v2.3.0.1 source commit 5a45333 and reuses the seven isolated checks.
- Recomputed asset hashes from Git blobs, and added checks for pet.js, characters.js and rig.svg on all three hosts.
- The no-TOTP overrides keep their 7- and 12-line differences.

**Validation**
- calendar-app: 87/87.
- lab-service: 86/87. Only Pudding's existing geometry check fails; Lili's now passes.
- Updater tests pass in WSL.
- Isolated Docker checks run in the installer.
