This rebuilds the Pudding companion as an articulated rig and adds a small motion engine for it.

**Why**
Single-pose companions felt lifeless. The maintainer pointed at Shimeji, Spine's smooth transitions and Rive's interactive mascots as the bar, and chose to extend our SVG rig rather than adopt Rive. Agreed scope: no walking, petting by stroking the head, and calmer behaviour on quiet pages.

**Art (`characters/pudding/rig.svg`, 134 KiB)**
- Built from generated model, puppet and expression sheets.
- Each pixel of the sitting drawing goes to the part whose fitted piece covers it: occlusion-aware fitting, plus a flood-filled head region with the ears taken back out by colour. The rest pose therefore matches the drawing exactly. The GPT pieces only fill what other parts hide.
- Ears and tail are cut into root and tip. The raised paw is a separate part.
- Expressions beyond her own smile are vector strokes on her eyes and mouth: blink, happy, drowsy, o, tongue, yawn and w.
- Sleeping uses the separate lying drawing.

**Engine (`companion/puppet.js`, only for specs with `puppet`)**
- Ears, tail and legs sit on springs driven by body acceleration and swing. The wag is laid over the springs, and the ears flop on touchdown.
- She breathes, looks at the pointer, and waves with the raised paw.
- Idle actions every 9–18 s: yawn, wag, look, paw, pant and ear flick.
- Petting comes from two direction changes over the head. On touch, a finger sliding on the head pets instead of dragging.
- After 60 s alone she lies down, then breathes by CSS once the frame loop stops. Attention wakes her with a yawn.
- Quiet pages keep only breathing, blinking, springs and petting.
- pet.js hands rig parts to the puppet and lets it hold an expression over the state's own. Milu and Lili are unchanged.

**Release adapter**
- v2.3.0.3 on top of the v2.3.0.2 source commit 9c61d24, reusing the seven isolated checks.
- Asset hashes come from Git blobs. The mapping reproduces all 33 v2.3.0.2 hashes, and puppet.js, pet.css and Pudding's rig.svg are added on three hosts (42 in all).
- The no-TOTP overrides keep their 7- and 12-line differences.

**Validation**
- lab-service: 87/87, including Pudding's geometry check, which failed in earlier releases.
- calendar-app: 87/87.
- Updater tests pass in WSL.
- The demo page was checked for springs, petting, waves, idle actions, sleep and wake, and quiet mode.
