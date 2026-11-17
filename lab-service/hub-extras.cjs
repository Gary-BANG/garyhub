'use strict';
// Homepage/Tools "today" summary and search (v2.4.1.3): Calendar's own answer for the signed-in account,
// plus what only the Study Hub knows — the lecture being read and lecture titles. Read-only.
const fs = require('node:fs'), path = require('node:path');
const STUDY = 'https://tools.garyhub.uk/study/';
const ROUTES = new Set(['/api/hub/today', '/api/hub/search']);

function createExtras({DATA, identity, calendar, json}) {
  function courses(uid) {
    try {
      if (fs.existsSync(path.join(DATA, '.deleting-user-' + uid))) return [];
      const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'academic', 'user-' + uid + '.json'), 'utf8'));
      return Array.isArray(saved?.state?.courses) ? saved.state.courses : [];
    } catch { return []; }
  }
  const lectures = uid => courses(uid).flatMap(course => (Array.isArray(course.lectures) ? course.lectures : [])
    .filter(lecture => lecture && typeof lecture.title === 'string').map(lecture => ({course, lecture})));
  // The lecture marked "doing" that was scrolled furthest is the one being read.
  function reading(uid) {
    const all = lectures(uid), doing = all.filter(x => x.lecture.status === 'doing').sort((a, b) => (b.lecture.scroll || 0) - (a.lecture.scroll || 0));
    return {total: all.length, done: all.filter(x => x.lecture.status === 'done').length, doing: doing.length,
      current: doing[0] ? {title: doing[0].lecture.title, course: String(doing[0].course.name || ''), url: STUDY} : null};
  }
  return async function (req, res, url) {
    if (!ROUTES.has(url.pathname)) return false;
    try {
      if (req.method !== 'GET') { json(res, 405, {message: 'Method not allowed'}); return true; }
      const user = await identity(req);
      if (!user) { json(res, 401, {message: '请先登录 GaryHub'}); return true; }
      const upstream = await calendar(req, url.pathname + url.search);
      const data = await upstream.json();
      if (!upstream.ok) { json(res, upstream.status, {message: data.message || '请求失败'}); return true; }
      if (data.accountId !== user.id) { json(res, 409, {message: '登录账号已变化，请刷新页面'}); return true; }
      if (url.pathname === '/api/hub/today') data.study = reading(user.id);
      else {
        const needle = String(data.q || '').toLocaleLowerCase();
        const items = lectures(user.id).filter(x => x.lecture.title.toLocaleLowerCase().includes(needle)).slice(0, 6)
          .map(x => ({title: x.lecture.title, detail: String(x.course.name || ''), snippet: '', done: x.lecture.status === 'done', url: STUDY}));
        if (needle && items.length) data.groups.push({type: 'lecture', items});
      }
      json(res, 200, data);
    } catch (error) {
      json(res, error.status || 503, {message: error.status ? error.message : '服务暂时不可用，请稍后重试。'});
    }
    return true;
  };
}
module.exports = {createExtras};
