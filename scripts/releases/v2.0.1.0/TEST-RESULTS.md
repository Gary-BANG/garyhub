# GaryHub v2.0.1.0-r1 validation

Run on Windows 11 with Python 3.10, Git 2.52 and the Claude desktop browser (Chromium); updater tests and the package build ran in WSL Ubuntu. **Node.js was not installed on the build machine**, so no `node --test` suite and no local Calendar/Lab server ran.

- Characters: Lili and Pudding (Step 1b vector poses, slimmed) and Pagey and Navi (WebP frames cut from the Step 1c sheets) render with their idle, held, fall, parachute and land poses; a composite of every pose at its engine position confirmed shared ground lines and the grab point. All five completed fall → parachute → land → recover → idle, and reactions use a wave frame where one exists.
- Access: on the real Tools page with simulated identities, guests saw only Milu unlocked, standard accounts Milu and Lili, subscribers and admins all five; picks were stored in the shared cookie; logout fell back to Milu and a later subscriber sign-in restored the stored choice; a pending switch is replaced by a newer request. One pet remained on the page after every switch and the conversation was kept.
- Regression: the 67-case intent set still passes; companion bundles in both services are byte-identical (41 files); asset hashes were computed from committed Git blobs.
- Found and fixed during testing: Tools/Lab served `.webp` without an image MIME type.

Not run locally: the Node service suites, the isolated HTTP checks (including the extended `companion-http.cjs`) and the phase-6 HTTPS verifier. The installer runs the isolated checks inside both new images with synthetic accounts before any switch and stops without deploying if one fails. Real accounts, Safari/iOS and production frame rates are not verified. No production connection or real GitHub push/merge is performed.
