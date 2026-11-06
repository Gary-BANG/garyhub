(() => {
  'use strict';
  const form = document.querySelector('#preferences');
  const fields = form.elements;
  const panel = form.querySelector('fieldset');
  const message = document.querySelector('#message');
  let accountId, revision;
  function preview() {
    document.documentElement.dataset.theme = fields.studyTheme.value;
    if (fields.fontSize.validity.valid) form.style.setProperty('--sample-body', fields.fontSize.value + 'px');
    if (fields.headingSize.validity.valid) form.style.setProperty('--sample-heading', fields.headingSize.value + 'px');
  }
  function signIn() {
    location.replace('https://calendar.garyhub.uk/login/?next=' + encodeURIComponent(location.href));
  }
  async function request(path, options) {
    const response = await fetch('/api/academic/' + path, { cache: 'no-store', ...options });
    if (response.status === 401) signIn();
    if (response.status === 428) location.replace('https://calendar.garyhub.uk/change-password/');
    if (!response.ok) throw Object.assign(new Error(), { status: response.status });
    return response.json();
  }
  async function load() {
    panel.disabled = true;
    try {
      const data = await request('preferences');
      accountId = data.accountId;
      revision = data.revision;
      fields.studyTheme.value = data.studyTheme === 'auto'
        ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : data.studyTheme;
      fields.fontSize.value = data.fontSize;
      fields.headingSize.value = data.headingSize;
      preview();
      panel.disabled = false;
    } catch { message.textContent = '无法载入设置，请刷新重试。'; }
  }
  form.addEventListener('input', preview);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (panel.disabled) return;
    panel.disabled = true;
    message.textContent = '正在保存设置';
    let conflict = false;
    try {
      const { token } = await request('csrf');
      const result = await request('preferences', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ accountId, revision, studyTheme: fields.studyTheme.value,
          fontSize: fields.fontSize.valueAsNumber, headingSize: fields.headingSize.valueAsNumber })
      });
      revision = result.revision;
      message.textContent = '设置已保存';
    } catch (error) {
      conflict = error.status === 409;
      message.textContent = conflict ? '设置已在其他页面更改，请刷新后再保存。' : '保存失败，请重试。';
    } finally { panel.disabled = conflict; }
  });
  const title = () => { document.title = window.GaryHubI18n.t('个性化') + ' · GaryHub'; };
  document.addEventListener('garyhub:language', title);
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  title(); load();
})();
