/* GaryHub Games (v2.4.3.0): 对战猜数字 / Number Duel in a live room. Each player sets four different digits; every round
   both guess at once and get xA yB for their own guess. The other secret is only sent once the game is over. */
(() => {
  'use strict';
  const G = window.Games, {t, el} = G;
  const AWAY = 120_000;
  let entry = '', entryKey = '', showSecret = false, claimTimer = 0;

  function summary(result, view) {
    if (!result) return '';
    if (result.winner == null) return t('平局', 'Draw');
    const mine = view && view.you != null && result.winner === view.you;
    return (mine ? t('你赢了', 'You won') : t('对方赢了', 'The other side won')) + (result.rounds ? t('（第 ' + result.rounds + ' 轮）', ' (round ' + result.rounds + ')') : '');
  }
  const dots = (a, b) => el('span', {class: 'dots', 'aria-label': a + 'A' + b + 'B'}, ...Array.from({length: a}, () => el('i', {class: 'a'})), ...Array.from({length: b}, () => el('i', {class: 'b'})),
    ...Array.from({length: 4 - a - b}, () => el('i', {class: 'n'})));
  const tiles = (code, extra = '') => el('span', {class: 'tiles ' + extra}, ...[...code].map(d => el('b', {text: d})));

  function column(title, list) {
    const box = el('section', {class: 'guesses'}, el('h3', {text: title}));
    const items = el('ol', {class: 'guess-list'});
    for (const entry of list) {
      items.append(el('li', {class: entry.a === 4 ? 'hit' : ''}, el('span', {class: 'round-no', text: entry.round}),
        entry.timeout ? el('span', {class: 'hint', text: t('超时，没猜', 'Timed out')}) : [tiles(entry.guess), dots(entry.a, entry.b), el('strong', {class: 'ab', text: entry.a + 'A' + entry.b + 'B'})]));
    }
    if (!list.length) items.append(el('li', {class: 'hint', text: t('还没有', 'None yet')}));
    box.append(items);
    return box;
  }

  // The four-slot entry with its own keypad; the keyboard works too while it is on screen.
  function pad(api, action, label) {
    const box = el('div', {class: 'pad'});
    const slots = el('div', {class: 'slots', 'aria-live': 'polite'}, ...Array.from({length: 4}, (_, i) => el('span', {class: 'slot' + (entry[i] ? ' full' : ''), text: entry[i] || ''})));
    const keys = el('div', {class: 'keys'});
    const redraw = () => api.redraw();
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) keys.append(el('button', {class: 'key', type: 'button', text: d, disabled: entry.includes(d) || entry.length >= 4, onclick: () => { entry += d; redraw(); }}));
    keys.append(el('button', {class: 'key wide', type: 'button', text: '⌫', 'aria-label': t('删除', 'Delete'), disabled: !entry, onclick: () => { entry = entry.slice(0, -1); redraw(); }}));
    const go = el('button', {class: 'btn btn-gold', type: 'button', text: label, disabled: entry.length !== 4,
      onclick: () => { const code = entry; go.disabled = true; api.act(action, {code}).then(() => { entry = ''; }, () => { go.disabled = false; }); }});
    box.append(slots, keys, go);
    box.dataset.action = action;
    return box;
  }
  document.addEventListener('keydown', event => {
    const box = document.querySelector('.pad');
    if (!box || event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    if (/^[0-9]$/.test(event.key) && !entry.includes(event.key) && entry.length < 4) { entry += event.key; window.Play.api.redraw(); event.preventDefault(); }
    else if (event.key === 'Backspace' && entry) { entry = entry.slice(0, -1); window.Play.api.redraw(); event.preventDefault(); }
    else if (event.key === 'Enter' && entry.length === 4) { box.querySelector('.btn-gold')?.click(); event.preventDefault(); }
  });

  // Notepad: tap a digit to mark it out, again to mark it in, again to clear. Kept on this device for this game only.
  function notes(v) {
    const key = 'gh-play-notes-' + v.code + '-' + v.matches;
    let marks = {};
    try { marks = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
    const box = el('div', {class: 'notepad'}, el('span', {class: 'hint', text: t('草稿：', 'Notes: ')}));
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      const state = marks[d] || '';
      box.append(el('button', {class: 'note ' + state, type: 'button', text: d, 'aria-label': d + (state === 'out' ? t('：排除', ': out') : state === 'in' ? t('：确定有', ': in') : ''),
        onclick: () => { marks[d] = state === '' ? 'out' : state === 'out' ? 'in' : ''; try { localStorage.setItem(key, JSON.stringify(marks)); } catch {} window.Play.api.redraw(); }}));
    }
    return box;
  }

  function outcome(s, v, api) {
    const o = s.outcome, other = 1 - v.you, otherName = api.seatName(other);
    const win = o.winner === v.you, draw = o.winner == null;
    // The loser is the one who missed, gave up or left.
    const them = win ? otherName : t('你', 'You');
    const reasons = {solved: t('第 ' + o.rounds + ' 轮猜中', 'cracked in round ' + o.rounds), both: t('同一轮都猜中了', 'both cracked it in the same round'),
      timeouts: draw ? t('双方都连续 3 轮没猜', 'both missed three rounds in a row') : t(them + ' 连续 3 轮没猜', them + ' missed three rounds in a row'),
      forfeit: t(them + ' 认输了', them + ' gave up'), away: t(them + ' 离开超过 2 分钟', them + ' left for over two minutes'), rounds: t('30 轮内都没猜中', 'nobody cracked it in 30 rounds')};
    const box = el('div', {class: 'result ' + (draw ? 'neutral' : win ? 'win' : 'lose')},
      el('div', {class: 'result-emoji', 'aria-hidden': 'true', text: draw ? '🤝' : win ? '🏆' : '🔐'}),
      el('h2', {text: draw ? t('平局', 'A draw') : win ? t('你赢了！', 'You won!') : t(otherName + ' 赢了', otherName + ' won')}),
      el('p', {class: 'hint', text: reasons[o.reason] || ''}));
    if (s.secrets) box.append(el('div', {class: 'secrets'},
      el('div', {}, el('span', {class: 'hint', text: t('你的密码', 'Your secret')}), tiles(s.secrets[v.you])),
      el('div', {}, el('span', {class: 'hint', text: t(otherName + ' 的密码', otherName + "'s secret")}), tiles(s.secrets[other], 'gold'))));
    if (v.tally) box.append(el('p', {class: 'hint', text: t('这个房间：你 ' + v.tally.wins[v.you] + ' : ' + v.tally.wins[other] + ' ' + otherName + (v.tally.draws ? '，平局 ' + v.tally.draws : ''),
      'This room: you ' + v.tally.wins[v.you] + ' : ' + v.tally.wins[other] + ' ' + otherName + (v.tally.draws ? ', ' + v.tally.draws + ' drawn' : ''))}));
    return box;
  }

  function render(stage, v, api) {
    const s = v.state, me = v.you, other = 1 - me, otherName = api.seatName(other), bot = !!v.seats[other]?.bot;
    if (me == null) return;
    const key = v.code + ':' + v.matches + ':' + s.phase + ':' + s.round;
    if (key !== entryKey) { entryKey = key; entry = ''; }
    const columns = () => el('div', {class: 'columns'},
      column(t('我的猜测 → ' + otherName + ' 的密码', 'My guesses → ' + otherName + "'s secret"), s.history[me]),
      column(t(otherName + ' 的猜测 → 我的密码', otherName + "'s guesses → my secret"), s.history[other]));
    if (s.phase === 'finished') { stage.append(outcome(s, v, api), columns()); return; }

    const title = s.phase === 'secret' ? t('设一个 4 位密码', 'Set a four-digit secret') : t('猜 ' + otherName + ' 的密码', 'Guess ' + otherName + "'s secret");
    stage.append(el('div', {class: 'stage-head'}, el('div', {}, el('p', {class: 'eyebrow', text: s.phase === 'secret' ? t('准备', 'Setup') : t('第 ' + s.round + ' 轮', 'Round ' + s.round)}), el('h2', {text: title})),
      el('div', {class: 'head-side'}, api.clock())));
    if (s.mySecret) {
      stage.append(el('div', {class: 'my-secret'}, el('span', {class: 'hint', text: t('我的密码', 'My secret')}), showSecret ? tiles(s.mySecret, 'small') : el('span', {class: 'masked', text: '● ● ● ●'}),
        el('button', {class: 'chip-btn', type: 'button', text: showSecret ? t('隐藏', 'Hide') : t('显示', 'Show'), onclick: () => { showSecret = !showSecret; api.redraw(); }}),
        s.randomSecret ? el('span', {class: 'pill off', text: t('超时，已随机生成', 'Timed out — chosen at random')}) : null));
    }
    const status = done => el('p', {class: 'status-line'}, el('span', {class: 'pill ' + (done ? 'done' : 'off'),
      text: done ? t(otherName + ' 好了 ✓', otherName + ' is ready ✓') : bot ? t('电脑思考中…', 'The computer is thinking…') : t(otherName + ' 思考中…', otherName + ' is thinking…')}));
    if (s.phase === 'secret') {
      if (!s.mySecret) stage.append(pad(api, 'secret', t('设好密码', 'Lock it in')), el('p', {class: 'hint', text: t('4 个不同的数字，可以 0 开头。设好后不能修改，对方在结束前看不到。', 'Four different digits; 0 may lead. It cannot be changed, and the other side only sees it at the end.')}));
      else stage.append(el('p', {class: 'sent', text: t('密码已设好，等对方…', 'Secret set — waiting for the other side…')}));
      stage.append(status(s.secretSet[other]));
      return;
    }
    if (!s.myGuess) stage.append(pad(api, 'guess', t('猜！', 'Guess!')));
    else stage.append(el('div', {class: 'sent'}, t('你猜了 ', 'You guessed '), tiles(s.myGuess, 'small'), t('，等对方…', ' — waiting for the other side…')));
    stage.append(status(s.guessed[other]));
    if (s.streak[me]) stage.append(el('p', {class: 'grace', text: t('你已连续 ' + s.streak[me] + ' 轮没猜，连续 3 轮判负。', 'You missed ' + s.streak[me] + ' in a row; three in a row lose.')}));
    stage.append(notes(v), columns());
    stage.append(el('div', {class: 'actions quiet'}, el('span', {class: 'hint', text: t('● 位置和数字都对　○ 数字对、位置不对', '● right digit, right place   ○ right digit, wrong place')}),
      el('button', {class: 'btn btn-danger btn-sm', type: 'button', text: t('认输', 'Give up'), onclick: () => { if (confirm(t('确定认输吗？', 'Give up this game?'))) api.act('forfeit').catch(() => {}); }})));
  }

  // While paused because the other player is away: after two minutes the one still here may take the win.
  function paused(node, v, api) {
    if (v.you == null || !v.away) return;
    const since = v.away[1 - v.you];
    if (!since) return;
    const wait = since + AWAY - api.serverNow();
    clearTimeout(claimTimer);
    if (wait > 0) { claimTimer = setTimeout(() => api.redraw(), wait + 300); node.append(' · ', t('离开满 2 分钟后可判你获胜', 'after two minutes away you may take the win')); return; }
    node.append(' ', el('button', {class: 'btn btn-gold btn-sm', type: 'button', text: t('判我获胜', 'Take the win'), onclick: () => api.act('claim').catch(() => {})}));
  }

  window.Play.register('digits', {
    render, summary, paused,
    intro: ['各设一个 4 位不重复的密码，每轮同时猜一次，看提示推理，先猜中对方的密码就赢。', 'Each sets four different digits; guess at the same time each round, read the hints, and crack the other code first.'],
    leaveWarning: () => ['离开会判你认输。确定离开吗？', 'Leaving counts as giving up. Leave?'],
    settings: [{name: 'limit', label: ['每轮限时', 'Time per guess'], options: [[30, '30 秒', '30 s'], [60, '60 秒', '60 s'], [0, '不限时', 'No limit']]}],
    rules: () => [
      ['双方各设一个密码：4 个不同的数字，可以 0 开头（60 秒内没设好会随机生成）。', 'Each sets a secret of four different digits; 0 may lead (one is drawn at random after 60 seconds).'],
      ['每一轮两人同时猜一次对方的密码，都猜完后一起公布结果。', 'Every round both guess the other secret at the same time; the hints are shown when both have guessed.'],
      ['提示 xA yB：A 是数字和位置都对的个数，B 是数字对但位置不对的个数。例如密码 4271，猜 1234 得 1A2B。', 'Hint xA yB: A counts right digits in the right place, B right digits in the wrong place. Secret 4271, guess 1234: 1A2B.'],
      ['先得到 4A 的人获胜；同一轮都猜中算平局。双方的猜测和提示都公开。', 'The first to get 4A wins; both in the same round is a draw. Both sides see every guess and hint.'],
      ['超时算这一轮没猜，连续 3 轮没猜判负。对方掉线时计时暂停，离开满 2 分钟可以判你获胜。', 'A missed round is skipped; three in a row lose. If the other side drops out the clock pauses, and after two minutes you may take the win.'],
      ['房主可以添加电脑对手（新手、普通、精明）。电脑只看得到自己的猜测和提示。', 'The host can add a computer player (beginner, regular, sharp). It only sees its own guesses and hints.']
    ]
  });
})();
