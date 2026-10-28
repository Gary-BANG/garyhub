// Presentation only: the saved question, code and answer gate remain untouched.
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const greek=new Set('alpha beta gamma delta epsilon theta lambda mu nu xi pi rho sigma tau phi chi psi omega'.split(' '));
const functions=new Set('abs sqrt sin cos tan asin acos atan exp log ln max min'.split(' '));
const operators={'=':'=', '==':'=', '!=':'\\ne', '<':'<', '>':'>', '<=':'\\le', '>=':'\\ge', '+':'+', '-':'-', '*':'\\cdot', '/':'/', '^':'^'};
const precedence={'=':1,'==':1,'!=':1,'<':1,'>':1,'<=':1,'>=':1,'+':2,'-':2,'*':3,'/':3,'^':5};

function identifier(name,known){
 const parts=name.split('_'),head=parts.shift(),match=head.match(/^([A-Za-z]+)(\d*)$/);
 if(!match)return null;
 const [,base,digits]=match;
 if(!greek.has(base)&&base.length!==1&&!known.has(name)&&!known.has(base)&&!functions.has(base))return null;
 let tex=greek.has(base)?'\\'+base:base.length===1?base:'\\mathrm{'+base+'}';
 if(parts[0]==='dot'||parts[0]==='ddot')tex='\\'+parts.shift()+'{'+tex+'}';
 const sub=[digits,...parts].filter(Boolean).map(s=>s.length===1||/^\d+$/.test(s)?s:greek.has(s)?'\\'+s:'\\mathrm{'+s+'}').join(',');
 return tex+(sub?'_{'+sub+'}':'');
}

// A deliberately limited ASCII grammar. No evaluation or inferred equations.
// Returning null leaves unsupported notation verbatim.
export function asciiExpression(source,knownNames=[]){
 const known=new Set(knownNames),tokens=[];let at=0;
 while(at<source.length&&tokens.length<256){
  const match=/^(\s*)(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z][A-Za-z0-9_]*|<=|>=|==|!=|[+*/^=<>(),\[\]-])/.exec(source.slice(at));
  if(!match)break;
  at+=match[0].length;tokens.push({value:match[2],end:at});
 }
 if(tokens.length===256&&at<source.length)return null;
 let i=0,depth=0,math=false;
 const atom=()=>{
  if(++depth>24)throw Error('depth');
  const t=tokens[i++]?.value;let tex;
  if(t==='+'||t==='-'){const value=expr(4);if(value===null)throw Error('unary');tex=t+value;math=true;}
  else if(t==='('||t==='['){
   const values=[expr(0)];if(values[0]===null)throw Error('group');
   while(tokens[i]?.value===','){i++;values.push(expr(0));if(values.at(-1)===null)throw Error('group');}
   if(tokens[i++]?.value!==(t==='('?')':']'))throw Error('group');
   tex='\\left'+t+values.join(',')+'\\right'+(t==='('?')':']');
  }else if(t&&/^\d/.test(t))tex=t.replace(/[eE]([+-]?\d+)$/,'\\times10^{$1}');
  else if(t&&/^[A-Za-z]/.test(t)){
   tex=identifier(t,known);if(tex===null)throw Error('identifier');
   if(tokens[i]?.value==='('&&(functions.has(t)||greek.has(t)||t.length===1)){
    i++;const args=[expr(0)];if(args[0]===null)throw Error('argument');
    while(tokens[i]?.value===','){i++;args.push(expr(0));if(args.at(-1)===null)throw Error('argument');}
    if(tokens[i++]?.value!==')')throw Error('argument');
    tex=t==='abs'&&args.length===1?'\\left|'+args[0]+'\\right|':t==='sqrt'&&args.length===1?'\\sqrt{'+args[0]+'}':(functions.has(t)?'\\operatorname{'+t+'}':tex)+'\\left('+args.join(',')+'\\right)';math=true;
   }
  }else throw Error('atom');
  depth--;return tex;
 };
 const expr=min=>{
  let left=atom();
  while(i<tokens.length){
   const op=tokens[i].value,p=precedence[op];if(p===undefined||p<min)break;
   const saved=i;i++;let right;
   try{right=expr(p+(op==='^'?0:1));}catch{i=saved;break;}
   left=op==='/'?'\\frac{'+left+'}{'+right+'}':op==='^'?'{'+left+'}^{'+right+'}':left+' '+operators[op]+' '+right;math=true;
  }
  return left;
 };
 try{
  const tex=expr(0),end=tokens[i-1]?.end||0;
  // Incomplete operators or groups are never silently discarded.
  if(tokens[i]&&(/^[+*/^=<>\[\]-]$/.test(tokens[i].value)||tokens[i].value in operators))return null;
  return {tex,end,math};
 }catch{return null;}
}

export function renderMath(source,display=false,deps=globalThis){
 try{return deps.katex.renderToString(source,{displayMode:display,throwOnError:true,trust:false,strict:'ignore',maxSize:20,maxExpand:1000});}
 catch{return '<span class="lab-math-fallback" title="公式无法解析，显示原文 / Unrecognized formula; original text">'+escapeHTML(source)+'</span>';}
}

export function renderMarkdown(source,{names=[],legacy=false,...deps}={}){
 const env={marked:globalThis.marked,DOMPurify:globalThis.DOMPurify,katex:globalThis.katex,...deps};
 const math=[],prefix='LABMATH'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)).replaceAll('-','')+'TOKEN';
 const placeholder=(text,tex,display=false)=>{math.push('<span class="lab-formula" data-source="'+escapeHTML(text)+'">'+renderMath(tex,display,env)+'</span>');return prefix+(math.length-1)+'END';};
 const known=new Set([...names,'theta','theta0','theta1','theta_dot_i','theta_ddot_i','vmax_i','amax_i','T_min','active_limit','tau_start','endpoint_code','com_radius']);
 // Code, links, HTML, and existing math are consumed before legacy notation.
 const protectedToken=/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\1[^\n]*(?:\n|$)|$)|^(`+)[^\n]*?\2(?!`)|^\$\$([\s\S]*?)\$\$|^\\\[([\s\S]*?)\\\]|^\\\(([\s\S]*?)\\\)|^\$([^$\n]+?)\$|^!?\[[^\]\n]*\]\([^\n]*?\)|^<(?:pre|code)\b[^>]*>[\s\S]*?<\/(?:pre|code)\s*>|^<[^>\n]*>/;
 let prepared='',at=0;
 while(at<source.length){
  const tail=source.slice(at),indented=(!at||source[at-1]==='\n')&&/^(?:(?: {4}|\t)[^\n]*(?:\n|$))+/.exec(tail);
  if(indented){prepared+=indented[0];at+=indented[0].length;continue;}
  const special=protectedToken.exec(tail);
  if(special){
   const tex=special[3]??special[4]??special[5]??special[6];
   prepared+=tex===undefined?special[0]:placeholder(special[0],tex,special[3]!==undefined||special[4]!==undefined);at+=special[0].length;continue;
  }
  if(legacy&&/^[A-Za-z0-9(]/.test(tail)&&(!at||!/[A-Za-z0-9_\\]/.test(source[at-1]))){
   const parsed=asciiExpression(tail,[...known]);
   if(parsed){
    const text=tail.slice(0,parsed.end),word=/^[A-Za-z][A-Za-z0-9_]*$/.test(text);
    if(parsed.math||word&&(known.has(text)||/^theta(?:\d|_)/.test(text))){prepared+=placeholder(text,parsed.tex);at+=parsed.end;continue;}
   }
   // Keep unknown identifiers intact: underscores must not consume later prose.
   const word=/^[A-Za-z][A-Za-z0-9_]*\b/.exec(tail);
   if(word?.[0].includes('_')){prepared+=word[0].replaceAll('_','\\_');at+=word[0].length;continue;}
  }
  prepared+=source[at++];
 }
 const clean=env.DOMPurify.sanitize(env.marked.parse(prepared),{FORBID_TAGS:['img','iframe','style','script','input','form'],FORBID_ATTR:['style']});
 return clean.replace(new RegExp(prefix+'(\\d+)END','g'),(_,index)=>math[Number(index)]||'');
}
