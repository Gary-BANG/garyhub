/* Character rigs. Geometry is in each character's own units:
   bounds = visible art, ring = where the harness is held (also the swing pivot),
   feet = ground contact point. kind 'rig' animates layers of one SVG (pivots/limits per part);
   kind 'frames' swaps whole pose images ([file, x, y, w, h] in the same units) and moves the body.
   tier: guest = everyone, member = signed-in accounts, subscriber = subscribers and admins. */
((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GaryHubCompanionCharacters = api;
})(typeof window === 'object' ? window : this, () => {
  'use strict';
  // Step 1b poses share a 512×640 canvas with the ground at y=608.
  const canvas = (id, names) => Object.fromEntries(names.map(name => [name, [`characters/${id}/${name}.svg`, 0, 0, 512, 640]]));
  // Step 1c frames were cut from the concept sheets; units are sheet pixels, feet at the origin.
  const cut = (id, rects) => Object.fromEntries(Object.entries(rects).map(([name, rect]) => [name, [`characters/${id}/${name}.webp`, ...rect]]));
  const characters = {
    // Source: Milu_Rig_v2 2.1.1, slimmed with scripts/companion/slim_rig.py.
    milu:{available:true, tier:'guest', kind:'rig', rig:'characters/milu/rig.svg', thumbnail:'characters/milu/thumbnail.webp',
      viewBox:[-100, -100, 1454, 1454], bounds:[90, 22, 1124, 1222], ring:[705, -50], feet:[697, 1222],
      pivots:{head:[754, 653], 'ear-l':[446, 325], 'ear-r':[858, 240], tail:[451, 1128], 'paw-r':[874, 844]},
      limits:{head:4, 'ear-l':1, 'ear-r':1, tail:6, 'paw-r':7},
      eyes:{open:'eyes-open', closed:'eyes-closed', happy:'eyes-happy'}, mouth:{smile:'mouth-smile', o:'mouth-o'},
      props:{strap:'#3d63c9', canopy:['#d2e2f8', '#8fb1ea'], line:'#232232'}},
    // Source: GaryHub_Companion_Step1b static poses (idle/held/fall/parachute/land), slimmed.
    lili:{available:true, tier:'member', kind:'frames', thumbnail:'characters/lili/thumbnail.webp',
      viewBox:[13, 167, 485, 485], bounds:[81, 207, 430, 608], ring:[256, 150], feet:[256, 608],
      frames:canvas('lili', ['idle', 'held', 'fall', 'parachute', 'land'])},
    pudding:{available:true, tier:'subscriber', kind:'frames', thumbnail:'characters/pudding/thumbnail.webp',
      viewBox:[13, 167, 485, 485], bounds:[79, 207, 432, 608], ring:[256, 150], feet:[256, 608],
      frames:canvas('pudding', ['idle', 'held', 'fall', 'parachute', 'land'])},
    // Source: GaryHub_Companion_Step1c_Design 12-pose sheets; the held frame hangs from the ring.
    pagey:{available:true, tier:'subscriber', kind:'frames', thumbnail:'characters/pagey/thumbnail.webp',
      viewBox:[-187, -340, 374, 374], bounds:[-97, -309, 97, 0], ring:[0, -321], feet:[0, 0],
      frames:cut('pagey', {idle:[-97.2, -309, 194, 309], held:[-110.8, -321, 214, 386], fall:[-148.4, -339, 273, 339], parachute:[-166.3, -378, 298, 378],
        land:[-128.3, -240, 257, 240], wave:[-95.8, -328, 289, 328], curious:[-117.1, -352, 218, 352], decline:[-119.7, -324, 237, 324]})},
    navi:{available:true, tier:'subscriber', kind:'frames', thumbnail:'characters/navi/thumbnail.webp',
      viewBox:[-202, -370, 407, 407], bounds:[-110, -336, 115, 0], ring:[2, -348], feet:[0, 0],
      frames:cut('navi', {idle:[-110.4, -336, 225, 336], held:[-98.4, -348, 214, 387], fall:[-168.3, -314, 273, 314], parachute:[-146.5, -379, 275, 379],
        land:[-137, -290, 284, 290], wave:[-153.2, -350, 278, 350], curious:[-136.1, -355, 245, 355], decline:[-120.5, -349, 248, 349]})}
  };
  const roster = Object.keys(characters).filter(id => characters[id].available);
  // UI entitlement only: the files are public like any other page asset.
  const allowed = (id, user) => {
    const tier = characters[id]?.available && characters[id].tier;
    if (tier === 'guest') return true;
    if (tier === 'member') return !!user;
    if (tier === 'subscriber') return user?.role === 'admin' || user?.accountTier === 'subscriber';
    return false;
  };
  return {characters, roster, fallback:'milu', allowed};
});
