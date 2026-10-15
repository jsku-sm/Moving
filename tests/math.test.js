'use strict';
const assert = require('node:assert/strict');
const M = require('../src/math.js');
let checks = 0;
const ok=(value,message)=>{assert.ok(value,message);checks++;};
const eq=(a,b,message)=>{assert.equal(String(a),String(b),message);checks++;};
const throws=(fn,message)=>{assert.throws(fn,message);checks++;};
const poly=s=>M.parseEquation(s);
const same=(actual,expected)=>ok(M.equivalent(actual,poly(expected)), `${M.equation(actual)} != ${expected}`);
const peq=(actual,expected)=>actual.forEach((v,i)=>eq(v,M.q(expected[i])));
peq(M.point(M.translation(3,-2),[-2,3]),[1,1]);
peq(M.point(M.translation(2,0),[-4,1]),[-2,1]);
peq(M.point(M.translation('5/2','-1/2'),[0,0]),['5/2','-1/2']);
peq(M.point(M.translation(-2,1),[1,1]),[-1,2]);
peq(M.point(M.axisFrom('x=1'),[2,3]),[0,3]);
peq(M.point(M.axisFrom('x+y-1=0'),[2,3]),[-2,-1]);
peq(M.point(M.axisFrom('y=0'),[2,0]),[2,0]);
peq(M.point(M.central(0,0),[-3,2]),[3,-2]);
peq(M.point(M.central(1,2),[3,4]),[-1,0]);
same(M.shape(M.translation(3,-2),poly('x^2+y^2=4')),'(x-3)^2+(y+2)^2=4');
same(M.shape(M.translation(3,-2),poly('y=2x+1')),'y=2x-7');
same(M.shape(M.translation(3,-1),poly('(x-1)^2+(y-2)^2=4')),'(x-4)^2+(y-1)^2=4');
same(M.shape(M.axisFrom('x=0'),poly('(x-2)^2+(y-1)^2=4')),'(x+2)^2+(y-1)^2=4');
same(M.shape(M.axisFrom('y=x'),poly('y=x^2')),'x=y^2');
same(M.shape(M.axisFrom('y=-x'),poly('y=x^2')),'x=-y^2');
same(M.shape(M.axisFrom('y=x'),poly('y=2x+1')),'x=2y+1');
same(M.shape(M.axisFrom('x=1'),poly('x=2')),'x=0');
same(poly('y=−x²+2x−1'), 'y=-(x-1)^2');
same(poly('2x+2y=2'), 'x+y=1');
same(poly('y=(1/2)x²+0.5x'), '2y=x^2+x');
same(poly('x²+y²=4'),'x^2+y^2=4');
eq(M.parseNumber('-1/3').add('1/6'),'-1/6');
eq(M.parseNumber('0.1').add('0.2'),'3/10');
same(poly(M.equation(poly('(x-1/3)^2+(y+2/5)^2=4'),false)),'(x-1/3)^2+(y+2/5)^2=4');
for(const s of ['x^2+y^2=-1','x^2=-1','-x^2-3y^2=1','x^2+2x+2=0','1=0','0=0']) ok(!M.locus(poly(s)).real,`Should have no drawable curve: ${s}`);
for(const s of ['x^2+y^2=0','(x-2)^2+(y+3)^2=0','x^2=1','x^2-y^2=0','xy=1','x=y^2','(x+y)^2=0','x^2+y=0','x+y=0'])ok(M.locus(poly(s)).real,`Should be real: ${s}`);
for(const s of ['x^3+y=0','y=sin(x)','y=1/x','y=x/(x+1)','y=alert(1)','y=window.location','y=x;1','x==2','(x+1=0','y=x^^2','y=1/0','y=x^20','y=√x'])throws(()=>poly(s));
throws(()=>M.axisFrom('y=x^2'));throws(()=>M.axisFrom('0x+0y+1=0'));throws(()=>M.parseNumber('101'));throws(()=>M.parseNumber('x'));
// Deterministic property tests: exact inverse, reflection involution, orthogonality,
// midpoint on mirror, and transformed representative points on the transformed curve.
for(let i=1;i<=180;i++){
 const p=[M.q(i%9-4).div(i%3+1),M.q(i%11-5).div(i%4+1)],a=M.q(i%7-3).div(3),b=M.q(i%5-2).div(2);
 const trans=M.translation(a,b),back=M.translation(a.neg(),b.neg());
 peq(M.point(back,M.point(trans,p)),p);
 const A=i%5+1,B=i%7-3,C=i%13-6,T=M.reflection(A,B,C),P=M.point(T,p),H=M.foot(T,p);
 peq(M.point(T,P),p);
 eq(H[0].mul(A).add(H[1].mul(B)).add(C),0);
 eq(p[0].add(P[0]).div(2),H[0]);eq(p[1].add(P[1]).div(2),H[1]);
 eq(P[0].sub(p[0]).mul(B).sub(P[1].sub(p[1]).mul(A)),0);
 const shapes=[poly(`(x-${i%4})^2+(y+${i%3})^2=9`),poly(`y=${i%7+1}x^2+${i%5}x-${i%4}`),poly(`xy+${i%3+1}x^2-y^2=1`)];
 for(const f of shapes){ok(M.equivalent(M.shape(T,M.shape(T,f)),f));ok(M.equivalent(M.shape(back,M.shape(trans,f)),f));same(poly(M.equation(f,false)),M.equation(f,false));}
 const f=shapes[0],g=M.shape(T,f);
 for(const r of M.representatives(f).filter(r=>r.label!=='C')){const rr=M.point(T,r.p);eq(M.evalQ(g,...rr),0);}
}
console.log(JSON.stringify({suite:'exact-math',status:'passed',assertions:checks},null,2));
