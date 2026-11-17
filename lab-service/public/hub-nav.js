/* GaryHub shared header: on phones the navigation folds into one menu button (v2.4.1.3). */
(() => {
  'use strict';
  const headers = document.querySelectorAll('[data-gh-header]');
  const LABEL = {zh: ['打开菜单', '关闭菜单'], en: ['Open menu', 'Close menu']};
  const lang = () => window.GaryHubI18n?.language === 'en' ? 'en' : 'zh';
  headers.forEach((header, index) => {
    const menu = header.querySelector('[data-gh-menu]');
    if (!menu || header.querySelector('.gh-menu-toggle')) return;
    if (!menu.id) menu.id = 'gh-menu-' + index;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'gh-menu-toggle'; button.dataset.i18nIgnore = '';
    button.setAttribute('aria-controls', menu.id);
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    const set = open => {
      header.toggleAttribute('data-open', open);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', LABEL[lang()][open ? 1 : 0]);
    };
    button.addEventListener('click', () => set(!header.hasAttribute('data-open')));
    document.addEventListener('click', event => { if (header.hasAttribute('data-open') && !header.contains(event.target)) set(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && header.hasAttribute('data-open')) { set(false); button.focus(); } });
    menu.addEventListener('click', event => { if (event.target.closest('a')) set(false); });
    addEventListener('resize', () => { if (innerWidth > 760) set(false); });
    document.addEventListener('garyhub:language', () => set(header.hasAttribute('data-open')));
    (menu.parentElement === header ? header : menu.parentElement).append(button);
    set(false);
  });
})();
