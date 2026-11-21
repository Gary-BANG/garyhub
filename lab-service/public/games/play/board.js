/* GaryHub Games (v2.4.3.2): pieces shared by the board games (骰子抢宝箱, 大富翁) — a square grid of tiles, tokens that walk
   a path one tile at a time, dice that roll before showing the server's numbers, and seat colours. The DOM is kept between
   room updates so animations are not cut off; every position uses CSSOM, as the games CSP allows no inline styles. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const COLORS = ['#f6c86e', '#a98bff', '#7fe3c4', '#f7a8d8', '#6fb4ff'];
  const PIPS = {1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]};
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const node = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };

  // A grid of rows × cols; place(index, row, col) puts tile `index` on the grid. Tokens float above it.
  function grid(cols, rows, className = '') {
    const root = node('div', 'bd ' + className), tiles = node('div', 'bd-tiles'), layer = node('div', 'bd-tokens');
    tiles.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)'; tiles.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';
    root.append(tiles, layer);
    const cells = new Map(), where = new Map(), tokens = new Map(), moving = new Set();
    const api = {
      root, tiles, cols, rows,
      place(index, row, col, el) {
        el.style.gridRow = String(row + 1); el.style.gridColumn = String(col + 1);
        el.dataset.index = String(index);
        tiles.append(el); cells.set(index, el); where.set(index, [row, col]);
        return el;
      },
      cell: index => cells.get(index),
      cells: () => cells,
      // One token per seat; several on one tile are spread out a little.
      token(seat, label) {
        if (!tokens.has(seat)) {
          const t = node('span', 'bd-token', label);
          t.style.setProperty('--seat', COLORS[seat % COLORS.length]);
          layer.append(t); tokens.set(seat, t);
        }
        return tokens.get(seat);
      },
      remove(seat) { tokens.get(seat)?.remove(); tokens.delete(seat); },
      busy: seat => moving.has(seat),
      put(seat, index, slot = 0, of = 1) {
        const t = api.token(seat), [r, c] = where.get(index) || [0, 0];
        const spread = of > 1 ? 0.22 : 0, angle = slot / Math.max(of, 1) * Math.PI * 2;
        t.style.left = ((c + 0.5 + Math.cos(angle) * spread) / cols * 100) + '%';
        t.style.top = ((r + 0.5 + Math.sin(angle) * spread) / rows * 100) + '%';
        t.dataset.at = String(index);
      },
      // Walks a token along the tiles of `path`; resolves when it has arrived.
      async walk(seat, path, step = 170) {
        if (!path || path.length < 2 || reduced.matches) { if (path?.length) api.put(seat, path.at(-1)); return; }
        moving.add(seat);
        const t = api.token(seat);
        t.classList.add('walking');
        for (const index of path.slice(1)) { api.put(seat, index); await sleep(step); }
        t.classList.remove('walking');
        moving.delete(seat);
      }
    };
    return api;
  }

  // Dice: roll(values) shows random faces for a moment, then the server's numbers.
  function dice(count = 1) {
    const root = node('div', 'bd-dice'), faces = [];
    for (let i = 0; i < count; i++) { const f = node('span', 'bd-die'); for (let k = 0; k < 9; k++) f.append(node('i')); faces.push(f); root.append(f); }
    const show = (f, v) => { [...f.children].forEach((pip, k) => pip.classList.toggle('on', !!v && PIPS[v].includes(k))); f.dataset.value = v ? String(v) : ''; };
    const api = {
      root,
      set(values) { faces.forEach((f, i) => show(f, values?.[i] || 0)); },
      async roll(values, ms = 650) {
        if (reduced.matches) return api.set(values);
        root.classList.add('rolling');
        const end = performance.now() + ms;
        while (performance.now() < end) { faces.forEach(f => show(f, 1 + Math.floor(Math.random() * 6))); await sleep(70); }
        root.classList.remove('rolling');
        api.set(values);
      }
    };
    api.set(null);
    return api;
  }

  window.Board = {grid, dice, COLORS, sleep, node, color: seat => COLORS[seat % COLORS.length]};
})();
