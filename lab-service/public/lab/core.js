import {shape,numbers} from './pack-validation.mjs';
export {VERSION,validatePack,shape,numbers} from './pack-validation.mjs';
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
