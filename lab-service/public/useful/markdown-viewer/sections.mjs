/* Build controls only after Markdown has passed the existing sanitizer. */
export function mountSections(preview, toc, previous = new Map(), onChange = () => {}) {
  const doc = preview.ownerDocument, headings = [], stack = [], counts = new Map();
  toc.replaceChildren();
  // Only document-level headings define sections; a heading inside a quote/list
  // stays inside that block and must not pull its surrounding nodes apart.
  for (const node of Array.from(preview.childNodes)) {
    if (node.nodeType === 1 && /^H[1-6]$/.test(node.tagName)) {
      const level = Number(node.tagName[1]), text = node.textContent.trim();
      while (stack.length && stack.at(-1).level >= level) stack.pop();
      const base = JSON.stringify([stack.at(-1)?.key || '', level, text]);
      const occurrence = counts.get(base) || 0; counts.set(base, occurrence + 1);
      const key = base + ':' + occurrence, details = doc.createElement('details');
      const summary = doc.createElement('summary'), body = doc.createElement('div');
      details.className = 'md-section'; body.className = 'section-body';
      details.id = 'md-section-' + headings.length;
      details.open = previous.get(key) === true;
      summary.append(node); details.append(summary, body);
      (stack.at(-1)?.body || preview).append(details);
      const entry = {key, level, text, details, body};
      stack.push(entry); headings.push(entry);
      const link = doc.createElement('a');
      link.textContent = text || '—'; link.href = '#' + details.id;
      link.dataset.userContent = ''; link.style.setProperty('--level', level - 1);
      link.addEventListener('click', event => {event.preventDefault(); reveal(entry);});
      toc.append(link);
      details.addEventListener('toggle', onChange);
    } else if (stack.length) stack.at(-1).body.append(node);
  }
  function reveal(entry) {
    for (let parent = entry.details; parent && parent !== preview; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    for (const link of toc.children) {
      if (link.hash === '#' + entry.details.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    preview.querySelector('.section-current')?.classList.remove('section-current');
    entry.details.classList.add('section-current');
    entry.details.querySelector('summary').focus({preventScroll:true});
    entry.details.scrollIntoView({block:'start', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    onChange();
  }
  return {
    count: headings.length,
    allOpen: () => headings.length > 0 && headings.every(h => h.details.open),
    snapshot: () => new Map(headings.map(h => [h.key, h.details.open])),
    setAll(open) {for (const h of headings) h.details.open = open; onChange();}
  };
}
