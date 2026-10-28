import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {asciiExpression,renderMath} from '../public/lab/math-markdown.mjs';
const require=createRequire(import.meta.url),katex=require('../public/lab/vendor/katex.min.js');
const known=['theta0','theta1','theta_dot_i','theta_ddot_i','vmax_i','amax_i','T_min','active_limit'];
const parse=s=>asciiExpression(s,known);

test('screenshot quintic and straight joint-space path retain operators and grouping',()=>{
 const path='theta(s)=theta0+s*(theta1-theta0)';
 assert.equal(parse(path).end,path.length);
 assert.equal(parse(path).tex,'\\theta\\left(s\\right) = \\theta_{0} + s \\cdot \\left(\\theta_{1} - \\theta_{0}\\right)');
 const quintic='s(t)=10*(t/T)^3-15*(t/T)^4+6*(t/T)^5';
 assert.equal(parse(quintic).end,quintic.length);
 assert.equal((parse(quintic).tex.match(/\\frac\{t\}\{T\}/g)||[]).length,3);
 assert.match(parse(quintic).tex,/\^\{3\} - 15.*\^\{4\} \+ 6.*\^\{5\}/);
});
test('joint speed and acceleration constraints use dots, subscripts and absolute values',()=>{
 assert.equal(parse('abs(theta_dot_i)<=vmax_i in rad/s').tex,'\\left|\\dot{\\theta}_{i}\\right| \\le \\mathrm{vmax}_{i}');
 assert.match(parse('abs(theta_ddot_i)<=amax_i').tex,/\\ddot\{\\theta\}_\{i\}/);
 assert.equal(parse('0<=t<=T.').tex,'0 \\le t \\le T');
});
test('scientific notation, max and comparison are preserved',()=>{
 assert.equal(parse('1e-10*max(1,T_min), return').tex,'1\\times10^{-10} \\cdot \\operatorname{max}\\left(1,T_{\\mathrm{min}}\\right)');
 assert.equal(parse('T_min=0 and active_limit=0.').tex,'T_{\\mathrm{min}} = 0');
});
test('precedence, powers and signs are faithful to explicit ASCII syntax',()=>{
 assert.equal(parse('a/b*c').tex,'\\frac{a}{b} \\cdot c');
 assert.equal(parse('-x^2').tex,'-{x}^{2}');
 assert.equal(parse('x^-2').tex,'{x}^{-2}');
 assert.equal(parse('a^b^c').tex,'{a}^{{b}^{c}}');
 assert.equal(parse('a-(b-c)').tex,'a - \\left(b - c\\right)');
});
test('unsupported and incomplete expressions are rejected without guessing',()=>{
 for(const source of ['a +','(a+b','a/','unknown(foo)','a + unknown','a**2','a+((('])assert.equal(parse(source),null,source);
 assert.equal(parse('ordinary words'),null);
});
test('bounded nesting and token count cannot throw on untrusted input',()=>{
 assert.equal(parse('('.repeat(1000)+'x'+')'.repeat(1000)),null);
 assert.doesNotThrow(()=>parse('a+'.repeat(3000)+'a'));
});
test('real bundled KaTeX renders valid equations and retains invalid source safely',()=>{
 assert.match(renderMath('R=e^{[\\omega]\\theta}',true,{katex}),/class="katex/);
 const bad='\\notARealMacro{<img src=x onerror=alert(1)>}';
 const html=renderMath(bad,false,{katex});
 assert.match(html,/lab-math-fallback/);assert.match(html,/&lt;img/);assert.ok(!html.includes('<img'));
});
