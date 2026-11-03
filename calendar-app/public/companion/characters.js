/* Character rigs. Geometry is in each rig's own SVG units:
   bounds = visible art, ring = where the harness is held (also the swing pivot),
   feet = ground contact point, pivots/limits = per-part rotation centres and maximum degrees.
   Only characters marked available are offered to visitors. */
((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GaryHubCompanionCharacters = api;
})(typeof window === 'object' ? window : this, () => {
  'use strict';
  const characters = {
    // Source: Milu_Rig_v2 2.1.1, slimmed with scripts/companion/slim_rig.py.
    milu:{available:true, rig:'characters/milu/rig.svg', viewBox:[-100, -100, 1454, 1454],
      bounds:[90, 22, 1124, 1222], ring:[705, -50], feet:[697, 1222],
      pivots:{head:[754, 653], 'ear-l':[446, 325], 'ear-r':[858, 240], tail:[451, 1128], 'paw-r':[874, 844]},
      limits:{head:4, 'ear-l':1, 'ear-r':1, tail:6, 'paw-r':7},
      eyes:{open:'eyes-open', closed:'eyes-closed', happy:'eyes-happy'}, mouth:{smile:'mouth-smile', o:'mouth-o'},
      props:{strap:'#3d63c9', canopy:['#d2e2f8', '#8fb1ea'], line:'#232232'}},
    pudding:{available:false}, lili:{available:false}, pagey:{available:false}, navi:{available:false}
  };
  const roster = Object.keys(characters).filter(id => characters[id].available);
  return {characters, roster, fallback:'milu'};
});
