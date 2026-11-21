/* GaryHub Games (v2.4.3.0): 词语默契 / Word Sync in a live room. Both write a word at the same time; the server keeps
   each word hidden until both are in, then reveals them together. Draws into the room's stage from the state it sends. */
(() => {
  'use strict';
  const G = window.Games, {t, el} = G;
  const seen = new Set();
  const RATINGS = [[1, '心电感应', 'Telepathy'], [3, '心有灵犀', 'In sync'], [6, '默契十足', 'Great teamwork'], [10, '渐入佳境', 'Getting there'], [Infinity, '坚持就是胜利', 'Persistence wins']];
  const rating = rounds => { const r = RATINGS.find(([max]) => rounds <= max); return t(r[1], r[2]); };

  function summary(result) {
    if (!result) return '';
    if (result.result === 'success') return t('第 ' + result.rounds + ' 轮成功', 'Matched in round ' + result.rounds);
    if (result.result === 'fail') return t(result.rounds + ' 轮未对上', 'No match in ' + result.rounds + ' rounds');
    return t('中断', 'Interrupted');
  }
  const card = (text, who, extra = '') => el('div', {class: 'word-card ' + extra}, el('span', {class: 'word-who', text: who}), el('strong', {text: text ?? t('（超时）', '(timed out)')}));

  function outcome(s, v, api) {
    const o = s.outcome, box = el('div', {class: 'result ' + (o.result === 'success' ? 'win' : o.result === 'fail' ? 'lose' : 'neutral')});
    const last = s.history.at(-1);
    if (o.result === 'success') {
      box.append(el('div', {class: 'result-emoji', 'aria-hidden': 'true', text: o.reason === 'agreed' ? '🤝' : '🎉'}),
        el('h2', {text: o.reason === 'agreed' ? t('第 ' + o.rounds + ' 轮，你们认定意思一样！', 'Round ' + o.rounds + ': you agreed they mean the same!') : t('第 ' + o.rounds + ' 轮写出了同一个词！', 'Same word in round ' + o.rounds + '!')}),
        el('p', {class: 'rating', text: rating(o.rounds)}));
      if (last) box.append(el('div', {class: 'pair'}, card(last.words[v.you], t('你', 'You')), card(last.words[1 - v.you], api.seatName(1 - v.you))));
    } else if (o.result === 'fail') {
      box.append(el('div', {class: 'result-emoji', 'aria-hidden': 'true', text: '🌧️'}),
        el('h2', {text: o.reason === 'giveup' ? t('你们一起认输了', 'You both gave up') : t(o.rounds + ' 轮内没能对上', 'No match within ' + o.rounds + ' rounds')}),
        el('p', {class: 'hint', text: t('挑战失败。约定好的事，记得兑现～', 'Challenge failed. Whatever you agreed on, now is the time.')}));
    } else {
      box.append(el('div', {class: 'result-emoji', 'aria-hidden': 'true', text: '🚪'}), el('h2', {text: t('有玩家离开，这一局中断', 'A player left; the game was interrupted')}),
        el('p', {class: 'hint', text: t('中断不算失败。', 'An interruption is not a failure.')}));
    }
    const target = v.settings.target;
    if (target && o.result !== 'aborted') {
      const met = o.result === 'success' && o.rounds <= target;
      box.append(el('p', {class: 'pill ' + (met ? 'done' : 'off'), text: t('挑战 ' + target + ' 轮内：' + (met ? '达成 ✓' : '未达成'), 'Within ' + target + ' rounds: ' + (met ? 'made it ✓' : 'missed'))}));
    }
    if (v.tally && v.tally.played) box.append(el('p', {class: 'hint', text: t('这个房间：' + v.tally.played + ' 局，成功 ' + v.tally.success + ' 局' + (v.tally.best ? '，最快 ' + v.tally.best + ' 轮' : ''),
      'This room: ' + v.tally.played + ' played, ' + v.tally.success + ' matched' + (v.tally.best ? ', best ' + v.tally.best + ' rounds' : ''))}));
    return box;
  }

  function chain(s, v, api) {
    if (!s.history.length) return null;
    const list = el('ol', {class: 'chain'});
    for (const entry of s.history) {
      const mark = entry.agreed ? '🤝' : entry.same ? '✓' : '';
      list.append(el('li', {class: entry.same || entry.agreed ? 'hit' : ''},
        el('span', {class: 'round-no', text: entry.round}),
        el('span', {class: 'w mine' + (entry.timeout[v.you] ? ' miss' : ''), text: entry.words[v.you] ?? t('超时', 'timed out')}),
        el('span', {class: 'w theirs' + (entry.timeout[1 - v.you] ? ' miss' : ''), text: entry.words[1 - v.you] ?? t('超时', 'timed out')}),
        el('span', {class: 'mark', text: mark})));
    }
    return el('section', {class: 'chain-box'}, el('h3', {text: t('词链', 'Word chain')}),
      el('div', {class: 'chain-head', 'aria-hidden': 'true'}, el('span'), el('span', {text: t('你', 'You')}), el('span', {text: api.seatName(1 - v.you)}), el('span')), list);
  }

  function render(stage, v, api) {
    const s = v.state, me = v.you, other = 1 - me, otherName = api.seatName(other);
    if (me == null) return;
    if (s.phase === 'finished') { stage.append(outcome(s, v, api)); const c = chain(s, v, api); if (c) stage.append(c); return; }
    const title = s.phase === 'review' ? t('揭晓！', 'Revealed!') : s.phase === 'hold' ? t('暂停一下', 'On hold')
      : s.clue ? t('想一个同时连起这两个词的词', 'Think of a word that links both') : t('不设主题，写下你想到的第一个词', 'No theme: write the first word that comes to mind');
    const side = el('div', {class: 'head-side'}, el('span', {class: 'pill', text: t('上限 ' + v.settings.cap + ' 轮', 'Up to ' + v.settings.cap)}));
    if (v.settings.target) side.append(el('span', {class: 'pill me', text: t('挑战 ' + v.settings.target + ' 轮内', 'Goal: ' + v.settings.target + ' rounds')}));
    side.append(api.clock());
    stage.append(el('div', {class: 'stage-head'}, el('div', {}, el('p', {class: 'eyebrow', text: t('第 ' + s.round + ' 轮', 'Round ' + s.round)}), el('h2', {text: title})), side));

    if (s.giveUp[other] && !s.giveUp[me]) stage.append(el('div', {class: 'notice'}, t(otherName + ' 提议认输。', otherName + ' wants to give up. '),
      el('button', {class: 'btn btn-ghost btn-sm', type: 'button', text: t('同意认输', 'Give up too'), onclick: () => api.act('giveup', {on: true}).catch(() => {})})));

    if (s.phase === 'submit') {
      if (s.clue) stage.append(el('div', {class: 'clue'}, card(s.clue[me], t('你上一轮', 'You, last round')), el('span', {class: 'plus', 'aria-hidden': 'true', text: '+'}), card(s.clue[other], otherName)));
      if (s.grace) stage.append(el('p', {class: 'grace', role: 'alert', text: t('时间到！最后 15 秒，快写一个词', 'Time is up! Last 15 seconds — write something')}));
      if (s.mine == null) {
        const input = el('input', {class: 'input word-input', maxlength: '12', autocomplete: 'off', spellcheck: 'false', placeholder: t('一个词', 'One word'), dataset: {keep: 'word'}, 'aria-label': t('你的词', 'Your word')});
        const form = el('form', {class: 'word-form', novalidate: true}, input, el('button', {class: 'btn btn-gold', type: 'submit', text: t('提交', 'Submit')}));
        form.addEventListener('submit', event => {
          event.preventDefault();
          const text = input.value.trim();
          if (!text) return input.focus();
          form.querySelector('button').disabled = true;
          api.act('word', {text}).catch(() => { form.querySelector('button').disabled = false; });
        });
        stage.append(form, el('p', {class: 'hint', text: t('提交后不能修改；本局出现过的词不能再用' + (s.used ? '（已用 ' + s.used + ' 个）' : '') + '。', 'You cannot change it once sent; words already used in this game are out' + (s.used ? ' (' + s.used + ' so far)' : '') + '.')}));
        if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) input.focus({preventScroll: true}); }, 0);
      } else {
        stage.append(el('div', {class: 'sent'}, t('你写了', 'You wrote'), ' ', el('strong', {text: '「' + s.mine + '」'}), ' ', t('，等对方…', '— waiting for the other word…')));
      }
      stage.append(el('p', {class: 'status-line'}, el('span', {class: 'pill ' + (s.submitted[other] ? 'done' : 'off'), text: s.submitted[other] ? t(otherName + ' 已提交 ✓', otherName + ' has sent ✓') : t(otherName + ' 思考中…', otherName + ' is thinking…')})));
    }

    if (s.phase === 'review') {
      const last = s.history.at(-1), key = v.code + ':' + v.matches + ':' + last.round, fresh = !seen.has(key);
      seen.add(key);
      stage.append(el('div', {class: 'pair reveal' + (fresh ? ' flip-in' : '')}, card(last.words[me], t('你', 'You')), card(last.words[other], otherName)));
      stage.append(el('p', {class: 'question', text: t('不一样……意思算一样吗？', 'Different words… do they mean the same?')}));
      const mine = s.review.mine, buttons = el('div', {class: 'actions'});
      buttons.append(el('button', {class: 'btn ' + (mine === 'same' ? 'btn-gold' : 'btn-ghost'), type: 'button', disabled: !!mine, text: t('算我们一样', 'Count it as the same'), onclick: () => api.act('review', {same: true}).catch(() => {})}),
        el('button', {class: 'btn ' + (mine === 'next' ? 'btn-violet' : mine ? 'btn-ghost' : 'btn-violet'), type: 'button', disabled: !!mine, text: t('不一样，下一轮', 'Different — next round'), onclick: () => api.act('review', {same: false}).catch(() => {})}));
      stage.append(buttons);
      const theirs = s.review.other;
      stage.append(el('p', {class: 'status-line'}, el('span', {class: 'pill ' + (theirs ? 'done' : 'off'),
        text: theirs === 'same' ? t(otherName + ' 觉得一样', otherName + ' says same') : theirs === 'next' ? t(otherName + ' 选了下一轮', otherName + ' says next round') : t(otherName + ' 还在看', otherName + ' is deciding')}),
        el('span', {class: 'hint', text: t('两人都选“算我们一样”才算成功。', 'It counts only if you both choose "same".')})));
    }

    if (s.phase === 'hold') {
      if (s.hold === me) stage.append(el('div', {class: 'notice'}, t('你已连续 3 轮没有提交，计时停了。准备好就继续吧。', 'You missed three rounds in a row, so the clock stopped. Continue when you are ready.'),
        el('button', {class: 'btn btn-gold btn-sm', type: 'button', text: t('继续', 'Continue'), onclick: () => api.act('resume').catch(() => {})})));
      else stage.append(el('div', {class: 'notice', text: t(otherName + ' 连续 3 轮没有提交，等 TA 点“继续”。', otherName + ' missed three rounds in a row; waiting for them to continue.')}));
    }

    const c = chain(s, v, api);
    if (c) stage.append(c);
    const give = el('div', {class: 'actions quiet'});
    if (s.giveUp[me]) give.append(el('span', {class: 'hint', text: t('你提议了认输，等对方同意。', 'You offered to give up; waiting for the other player.')}),
      el('button', {class: 'btn btn-ghost btn-sm', type: 'button', text: t('撤回', 'Take it back'), onclick: () => api.act('giveup', {on: false}).catch(() => {})}));
    else give.append(el('button', {class: 'btn btn-danger btn-sm', type: 'button', text: t('提议认输', 'Offer to give up'),
      onclick: () => { if (confirm(t('提议认输？对方也同意时，这一局记为挑战失败。', 'Offer to give up? If the other player agrees, the game counts as failed.'))) api.act('giveup', {on: true}).catch(() => {}); }}));
    stage.append(give);
  }

  window.Play.register('word', {
    render, summary,
    intro: ['两人同时写一个词，一起揭晓；不一样就各写一个能连起上两个词的新词，直到写出同一个词。', 'Both write a word at the same time; if they differ, each writes a new word linking the last two, until you write the same one.'],
    leaveWarning: () => ['离开会结束这一局（记为中断）。确定离开吗？', 'Leaving ends this game (recorded as interrupted). Leave?'],
    settings: [
      {name: 'limit', label: ['每轮限时', 'Time per round'], options: [[30, '30 秒', '30 s'], [60, '60 秒', '60 s'], [90, '90 秒', '90 s'], [0, '不限时', 'No limit']]},
      {name: 'cap', label: ['轮数上限', 'Most rounds'], options: [[5, '5 轮', '5 rounds'], [10, '10 轮', '10 rounds'], [20, '20 轮', '20 rounds'], [30, '30 轮', '30 rounds']]},
      {name: 'target', label: ['挑战目标', 'Challenge'], options: [[0, '不设', 'None'], [3, '3 轮内', 'Within 3'], [6, '6 轮内', 'Within 6'], [10, '10 轮内', 'Within 10']]}
    ],
    rules: () => [
      ['第一轮不设主题：两人各写一个词（最多 12 个字），提交后锁定，对方看不到，直到两人都提交后同时揭晓。', 'Round one has no theme: each writes a word (up to 12 characters). It is locked and hidden until both are in, then both are revealed together.'],
      ['两个词一样（忽略空格、标点和大小写）即挑战成功。', 'Same word (ignoring spaces, punctuation and case) and you have made it.'],
      ['不一样时，如果你们觉得意思相同（如“番茄”和“西红柿”），两人都点“算我们一样”也算成功。', 'If the words differ but mean the same (like “tomato” and “love apple”), you both may count it as the same.'],
      ['否则进入下一轮：各写一个同时和上一轮两个词有关的新词。本局出现过的词都不能再用。', 'Otherwise, next round: each writes a new word linked to both of the last two. No word may be used twice in a game.'],
      ['到时没写的人还有 15 秒；仍没写就算这一轮超时。连续 3 轮超时，计时会停下来等 TA。', 'Missing the time gives 15 more seconds; after that the round counts as timed out. Three in a row stop the clock until that player continues.'],
      ['有人掉线时计时暂停，回来后接着玩。达到轮数上限或两人都认输即挑战失败；中途离开记为中断。', 'If someone drops out, the clock pauses until they are back. Reaching the round limit, or both giving up, fails the challenge; leaving interrupts the game.']
    ]
  });
})();
