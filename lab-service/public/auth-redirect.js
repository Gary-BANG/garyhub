(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GaryHubAuth=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const LOGIN='https://calendar.garyhub.uk/login/';
  const routes={
    'https://calendar.garyhub.uk':['/','/journal/','/health-records/','/ledger/','/ledger/fixed/','/todos/','/change-password/'],
    'https://tools.garyhub.uk':['/','/grades/','/study/','/academic/index.html','/access/','/admin/','/totp/','/lab/','/useful/image-eraser/','/useful/markdown-viewer/','/useful/pdf-gray/'],
    'https://lab.garyhub.uk':['/','/lab/','/grades/','/study/','/access/','/totp/','/admin/','/useful/image-eraser/','/useful/markdown-viewer/','/useful/pdf-gray/'],
    'https://garyhub.uk':['/','/index.html']
  };
  function safeNext(input,base='https://calendar.garyhub.uk/'){
    try{
      if(typeof input!=='string'||input.length>4096||/[\u0000-\u0020\\]/.test(input)||input.startsWith('//'))throw Error();
      const u=new URL(input,base);
      const canonicalPath=u.pathname.endsWith('/index.html')?u.pathname.slice(0,-10):u.pathname;
      if(routes[u.origin]?.includes(canonicalPath))u.pathname=canonicalPath;
      if(!u.pathname.endsWith('/')&&!u.pathname.includes('.'))u.pathname+='/';
      if(u.username||u.password||u.port||!routes[u.origin]?.includes(u.pathname))throw Error();
      return u.href;
    }catch{return 'https://calendar.garyhub.uk/';}
  }
  function loginUrl(target,base){return LOGIN+'?next='+encodeURIComponent(safeNext(target,base));}
  return {safeNext,loginUrl,LOGIN};
});
