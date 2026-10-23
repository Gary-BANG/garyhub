(() => {
  const bar=document.createElement('nav');bar.className='gary-tool-bar';bar.setAttribute('aria-label','实用工具导航');
  bar.innerHTML='<a href="https://tools.garyhub.uk/">← GaryHub Tools</a><span>文件在本机处理</span><div class="nav-right"><button type="button" aria-label="切换日夜主题">◐ 日夜主题</button></div>';
  document.body.prepend(bar);
  let theme;try{theme=localStorage.getItem('garyhub-useful-theme');}catch{}
  theme=theme|| (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  const apply=()=>{document.documentElement.dataset.toolTheme=theme;};apply();
  bar.querySelector('button').onclick=()=>{theme=theme==='dark'?'light':'dark';apply();try{localStorage.setItem('garyhub-useful-theme',theme);}catch{}};
  window.GaryHubI18n?.scan(bar);
})();
