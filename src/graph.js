/* SVG coordinate plane. All axes share one scale. Conics are rendered analytically. */
(function (root) {
  'use strict';
  const M = root.MoveMath, esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const C = { ink:'#173753', blue:'#235cce', x:'#078579', y:'#cd643b', axis:'#8260b2', old:'#95a4b6', faint:'#d1dae6' };
  const n = v => v instanceof M.Q ? v.num : +v;
  const coord = p => p.map(n);
  const F = v => Math.abs(v) < 1e-8 ? '0' : Number(v.toFixed(3)).toString().replace('-', '−');
  class Plane {
    constructor(svg, onChange) {
      this.el = svg; this.onChange = onChange; this.W = 700; this.H = 590; this.cx = 0; this.cy = 0; this.scale = 25; this.scene = null; this.labels = []; this.drag = null; this.pointers = new Map(); this.placing = false;
      svg.innerHTML = `<defs><clipPath id="planeClip"><rect id="clipRect" x="0" y="0" width="700" height="590"/></clipPath>${['x','y','axis','blue'].map(k=>`<marker id="arrow-${k}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6" fill="${C[k]}"/></marker>`).join('')}</defs><g id="grid-layer"></g><g id="scene-layer" clip-path="url(#planeClip)"></g>`;
      this.grid = svg.querySelector('#grid-layer'); this.layer = svg.querySelector('#scene-layer');
      this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(svg.parentElement);
      svg.addEventListener('pointerdown', e => this.pointerDown(e)); svg.addEventListener('pointermove', e => this.pointerMove(e)); svg.addEventListener('pointerup', e => this.pointerUp(e)); svg.addEventListener('pointercancel', e => this.pointerUp(e, true));
      svg.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.zoom(e.deltaY > 0 ? .9 : 1.1); } }, { passive:false });
      this.resize();
    }
    resize() {
      const r = this.el.parentElement.getBoundingClientRect(); this.W = Math.max(260, r.width); this.H = Math.max(310, r.height);
      if (!this.sized) { this.scale = Math.min((this.W - 75) / 20, (this.H - 65) / 20); this.sized = true; }
      else if (this.prevW) { const oldBase=Math.min((this.prevW-75)/20,(this.prevH-65)/20), newBase=Math.min((this.W-75)/20,(this.H-65)/20); this.scale*=newBase/oldBase; }
      this.prevW = this.W; this.prevH = this.H;
      this.el.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`); this.el.querySelector('#clipRect').setAttribute('width', this.W); this.el.querySelector('#clipRect').setAttribute('height', this.H);
      this.drawGrid(); if (this.scene) this.render(this.scene);
    }
    xy(p) { return [this.W / 2 + (n(p[0]) - this.cx) * this.scale, this.H / 2 - (n(p[1]) - this.cy) * this.scale]; }
    world(x, y) { return [this.cx + (x - this.W / 2) / this.scale, this.cy - (y - this.H / 2) / this.scale]; }
    bounds(pad = 0) { return [this.cx - this.W / (2 * this.scale) - pad, this.cx + this.W / (2 * this.scale) + pad, this.cy - this.H / (2 * this.scale) - pad, this.cy + this.H / (2 * this.scale) + pad]; }
    fit(objects, T = null) {
      let pts = [];
      for (const o of objects.filter(Boolean)) {
        if (o.p) pts.push(coord(o.p));
        if (o.reps) pts.push(...o.reps.map(r => coord(r.p)));
        if (o.poly) {
          const cd = M.circleData(o.poly), lc = M.locus(o.poly);
          if (cd && cd.r2.num >= 0) { const r = Math.sqrt(cd.r2.num); pts.push([cd.h.num-r, cd.k.num-r], [cd.h.num+r, cd.k.num+r]); }
          else if (lc.type === 'ellipse') {
            const [a,b,c,,,] = M.coeff(o.poly).map(n), center = lc.center, v = -M.evalN(o.poly,...center), lam = [(a+c+Math.hypot(a-c,b))/2,(a+c-Math.hypot(a-c,b))/2];
            const rad = Math.sqrt(Math.max(Math.abs(v/lam[0]),Math.abs(v/lam[1]))); if (Number.isFinite(rad)) pts.push([center[0]-rad,center[1]-rad],[center[0]+rad,center[1]+rad]);
          }
        }
      }
      if (T?.kind === 'axis') { const den = T.A.num**2+T.B.num**2; pts.push([-T.A.num*T.C.num/den,-T.B.num*T.C.num/den]); }
      if (T?.kind === 'center') pts.push([T.h.num,T.k.num]);
      pts = pts.filter(p=>p.every(Number.isFinite)); if (!pts.length) pts = [[-5,-5],[5,5]];
      let xmin=Math.min(...pts.map(p=>p[0])), xmax=Math.max(...pts.map(p=>p[0])), ymin=Math.min(...pts.map(p=>p[1])), ymax=Math.max(...pts.map(p=>p[1]));
      // Preserve the origin when it is nearby, but not at the expense of legibility.
      if (Math.max(Math.abs(xmin),Math.abs(xmax),Math.abs(ymin),Math.abs(ymax)) <= 30) { xmin=Math.min(xmin,0); xmax=Math.max(xmax,0); ymin=Math.min(ymin,0); ymax=Math.max(ymax,0); }
      const minRadius=objects.filter(Boolean).length>1?4:7;const rx=Math.max(minRadius,(xmax-xmin)/2+2), ry=Math.max(minRadius,(ymax-ymin)/2+2);
      this.cx=(xmin+xmax)/2; this.cy=(ymin+ymax)/2;
      if (objects.filter(Boolean).length<=1 && xmin>=-7 && xmax<=7 && ymin>=-7 && ymax<=7) { this.cx=0; this.cy=0; this.scale=Math.min((this.W-75)/20,(this.H-65)/20); }
      else this.scale=Math.max(.000001,Math.min((this.W-100)/(rx*2),(this.H-95)/(ry*2)));
      this.drawGrid(); if(this.scene)this.render(this.scene);
    }
    zoom(k) { this.scale=Math.min(180,Math.max(.000001,this.scale*k)); this.drawGrid(); if(this.scene)this.render(this.scene); }
    home() { this.cx=0; this.cy=0; this.scale=Math.min((this.W-75)/20,(this.H-65)/20); this.drawGrid(); if(this.scene)this.render(this.scene); }
    local(e) { const r=this.el.getBoundingClientRect(); return [(e.clientX-r.left)*this.W/r.width,(e.clientY-r.top)*this.H/r.height]; }
    pointerDown(e) {
      this.el.setPointerCapture(e.pointerId); const p=this.local(e); this.pointers.set(e.pointerId,p);
      if (this.pointers.size===1) this.drag={p,cx:this.cx,cy:this.cy,moved:false};
      if (this.pointers.size===2) { const a=[...this.pointers.values()]; this.pinch={dist:Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]),scale:this.scale}; this.drag=null; }
    }
    pointerMove(e) {
      if(!this.pointers.has(e.pointerId))return;
      const p=this.local(e); this.pointers.set(e.pointerId,p);
      if(this.pointers.size===2 && this.pinch) { const a=[...this.pointers.values()]; this.scale=Math.min(180,Math.max(.000001,this.pinch.scale*Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1])/Math.max(this.pinch.dist,1))); }
      else if(this.drag && !this.placing) { const dx=p[0]-this.drag.p[0],dy=p[1]-this.drag.p[1]; if(Math.hypot(dx,dy)>4)this.drag.moved=true; this.cx=this.drag.cx-dx/this.scale; this.cy=this.drag.cy+dy/this.scale; }
      this.drawGrid(); if(this.scene)this.render(this.scene);
    }
    pointerUp(e,cancel=false) {
      if(!cancel && this.placing && this.pointers.size===1 && this.drag) { const p=this.world(...this.local(e)).map(v=>Math.round(v)); this.onChange?.(p); }
      this.pointers.delete(e.pointerId); this.drag=null; this.pinch=null;
    }
    niceStep() { if(this.scale>=12&&this.scale<80)return 1; const desired=22/this.scale, power=10**Math.floor(Math.log10(desired)), f=desired/power; return (f<=1?1:f<=2?2:f<=5?5:10)*power; }
    drawGrid() {
      const [xmin,xmax,ymin,ymax]=this.bounds(), step=this.niceStep(), u=this.scale*step, [ox,oy]=this.xy([0,0]); this.step=step;
      let s=`<rect width="${this.W}" height="${this.H}" fill="#fcfcf9"/>`;
      if(this.scene?.settings?.chess!==false) {
        const px=((ox%(2*u))+2*u)%(2*u),py=((oy%(2*u))+2*u)%(2*u);
        s+=`<defs><pattern id="chess-grid" patternUnits="userSpaceOnUse" x="${px}" y="${py}" width="${2*u}" height="${2*u}"><rect width="${u}" height="${u}" fill="#f0f3f3"/><rect x="${u}" y="${u}" width="${u}" height="${u}" fill="#f0f3f3"/></pattern></defs><rect width="${this.W}" height="${this.H}" fill="url(#chess-grid)"/>`;
      }
      const ay=Math.min(this.H-24,Math.max(18,oy)),ax=Math.min(this.W-30,Math.max(25,ox));
      for(let v=Math.ceil(xmin/step)*step;v<=xmax+step*.01;v+=step) { const x=this.xy([v,0])[0];s+=`<path d="M${x},0 V${this.H}" stroke="#dce3e8" stroke-width=".7"/>`; if(Math.abs(v)>step/100)s+=`<text x="${x}" y="${ay+17}" text-anchor="middle" class="tick">${F(v)}</text>`; }
      for(let v=Math.ceil(ymin/step)*step;v<=ymax+step*.01;v+=step) { const y=this.xy([0,v])[1];s+=`<path d="M0,${y} H${this.W}" stroke="#dce3e8" stroke-width=".7"/>`;if(Math.abs(v)>step/100)s+=`<text x="${ax-9}" y="${y+4}" text-anchor="end" class="tick">${F(v)}</text>`; }
      if(oy>=0 && oy<=this.H)s+=`<path d="M10,${oy} H${this.W-17}" stroke="#7991a4" stroke-width="1.5"/><path d="M${this.W-22},${oy-4} l7,4 l-7,4" fill="none" stroke="#7991a4" stroke-width="1.5"/><text x="${this.W-21}" y="${oy-11}" class="axis-title">+x</text>`;
      if(ox>=0 && ox<=this.W)s+=`<path d="M${ox},${this.H-10} V17" stroke="#7991a4" stroke-width="1.5"/><path d="M${ox-4},22 l4,-7 l4,7" fill="none" stroke="#7991a4" stroke-width="1.5"/><text x="${ox+11}" y="23" class="axis-title">+y</text>`;
      if(ox>=0 && ox<=this.W && oy>=0 && oy<=this.H)s+=`<text x="${ox-9}" y="${oy+17}" text-anchor="end" class="tick">0</text>`;
      this.grid.innerHTML=s;
      const badge=document.querySelector('#grid-unit');if(badge)badge.textContent=`한 칸 ${F(step)}단위 · 가로·세로 같은 비율`;
    }
    line(a,b,color,width=2,dash='',arrow=false) { const p=this.xy(a),r=this.xy(b);return `<path d="M${p[0]},${p[1]} L${r[0]},${r[1]}" fill="none" stroke="${C[color]||color}" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:''} ${arrow?`marker-end="url(#arrow-${color})"`:''}/>`; }
    infiniteLine(point,dir,stroke,width=2.6,dash='') { const l=Math.hypot(...dir);if(!l)return '';const R=(this.W+this.H)/this.scale*4; return this.line([point[0]-dir[0]/l*R,point[1]-dir[1]/l*R],[point[0]+dir[0]/l*R,point[1]+dir[1]/l*R],stroke,width,dash); }
    curve(poly,color,width=3,opacity=1,delta=[0,0],dash='') {
      let [a,b,c,d,e,f]=M.coeff(poly).map(n); const [dx,dy]=delta;
      [d,e,f]=[d-2*a*dx-b*dy,e-b*dx-2*c*dy,f+a*dx*dx+b*dx*dy+c*dy*dy-d*dx-e*dy];
      let result='';const norm=Math.max(Math.abs(a),Math.abs(b),Math.abs(c),Math.abs(d),Math.abs(e),Math.abs(f),1);[a,b,c,d,e,f]=[a,b,c,d,e,f].map(v=>v/norm);const eps=1e-11;
      const style=`fill="none" stroke="${C[color]||color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${dash?`stroke-dasharray="${dash}"`:''}`;
      if(Math.abs(a)+Math.abs(b)+Math.abs(c)<eps) { const den=d*d+e*e; if(den>0)result=this.infiniteLine([-d*f/den,-e*f/den],[-e,d],color,width,dash); }
      else {
        const theta=.5*Math.atan2(b,a-c),u=[Math.cos(theta),Math.sin(theta)],v=[-Math.sin(theta),Math.cos(theta)],rad=Math.hypot(a-c,b),l1=(a+c+rad)/2,l2=(a+c-rad)/2,det=a*c-b*b/4;
        if(Math.abs(det)>eps) {
          const center=[(-c*d+b*e/2)/(2*det),(b*d/2-a*e)/(2*det)],k=-(a*center[0]**2+b*center[0]*center[1]+c*center[1]**2+d*center[0]+e*center[1]+f),pc=this.xy(center);
          if(det>0 && k/l1>=-eps && k/l2>=-eps) {
            const rx=Math.sqrt(Math.max(0,k/l1))*this.scale,ry=Math.sqrt(Math.max(0,k/l2))*this.scale;
            result=rx<.2&&ry<.2?`<circle cx="${pc[0]}" cy="${pc[1]}" r="4" fill="${C[color]||color}"/>`:`<ellipse cx="${pc[0]}" cy="${pc[1]}" rx="${rx}" ry="${ry}" transform="rotate(${-theta*180/Math.PI} ${pc[0]} ${pc[1]})" ${style}/>`;
          } else if(det<0) {
            if(Math.abs(k)<eps) {
              const t=Math.sqrt(Math.abs(l1/l2)); for(const sign of [-1,1])result+=this.infiniteLine(center,[u[0]+sign*t*v[0],u[1]+sign*t*v[1]],color,width,dash);
            } else {
              const main=k/l1>0?u:v,other=k/l1>0?v:u,aa=Math.sqrt(Math.abs(k/(k/l1>0?l1:l2))),bb=Math.sqrt(Math.abs(k/(k/l1>0?l2:l1)));
              const R=Math.hypot(this.cx-center[0],this.cy-center[1])+(this.W+this.H)/this.scale*2,T=Math.min(25,Math.asinh(R/Math.max(bb,1e-8))+1);
              for(const sign of [-1,1]) { let path=''; for(let i=0;i<=350;i++){const t=-T+2*T*i/350,X=sign*aa*Math.cosh(t),Y=bb*Math.sinh(t),p=this.xy([center[0]+main[0]*X+other[0]*Y,center[1]+main[1]*X+other[1]*Y]);path+=`${i?'L':'M'}${p[0].toFixed(2)},${p[1].toFixed(2)} `;}result+=`<path d="${path}" ${style}/>`; }
            }
          }
        } else {
          const U=Math.abs(l1)>=Math.abs(l2)?u:v,V=[-U[1],U[0]],lam=Math.abs(l1)>=Math.abs(l2)?l1:l2,du=d*U[0]+e*U[1],dv=d*V[0]+e*V[1];
          if(Math.abs(dv)>eps) {
            const box=this.bounds(10+Math.abs(dx)+Math.abs(dy)),us=[[box[0],box[2]],[box[0],box[3]],[box[1],box[2]],[box[1],box[3]]].map(p=>p[0]*U[0]+p[1]*U[1]);const lo=Math.min(...us),hi=Math.max(...us);let path='';
            for(let i=0;i<=420;i++){const uu=lo+(hi-lo)*i/420,vv=-(lam*uu*uu+du*uu+f)/dv,p=this.xy([U[0]*uu+V[0]*vv,U[1]*uu+V[1]*vv]);path+=`${i?'L':'M'}${p[0].toFixed(2)},${p[1].toFixed(2)} `;} result=`<path d="${path}" ${style}/>`;
          } else for(const r of M.roots(lam,du,f))result+=this.infiniteLine([U[0]*r,U[1]*r],V,color,width,dash);
        }
      }
      return `<g opacity="${opacity}">${result}</g>`;
    }
    bubble(point,text,color='ink',dx=14,dy=-38,small=false) {
      let [x,y]=this.xy(point);const anchor=[x,y];const font=small?11:13,measure=t=>[...t].reduce((s,c)=>s+(/[\u1100-\uFFFF]/.test(c)?font:font*.58),0);
      const words=String(text).split(' '),lines=[];let line='';for(const w of words){if(measure(line+' '+w)>Math.min(285,this.W-40)&&line){lines.push(line);line=w;}else line+=(line?' ':'')+w;}if(line)lines.push(line);
      const ww=Math.max(...lines.map(measure),12)+18,hh=lines.length*(font+5)+12; x=Math.max(7,Math.min(this.W-ww-7,x+dx)); y=Math.max(7,Math.min(this.H-hh-7,y+dy));
      const collides=(X,Y)=>this.labels.some(r=>X<r.x+r.w+3&&X+ww>r.x-3&&Y<r.y+r.h+3&&Y+hh>r.y-3);
      for(const shift of [0,hh+8,-hh-8,2*(hh+8),-2*(hh+8)]){const yy=Math.max(7,Math.min(this.H-hh-7,y+shift));if(!collides(x,yy)){y=yy;break;}}
      this.labels.push({x,y,w:ww,h:hh});
      const near=[Math.max(x,Math.min(x+ww,anchor[0])),Math.max(y,Math.min(y+hh,anchor[1]))],leader=Math.hypot(near[0]-anchor[0],near[1]-anchor[1])>8?`<path d="M${anchor[0]},${anchor[1]} L${near[0]},${near[1]}" fill="none" stroke="${C[color]||color}" stroke-width="1" opacity=".3"/>`:''; return `<g class="graph-label"><title>${esc(text)}</title>${leader}<rect x="${x}" y="${y}" width="${ww}" height="${hh}" rx="8" fill="#fff" fill-opacity=".96" stroke="${C[color]||color}" stroke-opacity=".24"/><text fill="${C[color]||color}" font-size="${font}" font-weight="650">${lines.map((t,i)=>`<tspan x="${x+9}" y="${y+font+6+i*(font+5)}">${esc(t)}</tspan>`).join('')}</text></g>`;
    }
    dot(p,color='blue',r=5,pawn=false,pulse=false) { const [x,y]=this.xy(p); return `<g ${pulse?'class="finish-pulse"':''}>${pulse?`<circle cx="${x}" cy="${y}" r="14" fill="none" stroke="${C[color]||color}" stroke-width="2" opacity=".4"/>`:''}${pawn?`<g transform="translate(${x},${y})"><path d="M-10,-8 Q-10,-12 -5,-14 L-4,-22 Q-7,-24 -7,-28 A7,7 0 1,1 7,-28 Q7,-24 4,-22 L5,-14 Q10,-12 10,-8 Z" fill="${C[color]||color}" stroke="white" stroke-width="1.7"/><path d="M-11,-7 H11" stroke="${C[color]||color}" stroke-width="3" stroke-linecap="round"/></g>`:''}<circle cx="${x}" cy="${y}" r="${r}" fill="${C[color]||color}" stroke="white" stroke-width="2"/></g>`; }
    pointText(p,approx=false){return `(${p.map(v=>approx?F(n(v)):M.fmt(v)).join(', ')})${approx?' ≈':''}`;}
    render(scene) {
      this.scene=scene; this.labels=[]; const {before,after,T,phase,dx=0,dy=0,t=0,settings={}}=scene, shape=!!before.poly,done=phase==='result',hasMotion=!!after,translation=T?.kind==='translation';
      const reps=shape?before.reps:[{p:before.p,label:'P',approx:false}],shown=settings.reps?reps:reps.slice(0,1),main=shown[0]||{p:[M.Z,M.Z],label:'P'},p0=coord(main.p),pf=hasMotion?coord(M.point(T,main.p)):p0;
      let s='',labels='';
      if(shape) {
        if(hasMotion&&settings.original!==false)s+=this.curve(before.poly,'old',2,.7,[0,0],'6 5');
        if(!hasMotion)s+=this.curve(before.poly,'blue',3.2);
        else if(translation)s+=this.curve(before.poly,'blue',3.2,1,[dx,dy]);
        else { if(!done)s+=this.curve(before.poly,'blue',2.5,Math.max(.25,1-t*.65)); if(phase==='mirror'||done)s+=this.curve(after.poly,'blue',3.2,done?1:Math.max(.15,t)); }
      }
      if(T && !translation) {
        if(T.kind==='axis') {
          const den=T.A.num**2+T.B.num**2,axisPoint=[-T.A.num*T.C.num/den,-T.B.num*T.C.num/den];
          s+=`<g ${phase==='axis'&&!settings.reduced?`opacity="${.72+.28*Math.cos(4*Math.PI*(scene.phaseProgress||0))}"`:''}>${this.infiniteLine(axisPoint,[-T.B.num,T.A.num],'axis',3.3,'10 7')}</g>`;
          // Label near the visible part of the axis rather than a possibly remote intercept.
          const ratio=(T.A.num*this.cx+T.B.num*this.cy+T.C.num)/den,ap=[this.cx-T.A.num*ratio,this.cy-T.B.num*ratio];
          labels+=this.bubble(ap,`대칭축 ${T.label}`,'axis',14,-80,true);
        } else { s+=`<g opacity="${(phase==='axis'&&!settings.reduced)?(.72+.28*Math.cos(4*Math.PI*(scene.phaseProgress||0))):1}">${this.dot([T.h,T.k],'axis',7)}</g>`;labels+=this.bubble([T.h,T.k],`대칭 중심 ${this.pointText([T.h,T.k])}`,'axis',12,18,true); }
      }
      if(hasMotion && settings.trail!==false) {
        if(translation) {
          const mid=[p0[0]+dx,p0[1]],curr=[p0[0]+dx,p0[1]+dy];
          if(Math.abs(dx)>1e-8){s+=this.line(p0,mid,'x',3,'',true);labels+=this.bubble([(p0[0]+mid[0])/2,p0[1]],`가로 ${M.signNum(done?T.a:M.q(Number(dx.toFixed(6))))}`,'x',-38,24,true);}
          if(Math.abs(dy)>1e-8){s+=this.line(mid,curr,'y',3,'',true);labels+=this.bubble([mid[0],(mid[1]+curr[1])/2],`세로 ${M.signNum(done?T.b:M.q(Number(dy.toFixed(6))))}`,'y',16,6,true);}
          // Cumulative signed displacement is separate from coordinate labels.
          for(const axis of [0,1]) { const dist=axis===0?dx:dy,base=axis===0?p0:[p0[0]+T.a.num,p0[1]],max=Math.floor(Math.abs(dist)+1e-8),stride=Math.max(1,Math.ceil(max/12));if(this.scale*stride<17)continue;
            for(let j=stride;j<=max;j+=stride){const val=Math.sign(dist)*j,pt=axis===0?[base[0]+val,base[1]]:[base[0],base[1]+val],pp=this.xy(pt);s+=`<circle cx="${pp[0]}" cy="${pp[1]}" r="2.5" fill="${C[axis===0?'x':'y']}"/><text x="${pp[0]+(axis===1?-12:0)}" y="${pp[1]+(axis===0?17:4)}" text-anchor="middle" font-size="10" font-weight="750" fill="${C[axis===0?'x':'y']}" stroke="white" stroke-width="3" paint-order="stroke">${val>0?'+':''}${val}</text>`;}
          }
          if(phase==='xdir'&&!T.a.zero)s+=this.line(p0,[p0[0]+Math.sign(T.a.num)*Math.min(Math.abs(T.a.num),2),p0[1]],'x',3,'5 4',true);
          if(phase==='ydir'&&!T.b.zero)s+=this.line([p0[0]+T.a.num,p0[1]],[p0[0]+T.a.num,p0[1]+Math.sign(T.b.num)*Math.min(Math.abs(T.b.num),2)],'y',3,'5 4',true);
          if(scene.direct && (Math.abs(dx)+Math.abs(dy)>0))s+=this.line(p0,curr,'blue',1.6,'5 5',true);
        } else if(['guide','mirror','result'].includes(phase)) {
          for(const r of shown){const P=coord(r.p),P2=coord(M.point(T,r.p)),H=coord(M.foot(T,r.p));s+=this.line(P,P2,'axis',1.8,'5 4');s+=this.dot(H,'axis',3);
            if(r===main){const dist=Math.hypot(P[0]-H[0],P[1]-H[1]);const exactD=T.kind==='axis'?distanceLabel(T,r.p):distanceCenter(T,r.p);labels+=this.bubble([(P[0]+H[0])/2,(P[1]+H[1])/2],`거리 ${exactD}`,'axis',10,18,true);if(phase==='mirror'||done)labels+=this.bubble([(P2[0]+H[0])/2,(P2[1]+H[1])/2],`거리 ${exactD}`,'axis',10,18,true);
              if(T.kind==='axis'&&dist>1e-8){const nn=[(P[0]-H[0])/dist,(P[1]-H[1])/dist],dd=[-nn[1],nn[0]],u=10/this.scale,aa=[H[0]+nn[0]*u,H[1]+nn[1]*u],bb=[aa[0]+dd[0]*u,aa[1]+dd[1]*u],cc=[H[0]+dd[0]*u,H[1]+dd[1]*u];s+=this.line(aa,bb,'axis',1.2)+this.line(bb,cc,'axis',1.2);labels+=this.bubble(H,`H ${this.pointText(M.foot(T,r.p),r.approx)}`,'axis',12,22,true);}
            }
          }
        }
      }
      for(const r of shown) {
        const P=coord(r.p),target=hasMotion?M.point(T,r.p):r.p,PN=coord(target);let cur=P;
        if(hasMotion)cur=translation?[P[0]+dx,P[1]+dy]:[P[0]+(PN[0]-P[0])*t,P[1]+(PN[1]-P[1])*t];
        if(done)cur=PN;
        if(hasMotion&&settings.original!==false){s+=this.dot(P,'old',4);if(r===main)labels+=this.bubble(P,`${r.label} ${this.pointText(r.p,r.approx)} · 출발`,'old',-90,-54,true);}
        s+=this.dot(cur,'blue',shape?5:6,!shape,done&&!settings.reduced);
        if(r===main||settings.reps){let exact=done?target:(!hasMotion?r.p:null); if(hasMotion&&!done&&translation&&scene.phaseProgress===1){const dq=Math.abs(dx-T.a.num)<1e-9?T.a:M.q(Number(dx.toFixed(7))),eq=Math.abs(dy-T.b.num)<1e-9?T.b:M.q(Number(dy.toFixed(7)));exact=[r.p[0].add(dq),r.p[1].add(eq)];}if(hasMotion&&!translation&&t===0)exact=r.p;if(hasMotion&&!translation&&t===1)exact=target;const name=done?`${r.label}′`:(hasMotion?'현재':r.label);const text=exact?this.pointText(exact,r.approx):`≈ (${F(cur[0])}, ${F(cur[1])})`;labels+=this.bubble(cur,`${name} ${text}`,'blue',14,-45,!(!shape));}
      }
      if(shape) {
        const anchor=done&&after?.reps?.length?after.reps[0].p:main.p;
        const p=done?after.poly:before.poly;
        if(done||!hasMotion)labels+=this.bubble(anchor,`${done?'이동 후':'현재 도형'}  ${M.equation(p)}`,'ink',-90,55);
      }
      this.layer.innerHTML=s+labels;
    }
  }
  function distanceLabel(T,p) { const numerator=T.A.mul(p[0]).add(T.B.mul(p[1])).add(T.C), den=T.A.mul(T.A).add(T.B.mul(T.B)), d2=numerator.mul(numerator).div(den), r=Math.sqrt(d2.num); return Math.abs(r-Math.round(r))<1e-10?String(Math.round(r)):`≈ ${F(r)}`; }
  function distanceCenter(T,p){const dx=M.q(p[0]).sub(T.h),dy=M.q(p[1]).sub(T.k),d=Math.hypot(dx.num,dy.num);return Math.abs(d-Math.round(d))<1e-10?String(Math.round(d)):`≈ ${F(d)}`;}
  root.MoveGraph={Plane,esc,distanceLabel,distanceCenter};
})(window);
