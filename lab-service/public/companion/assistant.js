/* Companion assistant client. Calendar answers these routes itself; Home, Tools and Lab forward
   them with the shared session, so every page uses the same paths on its own host.
   Changes to records always need an explicit confirm() for an action the server prepared. */
(() => {
  'use strict';
  if (window.GaryHubCompanionAssistant) return;
  async function request(path, options = {}) {
    const response = await fetch(path, {cache:'no-store', credentials:'same-origin', ...options});
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw Object.assign(Error(typeof data.message === 'string' ? data.message : ''), {status:response.status, code:data.code});
    return data;
  }
  async function send(path, body) {
    const {token} = await request('/api/csrf');
    return request(path, {method:'POST', headers:{'Content-Type':'application/json', 'X-CSRF-Token':token}, body:JSON.stringify(body)});
  }
  const action = (id, verb) => send(`/api/assistant/actions/${encodeURIComponent(id)}/${verb}`, {});
  window.GaryHubCompanionAssistant = {
    status:() => request('/api/assistant/status'),
    chat:payload => send('/api/assistant/chat', payload),
    forget:() => send('/api/assistant/memory/clear', {}),
    confirm:id => action(id, 'confirm'),
    cancel:id => action(id, 'cancel')
  };
})();
