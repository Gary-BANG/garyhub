(() => {
  const bar=document.createElement('div');bar.className='gary-tool-bar';
  bar.innerHTML='<a href="https://tools.garyhub.uk/">← GaryHub Tools</a><span>文件在本机处理 · Processed on your device</span><button type="button" aria-label="切换日夜主题">◐ 日夜主题</button>';
  document.body.prepend(bar);
  let theme;try{theme=localStorage.getItem('garyhub-useful-theme');}catch{}
  theme=theme|| (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  const apply=()=>{document.documentElement.dataset.toolTheme=theme;};apply();
  bar.querySelector('button').onclick=()=>{theme=theme==='dark'?'light':'dark';apply();try{localStorage.setItem('garyhub-useful-theme',theme);}catch{}};
})();
