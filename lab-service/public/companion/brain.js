/* Local intent matching for the companion. No network, no stored transcript:
   reply() takes the message plus a small memory object and returns the next memory. */
((root, factory) => {
  const knowledge = typeof module === 'object' && module.exports ? require('./knowledge.js') : root.GaryHubCompanionKnowledge;
  const api = factory(knowledge);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GaryHubCompanionBrain = api;
})(typeof window === 'object' ? window : this, knowledge => {
  'use strict';
  const STRONG = 3, CJK = /[㐀-鿿]/;
  const clean = value => knowledge.normalize(value).replace(/[，。！？、；：,.!?;:"'“”‘’()（）[\]【】<>《》~～…·/\\|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Short technical words that say nothing about which language the visitor prefers.
  const neutral = new Set(['pdf','gpa','md','rss','2fa','otp','totp','latex','markdown','numpy','python','ece','mp3','vpn','cpu','ddl','readme','todo','ok']);
  const said = {
    greet:/^(你好|您好|嗨|哈喽|哈啰|早上好|下午好|晚上好|在吗|在不在)|^(hello|hi|hey|yo|good (morning|afternoon|evening))\b/,
    self:/你是谁|你叫什么|你的名字|你是什么|who are you|what('?s| is) your name|what are you/,
    abilities:/你能做什么|你会什么|能帮我什么|你能干(嘛|什么)|有什么(工具|功能)|^帮助$|怎么用你|what can you do|how can you help|^help$|what tools/,
    thanks:/谢谢|多谢|感谢|thank|^thx\b|^ty\b/,
    bye:/再见|拜拜|回头见|^bye\b|goodbye|see you/,
    howto:/怎么用|如何使用|怎么使用|怎么操作|使用方法|用法|how (do|can|should) i use|how to use|how does (it|this|that) work|how do i/,
    more:/还有(别的|其他|吗|呢)|其他的|别的呢|换一个|换个|不是这个|不对|anything else|something else|other options?|another one|not (this|that) one/
  };
  const ordinals = [/第一个|第1个|^第一$|^1$|first|^1st$/, /第二个|第2个|^第二$|^2$|second|^2nd$/];
  const phrases = new Map(knowledge.entries.map(entry => [entry.id, [...entry.phrases.zh, ...entry.phrases.en].map(clean).filter(Boolean)]));
  const keywords = new Map(knowledge.entries.map(entry => [entry.id, clean(entry.keywords).split(' ').filter(word => word.length >= (CJK.test(word) ? 2 : 3))]));

  function positions(text, phrase) {
    const found = [];
    if (CJK.test(phrase)) for (let i = text.indexOf(phrase); i >= 0; i = text.indexOf(phrase, i + 1)) found.push(i);
    else for (const m of text.matchAll(new RegExp('(^|[^a-z0-9])' + escape(phrase) + '(?=$|[^a-z0-9])', 'g'))) found.push(m.index + m[1].length);
    return found;
  }
  // "不是 PDF" or "not a pdf" should count against that tool, not for it.
  // A yes/no question ("有没有摄影", "是不是 PDF") asks for it instead.
  const question = /(有没有|是不是|能不能|会不会|要不要|可不可以|有木有) ?$/;
  const negated = (text, at) => !question.test(text.slice(Math.max(0, at - 5), at)) && /不|别|没|无需/.test(text.slice(Math.max(0, at - 3), at).trimEnd().slice(-2)) || /\b(not|don'?t|no|without|isn'?t)( an?| the)? $/.test(text.slice(Math.max(0, at - 14), at));
  const weight = phrase => CJK.test(phrase) ? STRONG + Math.floor(phrase.length / 4) : STRONG + phrase.split(' ').length - 1;

  function score(text, entry) {
    let total = 0;
    for (const phrase of phrases.get(entry.id)) for (const at of positions(text, phrase)) total += negated(text, at) ? -weight(phrase) : weight(phrase);
    for (const word of keywords.get(entry.id)) if (positions(text, word).length) total += 1;
    return total;
  }
  function rank(text, allowed) {
    const scored = allowed.map(entry => ({id:entry.id, parent:entry.parent, score:score(text, entry)})).filter(item => item.score > 0);
    // A specific page (Ledger) beats the place that contains it (Calendar).
    const specific = new Set(scored.filter(item => item.score >= STRONG && item.parent).map(item => item.parent));
    return scored.filter(item => !specific.has(item.id)).sort((a, b) => b.score - a.score);
  }
  function language(raw, fallback) {
    if (CJK.test(raw)) return 'zh';
    const words = (String(raw).toLowerCase().match(/[a-z][a-z0-9']+/g) || []).filter(word => !neutral.has(word));
    return words.length ? 'en' : fallback;
  }
  const siblings = (id, allowed) => {
    const category = knowledge.byId.get(id)?.category;
    return allowed.filter(entry => entry.category === category && entry.id !== id && !entry.parent).map(entry => entry.id);
  };

  function reply(input, {lang = 'zh', user = null, memory = {}} = {}) {
    const raw = String(input ?? '').slice(0, 500), text = clean(raw);
    const result = {lang:language(raw, lang === 'en' ? 'en' : 'zh'), tools:[], memory};
    const done = (kind, tools = [], extra = {}) => ({...result, kind, tools, ...extra});
    // Fresh suggestions reset what "第一个" / "还有别的吗" refer to.
    const suggest = (kind, tools, ranking) => done(kind, tools, {memory:{ranking, shown:tools, choices:tools, focus:tools[0]}});
    if (!text) return done('empty');
    const allowed = knowledge.entries.filter(entry => knowledge.permitted(entry, user));
    const ok = id => allowed.some(entry => entry.id === id);
    const ranked = rank(text, allowed), top = ranked[0], second = ranked[1];
    const strong = top?.score >= STRONG;

    if (said.howto.test(text) && !said.abilities.test(text)) {
      const target = strong ? top.id : ok(memory.focus) ? memory.focus : null;
      if (target) return done('howto', [target], {memory:{...memory, ranking:memory.ranking || [target], shown:[...new Set([...(memory.shown || []), target])], choices:[target], focus:target}});
    }
    if (!strong && memory.choices?.length) {
      const index = ordinals.findIndex(pattern => pattern.test(text));
      const picked = memory.choices[index];
      if (picked && ok(picked)) return done('recommend', [picked], {memory:{...memory, choices:[picked], focus:picked}});
    }
    if (!strong && said.more.test(text) && memory.ranking) {
      const shown = new Set(memory.shown || []);
      const next = [...memory.ranking, ...siblings(memory.focus, allowed)].filter((id, i, all) => all.indexOf(id) === i && !shown.has(id) && ok(id)).slice(0, 2);
      if (!next.length) return done('moreNone');
      return done('more', next, {memory:{...memory, shown:[...shown, ...next], choices:next, focus:next[0]}});
    }
    if (strong) {
      const ranking = [...ranked.map(item => item.id), ...siblings(top.id, allowed)].filter((id, i, all) => all.indexOf(id) === i);
      if (second?.score >= STRONG && second.score >= top.score - 1) return suggest('clarify', [top.id, second.id], ranking);
      return suggest('recommend', [top.id], ranking);
    }
    for (const kind of ['thanks', 'bye', 'self', 'abilities', 'greet']) if (said[kind].test(text)) return done(kind, [], kind === 'abilities' ? {categories:categories(allowed)} : {});
    const category = knowledge.categories.find(item => [...item.zh, ...item.en].some(word => positions(text, clean(word)).length));
    if (category) {
      const tools = allowed.filter(entry => entry.category === category.id).map(entry => entry.id).slice(0, 4);
      if (tools.length) return {...suggest('category', tools, tools), category:category.id};
    }
    if (top) return suggest('clarify', ranked.slice(0, 2).map(item => item.id), ranked.map(item => item.id));
    return done('none', [], {categories:categories(allowed)});
  }
  const categories = allowed => knowledge.categories.filter(item => allowed.some(entry => entry.category === item.id)).map(item => item.id);
  return {reply, clean, STRONG};
});
