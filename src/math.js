/* Move Lab — exact rational arithmetic and a closed polynomial grammar.
 * No eval(), Function(), remote calculators or external dependencies.
 * Polynomials are immutable Map<"xDegree,yDegree", Rational>, total degree <= 2.
 */
(function (root) {
  'use strict';
  const abs = n => n < 0n ? -n : n;
  function gcd(a, b) { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a || 1n; }
  class Q {
    constructor(n = 0n, d = 1n) {
      n = BigInt(n); d = BigInt(d);
      if (!d) throw new Error('0으로 나눌 수 없습니다. 분모를 확인해 주세요.');
      if (d < 0n) { n = -n; d = -d; }
      const g = gcd(n, d); this.n = n / g; this.d = d / g;
      if (abs(this.n).toString().length > 140 || this.d.toString().length > 140) throw new Error('계산할 수 있는 수의 범위를 넘었습니다. 더 간단한 수를 입력해 주세요.');
      Object.freeze(this);
    }
    static from(v) {
      if (v instanceof Q) return v;
      if (typeof v === 'bigint') return new Q(v);
      const s = String(v).trim();
      if (s.includes('/')) { const a = s.split('/'); if (a.length !== 2) throw new Error('분수 형식을 확인해 주세요. 예: 1/2'); return Q.from(a[0]).div(Q.from(a[1])); }
      if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) throw new Error('숫자, 소수 또는 분수를 입력해 주세요. 예: -2, 0.5, 1/2');
      if (s.replace(/[^0-9]/g, '').length > 16) throw new Error('숫자는 16자리 이내로 입력해 주세요.');
      const sign = s.startsWith('-') ? -1n : 1n, raw = s.replace(/^[+-]/, ''), [i, f = ''] = raw.split('.');
      return new Q(sign * BigInt((i || '0') + f), 10n ** BigInt(f.length));
    }
    add(v) { v = Q.from(v); return new Q(this.n * v.d + v.n * this.d, this.d * v.d); }
    sub(v) { return this.add(Q.from(v).neg()); }
    mul(v) { v = Q.from(v); return new Q(this.n * v.n, this.d * v.d); }
    div(v) { v = Q.from(v); return new Q(this.n * v.d, this.d * v.n); }
    neg() { return new Q(-this.n, this.d); }
    eq(v) { v = Q.from(v); return this.n === v.n && this.d === v.d; }
    get zero() { return this.n === 0n; }
    get num() { return Number(this.n) / Number(this.d); }
    toString() { return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`; }
    toJSON() { return this.toString(); }
  }
  const q = v => Q.from(v), Z = q(0), O = q(1);
  const constant = v => { v = q(v); return v.zero ? new Map() : new Map([['0,0', v]]); };
  const variable = axis => new Map([[axis === 'x' ? '1,0' : '0,1', O]]);
  const get = (p, i, j) => p.get(`${i},${j}`) || Z;
  const add = (a, b) => { const p = new Map(a); for (const [k, v] of b) { const r = (p.get(k) || Z).add(v); if (r.zero) p.delete(k); else p.set(k, r); } return p; };
  const scale = (p, v) => { v = q(v); return new Map([...p].map(([k, a]) => [k, a.mul(v)]).filter(([, a]) => !a.zero)); };
  const sub = (a, b) => add(a, scale(b, -1));
  function mul(a, b) {
    let p = new Map();
    for (const [ka, va] of a) for (const [kb, vb] of b) {
      const aa = ka.split(',').map(Number), bb = kb.split(',').map(Number), i = aa[0] + bb[0], j = aa[1] + bb[1];
      if (i + j > 2) throw new Error('이 버전은 x, y의 일차·이차 다항 방정식만 지원합니다. 예: y=2x+1, x²+y²=4');
      p = add(p, new Map([[`${i},${j}`, va.mul(vb)]]));
    }
    return p;
  }
  function normalize(p) {
    if (!p.size) return p;
    let den = 1n; for (const [, v] of p) den = den * v.d / gcd(den, v.d);
    let g = 0n; for (const [, v] of p) { const n = abs(v.n * (den / v.d)); g = g ? gcd(g, n) : n; }
    const keys = ['2,0', '1,1', '0,2', '1,0', '0,1', '0,0'];
    const first = keys.map(k => p.get(k)).find(Boolean), sign = first.n < 0n ? -1n : 1n;
    return scale(p, new Q(den * sign, g));
  }
  function clean(s) {
    return s.replace(/[−–－]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/＝/g, '=').replace(/²/g, '^2').replace(/³/g, '^3').replace(/\s/g, '').toLowerCase();
  }
  function parseExpression(text) {
    const s = clean(text);
    if (!s || s.length > 260) throw new Error('식을 260자 이내로 입력해 주세요. 예: (x-1)^2+(y-2)^2');
    const tokens = []; let i = 0;
    while (i < s.length) {
      const m = s.slice(i).match(/^(\d+(?:\.\d*)?|\.\d+)/);
      if (m) { tokens.push({ t: 'n', v: m[0] }); i += m[0].length; }
      else if ('xy+-*/^()'.includes(s[i])) tokens.push({ t: s[i++] });
      else throw new Error(`'${s[i]}'는 사용할 수 없습니다. x, y, 숫자와 + − × ÷, 괄호, 제곱을 사용해 주세요.`);
      if (tokens.length > 180) throw new Error('식이 너무 깁니다. 식을 간단히 정리해서 입력해 주세요.');
    }
    let pos = 0, depth = 0;
    const peek = () => tokens[pos]?.t;
    function atom() {
      if (++depth > 24) throw new Error('괄호가 너무 깊게 중첩되어 있습니다.');
      let p; const t = tokens[pos++];
      if (!t) throw new Error('식이 끝나지 않았습니다. 숫자 또는 변수를 확인해 주세요.');
      if (t.t === 'n') p = constant(q(t.v));
      else if (t.t === 'x' || t.t === 'y') p = variable(t.t);
      else if (t.t === '(') { p = sum(); if (peek() !== ')') throw new Error('닫는 괄호 )가 필요합니다.'); pos++; }
      else throw new Error('숫자·변수·괄호의 순서를 확인해 주세요.');
      depth--; return p;
    }
    function power() {
      let p = atom();
      if (peek() === '^') { pos++; const t = tokens[pos++]; if (!t || t.t !== 'n' || !/^[012]$/.test(t.v)) throw new Error('지수는 0, 1, 2만 사용할 수 있습니다.'); const n = +t.v; p = n === 0 ? constant(1) : n === 1 ? p : mul(p, p); }
      return p;
    }
    function unary() { if (peek() === '+' || peek() === '-') { const t = tokens[pos++].t; return scale(unary(), t === '-' ? -1 : 1); } return power(); }
    function product() {
      let p = unary();
      while (pos < tokens.length) {
        const t = peek();
        if (t === '*') { pos++; p = mul(p, unary()); }
        else if (t === '/') { pos++; const d = unary(); if ([...d.keys()].some(k => k !== '0,0')) throw new Error('분모에는 숫자만 사용할 수 있습니다. 변수의 분수식은 아직 지원하지 않습니다.'); p = scale(p, O.div(get(d, 0, 0))); }
        else if (['n', 'x', 'y', '('].includes(t)) p = mul(p, unary());
        else break;
      }
      return p;
    }
    function sum() { let p = product(); while (peek() === '+' || peek() === '-') { const t = tokens[pos++].t, b = product(); p = t === '+' ? add(p, b) : sub(p, b); } return p; }
    const result = sum(); if (pos !== tokens.length) throw new Error('괄호 또는 연산기호의 위치를 확인해 주세요.'); return result;
  }
  function parseEquation(text) {
    const parts = clean(text).split('=');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('등호를 하나 넣어 방정식으로 입력해 주세요. 예: y=2x+1');
    return normalize(sub(parseExpression(parts[0]), parseExpression(parts[1])));
  }
  function parseNumber(text, limit = 100) {
    const p = parseExpression(String(text));
    if ([...p.keys()].some(k => k !== '0,0')) throw new Error('좌표와 이동량에는 숫자·소수·분수만 입력해 주세요.');
    const v = get(p, 0, 0);
    if (Math.abs(v.num) > limit) throw new Error(`입력은 −${limit}부터 ${limit}까지 가능합니다. 작은 값부터 실험해 보세요.`);
    return v;
  }
  const coeff = p => [[2, 0], [1, 1], [0, 2], [1, 0], [0, 1], [0, 0]].map(([i, j]) => get(p, i, j));
  function evalQ(p, x, y) { x = q(x); y = q(y); let v = Z; for (const [k, c] of p) { const [i, j] = k.split(',').map(Number); let t = c; for (let a = 0; a < i; a++) t = t.mul(x); for (let a = 0; a < j; a++) t = t.mul(y); v = v.add(t); } return v; }
  function evalN(p, x, y) { const [a, b, c, d, e, f] = coeff(p).map(v => v.num); return a * x * x + b * x * y + c * y * y + d * x + e * y + f; }
  function substitute(p, lx, ly) {
    let out = new Map();
    for (const [key, c] of p) { const [i, j] = key.split(',').map(Number); let term = constant(c); for (let n = 0; n < i; n++) term = mul(term, lx); for (let n = 0; n < j; n++) term = mul(term, ly); out = add(out, term); }
    return normalize(out);
  }
  const linear = (a, b, c) => add(add(scale(variable('x'), a), scale(variable('y'), b)), constant(c));
  const identity = () => ({ m: [[O, Z], [Z, O]], t: [Z, Z] });
  function translation(a, b) { a = q(a); b = q(b); return { ...identity(), t: [a, b], inv: { ...identity(), t: [a.neg(), b.neg()] }, kind: 'translation', a, b }; }
  function reflection(A, B, C) {
    A = q(A); B = q(B); C = q(C); const den = A.mul(A).add(B.mul(B));
    if (den.zero) throw new Error('대칭축은 직선이어야 합니다. Ax+By+C=0에서 A와 B가 동시에 0일 수 없습니다.');
    const m = [[O.sub(A.mul(A).mul(2).div(den)), A.mul(B).mul(-2).div(den)], [A.mul(B).mul(-2).div(den), O.sub(B.mul(B).mul(2).div(den))]];
    const t = [A.mul(C).mul(-2).div(den), B.mul(C).mul(-2).div(den)];
    return { m, t, inv: { m, t }, kind: 'axis', A, B, C };
  }
  function central(h, k) { h = q(h); k = q(k); const m = [[q(-1), Z], [Z, q(-1)]], t = [h.mul(2), k.mul(2)]; return { m, t, inv: { m, t }, kind: 'center', h, k }; }
  function point(T, p) { return T.m.map((row, i) => row[0].mul(p[0]).add(row[1].mul(p[1])).add(T.t[i])); }
  function shape(T, p) { const I = T.inv; return substitute(p, linear(I.m[0][0], I.m[0][1], I.t[0]), linear(I.m[1][0], I.m[1][1], I.t[1])); }
  function axisFrom(text) {
    const p = parseEquation(text), [a, b, c, A, B, C] = coeff(p);
    if (!a.zero || !b.zero || !c.zero) throw new Error('대칭축은 직선만 가능합니다. 예: y=x, x=2, x+y-1=0');
    return reflection(A, B, C);
  }
  function foot(T, p) {
    if (T.kind === 'center') return [T.h, T.k];
    const d = T.A.mul(p[0]).add(T.B.mul(p[1])).add(T.C).div(T.A.mul(T.A).add(T.B.mul(T.B)));
    return [p[0].sub(T.A.mul(d)), p[1].sub(T.B.mul(d))];
  }
  const signNum = v => q(v).num >= 0 ? `+${q(v)}` : q(v).toString().replace('-', '−');
  const fmt = v => q(v).toString().replace('-', '−');
  function formatTerms(terms, unicode = true) {
    let s = '';
    for (const [cv, monom] of terms) { const c = q(cv); if (c.zero) continue; const neg = c.n < 0n, v = neg ? c.neg() : c; let n = monom && v.eq(1) ? '' : v.toString(); if (monom && v.d !== 1n && !unicode) n = `(${n})*`; s += (s ? (neg ? ' - ' : ' + ') : (neg ? '-' : '')) + n + monom; }
    s ||= '0'; return unicode ? s.replace(/\^2/g, '²').replace(/-/g, '−') : s;
  }
  function squareTerm(v, center, unicode) { const h = q(center); const exp = unicode ? '²' : '^2'; if (h.zero) return `${v}${exp}`; return `(${v} ${h.num < 0 ? '+' : (unicode ? '−' : '-')} ${h.num < 0 ? fmt(h.neg()) : fmt(h)})${exp}`; }
  function circleData(p) {
    const [a, b, c, d, e, f] = coeff(p);
    if (!a.zero && a.eq(c) && b.zero) { const h = d.neg().div(a.mul(2)), k = e.neg().div(a.mul(2)), r2 = h.mul(h).add(k.mul(k)).sub(f.div(a)); return { h, k, r2 }; }
    return null;
  }
  function equation(p, unicode = true) {
    const [a, b, c, d, e, f] = coeff(p), cd = circleData(p);
    if (cd) { let s = `${squareTerm('x', cd.h, unicode)} + ${squareTerm('y', cd.k, unicode)} = ${cd.r2}`; return unicode ? s.replace(/-/g, '−') : s.replace(/−/g, '-'); }
    if (a.zero && b.zero && c.zero && !e.zero) return 'y = ' + formatTerms([[d.neg().div(e), 'x'], [f.neg().div(e), '']], unicode);
    if (a.zero && b.zero && c.zero && e.zero && !d.zero) return 'x = ' + (unicode ? fmt(f.neg().div(d)) : f.neg().div(d).toString());
    if (b.zero && c.zero && !e.zero) return 'y = ' + formatTerms([[a.neg().div(e), 'x^2'], [d.neg().div(e), 'x'], [f.neg().div(e), '']], unicode);
    if (a.zero && b.zero && !d.zero) return 'x = ' + formatTerms([[c.neg().div(d), 'y^2'], [e.neg().div(d), 'y'], [f.neg().div(d), '']], unicode);
    return formatTerms([[a, 'x^2'], [b, 'xy'], [c, 'y^2'], [d, 'x'], [e, 'y'], [f, '']], unicode) + ' = 0';
  }
  function equivalent(a, b) { a = normalize(a); b = normalize(b); return coeff(a).every((v, i) => v.eq(coeff(b)[i])); }
  function locus(p) {
    const cs = coeff(p).map(v => v.num), norm = Math.max(...cs.map(Math.abs), 1), [a, b, c, d, e, f] = cs.map(v => v / norm), eps = 1e-11;
    if (Math.abs(a) + Math.abs(b) + Math.abs(c) < eps) return Math.abs(d) + Math.abs(e) > eps ? { real: true, type: 'line' } : { real: false, reason: Math.abs(f) < eps ? '이 식은 좌표평면 전체를 나타냅니다. 점 또는 곡선을 나타내는 식을 입력해 주세요.' : '이 방정식을 만족하는 실수 좌표가 없습니다.' };
    const det = a * c - b * b / 4;
    if (Math.abs(det) > eps) {
      const x = (-c * d + b * e / 2) / (2 * det), y = (b * d / 2 - a * e) / (2 * det), v = a * x * x + b * x * y + c * y * y + d * x + e * y + f;
      if (det > eps) { const s = a > 0 ? 1 : -1; if (v * s > eps) return { real: false, reason: '이 방정식을 만족하는 실수 좌표가 없습니다. 예: x²+y²=4를 입력해 보세요.' }; return { real: true, type: Math.abs(v) < eps ? 'point' : 'ellipse', center: [x, y] }; }
      return { real: true, type: 'hyperbola', center: [x, y] };
    }
    let u = Math.abs(a) > Math.abs(c) ? [a, b / 2] : [b / 2, c]; const length = Math.hypot(...u); u = u.map(v => v / length); const n = [-u[1], u[0]], linearNull = d * n[0] + e * n[1], lam = a + c;
    if (Math.abs(linearNull) > eps) return { real: true, type: 'parabola' };
    const lu = d * u[0] + e * u[1], r2 = (lu * lu / (4 * lam) - f) / lam;
    return r2 < -eps ? { real: false, reason: '이 방정식을 만족하는 실수 좌표가 없습니다.' } : { real: true, type: 'parallel' };
  }
  function roots(a, b, c) {
    const eps = 1e-10 * Math.max(Math.abs(a), Math.abs(b), Math.abs(c), 1);
    if (Math.abs(a) < eps) return Math.abs(b) < eps ? [] : [-c / b];
    let d = b * b - 4 * a * c; if (d < -eps) return []; d = Math.sqrt(Math.max(0, d)); if (!d) return [-b / (2 * a)];
    const v = -0.5 * (b + (b >= 0 ? d : -d)); return [v / a, c / v];
  }
  const approxQ = n => q(n.toFixed(7));
  function rationalRoot(v) { const n = BigInt(Math.round(Math.sqrt(Number(abs(v.n))))), d = BigInt(Math.round(Math.sqrt(Number(v.d)))); return v.n >= 0n && n * n === v.n && d * d === v.d ? new Q(n, d) : null; }
  function representatives(p) {
    const out = [], [a, b, c, d, e, f] = coeff(p), cd = circleData(p), lc = locus(p);
    const put = (x, y, label = 'P', approx = false) => out.push({ p: [q(x), q(y)], label, approx });
    if (cd && cd.r2.num >= 0) { put(cd.h, cd.k, 'C'); if (!cd.r2.zero) { const r = rationalRoot(cd.r2) || approxQ(Math.sqrt(cd.r2.num)), approx = !rationalRoot(cd.r2); put(cd.h.add(r), cd.k, 'P', approx); put(cd.h, cd.k.add(r), 'Q', approx); } return out; }
    if (lc.type === 'point') { put(approxQ(lc.center[0]), approxQ(lc.center[1]), 'P', true); return out; }
    if (a.zero && b.zero && c.zero) {
      if (!e.zero) { for (const x of [q(0), q(2), q(-2)]) put(x, d.mul(x).add(f).neg().div(e), ['P', 'Q', 'R'][out.length]); }
      else for (const y of [q(0), q(2), q(-2)]) put(f.neg().div(d), y, ['P', 'Q', 'R'][out.length]); return out;
    }
    if (b.zero && c.zero && !e.zero) { const vx = a.zero ? Z : d.neg().div(a.mul(2)); for (const x of [vx, vx.add(1), vx.sub(1)]) put(x, a.mul(x).mul(x).add(d.mul(x)).add(f).neg().div(e), ['V', 'P', 'Q'][out.length]); return out; }
    if (a.zero && b.zero && !d.zero) { const vy = c.zero ? Z : e.neg().div(c.mul(2)); for (const y of [vy, vy.add(1), vy.sub(1)]) put(c.mul(y).mul(y).add(e.mul(y)).add(f).neg().div(d), y, ['V', 'P', 'Q'][out.length]); return out; }
    const cs = coeff(p).map(v => v.num), [aa, bb, cc, dd, ee, ff] = cs;
    const center = lc.center || [0, 0];
    for (const delta of [0, 1, -1, 2, -2, 4, -4, 8, -8, 16]) {
      const x = center[0] + delta;
      for (const y of roots(cc, bb * x + ee, aa * x * x + dd * x + ff)) if (Number.isFinite(y) && Math.abs(y - center[1]) < 1e5) { put(approxQ(x), approxQ(y), ['P', 'Q', 'R'][out.length], true); if (out.length >= 3) return out; }
      const y = center[1] + delta;
      for (const xx of roots(aa, bb * y + dd, cc * y * y + ee * y + ff)) if (Number.isFinite(xx) && Math.abs(xx - center[0]) < 1e5) { put(approxQ(xx), approxQ(y), ['P', 'Q', 'R'][out.length], true); if (out.length >= 3) return out; }
    }
    return out;
  }
  function validateShape(p) { const lc = locus(p); if (!lc.real) throw new Error(lc.reason); const cs = coeff(p).map(v => Math.abs(v.num)); if (Math.max(...cs) > 1e12) throw new Error('계수가 너무 큽니다. 더 작은 수로 식을 입력해 주세요.'); return lc; }
  root.MoveMath = { Q, q, Z, O, constant, variable, get, add, sub, mul, scale, normalize, parseExpression, parseEquation, parseNumber, coeff, evalQ, evalN, substitute, translation, reflection, central, point, shape, axisFrom, foot, fmt, signNum, equation, equivalent, circleData, locus, roots, representatives, validateShape };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MoveMath;
})(typeof window !== 'undefined' ? window : globalThis);
