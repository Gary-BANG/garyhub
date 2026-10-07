export const VERSION=1;
const ident=/^[A-Za-z][A-Za-z0-9_]*$/;
const reserved=new Set(['np','mr','True','False','None','print','import','from','for','while','if','else','return','class','def','try','except','with','as','pass','break','continue','lambda','global','nonlocal','and','or','not','is','in','del','assert','raise','yield','async','await','match','case']);
export function shape(v){if(!Array.isArray(v))return [];const s=v.length?shape(v[0]):[];if(v.some(x=>JSON.stringify(shape(x))!==JSON.stringify(s)))throw Error('Ragged array / 数组每行长度不一致');return [v.length,...s]}
export function numbers(v){return Array.isArray(v)?v.flat(Infinity):[v]}
export function validatePack(pack){
 if(pack.schema_version!==VERSION||!Array.isArray(pack.problems)||!pack.problems.length)throw Error('Expected schema_version: 1 and nonempty problems array.');
 if(pack.problems.length>100)throw Error('每次最多导入 100 个模板。');
 const ids=new Set();
 for(const p of pack.problems){
  if(!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(p.id)||ids.has(p.id))throw Error('Invalid or duplicate problem id: '+p.id);ids.add(p.id);
  for(const k of ['title','category','similarity_group','statement_en','reference_code','explanation_md','formula_latex'])if(typeof p[k]!=='string'||!p[k].trim())throw Error(p.id+': missing '+k);
  if(p.assignment!==undefined&&(typeof p.assignment!=='string'||!p.assignment.trim()||p.assignment.length>120))throw Error(p.id+': assignment must be a nonempty string (max 120 characters)');
  if(!Number.isInteger(p.version)||p.version<1)throw Error(p.id+': version must be positive integer');
  if(!p.inputs||typeof p.inputs!=='object'||Array.isArray(p.inputs))throw Error(p.id+': inputs object required');
  for(const [name,x] of Object.entries(p.inputs)){
   if(!ident.test(name)||reserved.has(name)||!x||!['array','scalar','integer'].includes(x.type))throw Error(p.id+': invalid input '+name);
   if(x.type==='array'?!Array.isArray(x.value):Array.isArray(x.value))throw Error(name+': value/type mismatch');
   shape(x.value);const ns=numbers(x.value);if(!ns.length||ns.length>5000||ns.some(n=>typeof n!=='number'||!Number.isFinite(n)))throw Error(name+': finite numeric values required');
   if(x.type==='integer'&&!Number.isInteger(x.value))throw Error(name+': integer required');
   if(x.random){let r=x.random;if(![r.min,r.max,r.step].every(Number.isFinite)||r.max<r.min||r.step<=0||r.max-r.min<r.step||!r.unit)throw Error(name+': random needs min < max, positive step and unit');if(ns.some(n=>n<r.min||n>r.max))throw Error(name+': default outside range');if(x.type==='integer'&&(!Number.isInteger(r.min)||!Number.isInteger(r.step)))throw Error(name+': integer range required');}
  }
  if(!Array.isArray(p.answers)||!p.answers.length)throw Error(p.id+': answers array required');
  const vars=new Set();for(const a of p.answers){if(!ident.test(a.name)||reserved.has(a.name)||vars.has(a.name)||Object.hasOwn(p.inputs,a.name))throw Error(p.id+': invalid/duplicate answer name');vars.add(a.name);if(!Array.isArray(a.shape)||a.shape.length>3||a.shape.some(n=>!Number.isInteger(n)||n<1)||a.shape.reduce((n,x)=>n*x,1)>5000)throw Error(p.id+': invalid answer shape');for(const k of ['rtol','atol'])if(!Number.isFinite(a[k])||a[k]<0)throw Error(p.id+': '+k+' must be nonnegative');if(a.expected!==undefined){if(JSON.stringify(shape(a.expected))!==JSON.stringify(a.shape)||numbers(a.expected).some(n=>typeof n!=='number'||!Number.isFinite(n)))throw Error(p.id+': expected answer shape/value invalid');}}
  if(p.image&&!/^(images\/[a-zA-Z0-9_./-]+\.(png|jpg|jpeg|webp))$/.test(p.image))throw Error(p.id+': image must be images/*.png, jpg or webp');
  if(p.image?.includes('..'))throw Error('Unsafe image path');
  if(p.statement_en.length+p.reference_code.length+p.explanation_md.length>100000)throw Error(p.id+': content too large');
 }
 return pack;
}
export function instantiate(p,randomize=false,rng=Math.random){
 const values={};for(const [k,x] of Object.entries(p.inputs)){const r=x.random;const sample=v=>Array.isArray(v)?v.map(sample):Number((r.min+Math.floor(rng()*(Math.floor((r.max-r.min)/r.step+1e-8)+1))*r.step).toPrecision(12));values[k]=randomize&&r?sample(x.value):structuredClone(x.value)}return values;
}
export function pythonData(p,values){return 'import numpy as np\nfrom modern_robotics import *\n\n'+Object.entries(p.inputs).map(([k,x])=>`${k} = ${x.type==='array'?'np.array('+JSON.stringify(values[k])+', dtype=float)':JSON.stringify(values[k])}`).join('\n')+'\n';}
export function starter(p,values){return pythonData(p,values)+'\n'+(p.starter_code||'# Write your solution below.\n# Assign: '+p.answers.map(a=>a.name).join(', '))+'\n';}
export function judge(actual,expected,spec){
 if(!actual)return {ok:false,kind:'missing',message:`Missing variable: ${spec.name} / 没有找到指定变量`};
 if(actual.error)return {ok:false,kind:'type',message:actual.error};
 if(JSON.stringify(actual.shape)!==JSON.stringify(spec.shape))return {ok:false,kind:'shape',message:`${spec.name}: expected (${spec.shape.join(', ')}), got (${actual.shape.join(', ')}) / 数组形状不匹配`};
 const a=actual.values,b=expected.values;
 if(a.length!==b.length||a.some(x=>!Number.isFinite(x)))return {ok:false,kind:'numeric',message:'Answer contains NaN / infinity or invalid values.'};
 const diffs=a.map((v,i)=>Math.abs(v-b[i]));const ok=diffs.every((d,i)=>d<=spec.atol+spec.rtol*Math.abs(b[i]));
 return {ok,kind:ok?'pass':'numeric',message:ok?`${spec.name}: correct / 正确`:`${spec.name}: values differ / 数值不匹配`,max_error:Math.max(0,...diffs)};
}
export function interpolate(s,values){return s.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g,(_,k)=>Object.hasOwn(values,k)?JSON.stringify(values[k]):'{{'+k+'}}')}
