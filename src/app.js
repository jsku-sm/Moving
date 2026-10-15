/* Move Lab — application state and deterministic, pauseable animations. */
(function () {
  'use strict';
  const M=window.MoveMath,G=window.MoveGraph,$=id=>document.getElementById(id),esc=G.esc;
  const MODES={
    'point-translation':{name:'점의 평행이동',shape:false,translation:true,board:'한 칸씩 움직이는 좌표'},
    'point-reflection':{name:'점의 대칭',shape:false,translation:false,board:'거울의 반대편, 같은 거리'},
    'shape-translation':{name:'도형의 평행이동',shape:true,translation:true,board:'점의 이동이 도형의 식으로'},
    'shape-reflection':{name:'도형의 대칭이동',shape:true,translation:false,board:'대응점을 따라 만나는 거울 속 도형'}
  };
  const STORE='move-lab-v1';
  const load=()=>{try{return JSON.parse(localStorage.getItem(STORE)||'{}');}catch{return {};}};
  const stored=load();
  function makePoint(x,y){return {p:[M.q(x),M.q(y)]};}
  function makeShape(text){const poly=M.parseEquation(text);M.validateShape(poly);return {poly,reps:M.representatives(poly),input:text};}
  const initialPoint=makePoint(-2,3),initialShape=makeShape('(x-1)^2+(y-2)^2=4');
  const state={mode:'point-translation',learning:'guided',families:{point:{initial:initialPoint,current:initialPoint,history:[],last:null},shape:{initial:initialShape,current:initialShape,history:[],last:null}},settings:{original:true,trail:true,reps:false,chess:true,reduced:window.matchMedia('(prefers-reduced-motion: reduce)').matches,...(stored.settings||{})},badges:stored.badges&&typeof stored.badges==='object'?stored.badges:{},anim:null,completed:null,sourceDirty:false,placing:false,challenge:null,exampleIndex:0,updating:false,toastTimer:null};
  state.settings.sound=stored.settings?.sound!==false;
  let raf=0;
  const mode=()=>MODES[state.mode],family=()=>state.families[mode().shape?'shape':'point'];
  const coord=p=>`(${p.map(M.fmt).join(', ')})`;
  const numberDesc=v=>M.fmt(v),sign=v=>M.signNum(v);
  const validSettingKeys=['original','trail','reps','chess','reduced'];for(const key of validSettingKeys)state.settings[key]=!!state.settings[key];
  const plane=new G.Plane($('coordinate-plane'),p=>{if(state.learning==='challenge'||state.anim?.playing)return;if(p.some(v=>Math.abs(v)>100)){toast('좌표판에 놓을 수 있는 출발점은 −100~100 범위예요.');return;}$('point-x').value=p[0];$('point-y').value=p[1];applySource();});
  function save(){try{localStorage.setItem(STORE,JSON.stringify({settings:state.settings,badges:state.badges}));}catch{/* Private browsing may disable storage. Core learning remains available. */}}
  function toast(text){clearTimeout(state.toastTimer);$('toast').textContent=text;$('toast').hidden=false;state.toastTimer=setTimeout(()=>$('toast').hidden=true,3400);}
  function showError(id,error){$(id).textContent=error instanceof Error?error.message:String(error);$(id).hidden=false;}
  function clearErrors(){for(const id of ['source-error','transform-error']){$(id).textContent='';$(id).hidden=true;}}
  function stopAnimation(){cancelAnimationFrame(raf);raf=0;if(state.anim)state.anim.playing=false;}
  const movingPhases=new Set(['direct','xmove','ymove','mirror']);
  let audioContext=null;
  function audioReady(){if(!state.settings.sound)return false;const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;try{audioContext||=new Audio();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});return true;}catch{return false;}}
  function toneAt(frequency,start,duration,volume){const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,start);oscillator.frequency.exponentialRampToValueAtTime(frequency*1.18,start+Math.min(.07,duration/2));gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(start);oscillator.stop(start+duration);}
  function playMoveSound(){if(!audioReady())return;const now=audioContext.currentTime;toneAt(560,now,.11,.035);toneAt(760,now+.045,.13,.027);}
  function playArrivalSound(){if(!audioReady())return;const now=audioContext.currentTime;toneAt(660,now,.18,.035);toneAt(880,now+.09,.24,.04);toneAt(1046,now+.19,.32,.03);}
  function updateMotionSound(a,step){if(!state.settings.sound||!movingPhases.has(step.phase)){a.soundIndex=-1;return;}if(a.soundIndex!==a.index){a.soundIndex=a.index;a.nextSoundAt=420;playMoveSound();return;}if(step.duration>700&&a.elapsed>=a.nextSoundAt&&a.elapsed<step.duration){a.nextSoundAt+=420;playMoveSound();}}
  function cancelPreview(){if(state.anim){stopAnimation();state.anim=null;}state.completed=null;}
  function getTransform(){
    if(mode().translation){const a=M.parseNumber($('move-x').value),b=M.parseNumber($('move-y').value),T=M.translation(a,b);T.label=`가로 ${sign(a)}, 세로 ${sign(b)}`;return T;}
    const type=$('axis-select').value;let T;
    if(type==='xaxis'){T=M.reflection(0,1,0);T.label='y = 0 (x축)';}
    else if(type==='yaxis'){T=M.reflection(1,0,0);T.label='x = 0 (y축)';}
    else if(type==='origin'){T=M.central(0,0);T.label='원점 (0, 0)';}
    else if(type==='diagonal'){T=M.reflection(1,-1,0);T.label='y = x';}
    else if(type==='antidiagonal'){T=M.reflection(1,1,0);T.label='y = −x';}
    else if(type==='vertical'){const h=M.parseNumber($('axis-h').value);T=M.reflection(1,0,h.neg());T.label=`x = ${M.fmt(h)}`;}
    else if(type==='horizontal'){const k=M.parseNumber($('axis-k').value);T=M.reflection(0,1,k.neg());T.label=`y = ${M.fmt(k)}`;}
    else if(type==='center'){const h=M.parseNumber($('axis-h').value),k=M.parseNumber($('axis-k').value);T=M.central(h,k);T.label=`점 ${coord([h,k])}`;}
    else if(type==='general'){T=M.axisFrom($('axis-equation').value);T.label=M.equation(M.parseEquation($('axis-equation').value));}
    T.choice=type;return T;
  }
  function transformed(source,T){if(source.p)return {p:M.point(T,source.p)};const poly=M.shape(T,source.poly);M.validateShape(poly);return {poly,reps:source.reps.map(r=>({...r,p:M.point(T,r.p)})),input:M.equation(poly,false)};}
  function syncSource(){state.updating=true;const current=family().current;if(mode().shape){$('shape-equation').value=M.equation(current.poly,false);$('equation-preview').textContent=M.equation(current.poly);}else{$('point-x').value=current.p[0].toString();$('point-y').value=current.p[1].toString();}state.sourceDirty=false;$('source-dirty').hidden=true;state.updating=false;updateCurrent();}
  function updateCurrent(){const f=family(),cur=f.current;$('current-source-value').textContent=cur.p?'P'+coord(cur.p):M.equation(cur.poly);$('current-sequence').textContent=f.history.length?`${f.history.length}회 이동 후`:'처음 위치';}
  function setSource(source,quiet=false){cancelPreview();const f=family();f.initial=source;f.current=source;f.history=[];f.last=null;clearErrors();syncSource();updateHistory();plane.fit([source]);ready();if(!quiet)toast(mode().shape?'새 도형을 출발 도형으로 적용했어요.':'새 점을 출발점으로 적용했어요.');}
  function applySource(){try{const source=mode().shape?makeShape($('shape-equation').value):makePoint(M.parseNumber($('point-x').value),M.parseNumber($('point-y').value));setSource(source);}catch(e){showError('source-error',e);updateControls();}}
  function onSourceInput(){if(state.updating)return;cancelPreview();state.sourceDirty=true;$('source-dirty').hidden=false;clearErrors();if(mode().shape){try{$('equation-preview').textContent=M.equation(M.parseEquation($('shape-equation').value));}catch{$('equation-preview').textContent='식 입력 후 [새 도형 적용]을 눌러 확인하세요.';}}ready();}
  function updateDirections(){for(const axis of ['x','y']){try{const v=M.parseNumber($(`move-${axis}`).value),dir=v.num>0?(axis==='x'?'오른쪽 +':'위쪽 +'):v.num<0?(axis==='x'?'왼쪽 −':'아래쪽 −'):'변화 없음';$(`${axis}-direction`).textContent=dir;document.querySelectorAll(`[data-direction^="${axis}:"]`).forEach(el=>el.classList.toggle('chosen',+el.dataset.direction.split(':')[1]===Math.sign(v.num)));}catch{$(`${axis}-direction`).textContent='값 확인';}}}
  function updateAxisUI(){const type=$('axis-select').value;$('axis-params').hidden=!['vertical','horizontal','center'].includes(type);$('axis-h-label').hidden=type==='horizontal';$('axis-k-label').hidden=type==='vertical';$('general-axis-input').hidden=type!=='general';document.querySelectorAll('[data-axis]').forEach(el=>el.classList.toggle('chosen',el.dataset.axis===type));$('axis-note').innerHTML=['origin','center'].includes(type)?'점 대칭에는 대칭축이 없어요.<br>중심이 두 점의 중점이 되는지 확인해요.':'굵은 점선이 거울의 기준이에요.<br>축에 수직으로 잰 거리를 비교해요.';}
  function onTransformInput(){if(state.updating)return;cancelPreview();clearErrors();updateDirections();updateAxisUI();ready();}
  function settingsToUI(){const map={'show-original':'original','show-trail':'trail','show-reps':'reps','chess-pattern':'chess','reduce-motion':'reduced'};for(const [id,key] of Object.entries(map))$(id).checked=state.settings[key];document.body.classList.toggle('reduced',state.settings.reduced);}
  function updateControls(){
    const a=state.anim,running=!!a?.playing,active=!!a,f=family(),locked=state.learning==='challenge';
    $('source-fields').disabled=running||locked;$('transform-fields').disabled=running||locked;
    $('run').disabled=state.sourceDirty||running;
    $('run-label').textContent=running?'이동 중…':active?(state.settings.reduced?'다음 단계':'계속 재생'):state.settings.reduced?(f.history.length?'여기서 단계별 이동':'단계별로 시작'):f.history.length?'여기서 이어 이동':'이동 시작';
    $('pause').disabled=!active;$('pause').textContent=running||!active?'Ⅱ 일시정지':'▶ 계속';if(state.settings.reduced)$('pause').disabled=true;
    $('step').disabled=running||state.sourceDirty;
    $('replay').disabled=!f.last||active||state.sourceDirty;$('undo').disabled=!f.history.length&&!active;
    $('load-example').disabled=running;$('next-challenge').disabled=running;$('place-point').disabled=running||locked;
    $('export-history').disabled=!f.history.length;
    $('copy-result').hidden=!state.completed;
    $('source-dirty').hidden=!state.sourceDirty;
    document.body.classList.toggle('teaching',state.learning==='guided');
  }
  function ready(){
    let T=null;try{T=getTransform();}catch{}
    const before=family().current,scene={before,T,phase:'ready',settings:state.settings};
    plane.render(scene);plane.drawGrid();
    $('playback-progress').style.width='0%';$('step-badge').textContent='READY';$('stage-title').textContent=state.sourceDirty?'새 출발 위치를 적용해요':mode().shape?'도형과 대표점을 살펴봐요':'출발점을 확인해요';
    const name=before.p?'P'+coord(before.p):M.equation(before.poly);
    $('stage-description').textContent=state.sourceDirty?'입력한 값은 아직 좌표판에 반영되지 않았어요. 출발점 또는 새 도형을 적용한 뒤 이동해 보세요.':T?(mode().translation?`${name}에서 출발해요. 가로 ${sign(T.a)}, 세로 ${sign(T.b)}만큼 이동하면 어떻게 될까요?`:`${name}을 ${T.label}에 대하여 대칭이동해 볼까요?`):'이동 조건을 입력한 뒤 시작하세요.';
    $('coach-tip').innerHTML=mode().translation?'오른쪽·위쪽은 +<br>왼쪽·아래쪽은 −':T?.kind==='center'?'대칭 중심은 두 대응점의 중점이에요.':'대칭축까지의 거리는<br>축에 수직으로 재어야 해요.';
    updateChecklist('ready');renderCalculation(before,T,null,'ready');clearResult();updateControls();
  }
  function clearResult(){$('result-value').textContent='어디에 도착할까요?';$('result-value').classList.remove('ready');$('result-description').textContent='움직임이 끝나면 좌표와 식을 함께 확인해요.';$('result-card').classList.remove('just-finished');$('result-icon').textContent='◎';$('copy-result').hidden=true;}
  function updateChecklist(phase){const phases=mode().translation?[['출발',['ready','start']],['가로',['xdir','xmove','xzero']],['세로',['ydir','ymove','yzero','direct']],['도착',['result']]]:[['기준',['ready','start','axis']],['거리',['guide']],['대응',['mirror']],['결과',['result']]];const idx=phases.findIndex(([,ids])=>ids.includes(phase));$('stage-checklist').innerHTML=phases.map(([name],i)=>`<span class="${i===idx?'active':i<idx?'finished':''}">${i<idx?'✓ ':''}${name}</span>`).join('');}
  function affineText(row,c){let terms=[];for(let i=0;i<2;i++){const v=row[i];if(v.zero)continue;const neg=v.num<0,abs=neg?v.neg():v;terms.push({neg,s:`${abs.eq(1)?'':M.fmt(abs)}${i===0?'x':'y'}`});}if(!c.zero)terms.push({neg:c.num<0,s:M.fmt(c.num<0?c.neg():c)});return terms.map((t,i)=>`${i?(t.neg?' − ':' + '):(t.neg?'−':'')}${t.s}`).join('')||'0';}
  function renderCalculation(before,T,after,phase,scene=null){
    const r=before.p?{p:before.p,label:'P'}:before.reps[0];if(!r||!T){$('coordinate-calculation').innerHTML='<p class="calc-note">이동 조건을 입력하면 좌표의 변화를 확인할 수 있어요.</p>';return;}
    const p=r.p,p2=after?(after.p||after.reps[0]?.p):null,isReady=phase==='ready',done=phase==='result';
    if(T.kind==='translation'){
      const partial=(i,delta,full)=>scene?.phaseProgress===1?M.fmt(p[i].add(Math.abs(delta-full.num)<1e-9?full:M.q(Number(delta.toFixed(7))))):`≈ ${Number((p[i].num+delta).toFixed(3))}`; const xv=done||['ydir','ymove','yzero'].includes(phase)?M.fmt(p[0].add(T.a)):phase==='xmove'?partial(0,scene?.dx||0,T.a):phase==='xzero'?M.fmt(p[0]):'?',yv=done?M.fmt(p[1].add(T.b)):phase==='ymove'?partial(1,scene?.dy||0,T.b):phase==='yzero'?M.fmt(p[1]):'?';
      const row=(i,v,val)=>`<div class="calc-row ${i?'y':''}"><span class="axis-letter">${i?'y':'x'}′</span><span>${isReady?`${i?'y':'x'} + ${i?'b':'a'}`:`${M.fmt(p[i])} + (${sign(v)}) = <strong>${val}</strong>`}</span></div>`;
      $('coordinate-calculation').innerHTML=(before.poly?`<p class="calc-note">${r.label==='C'?'원의 중심 C':`대표점 ${r.label}`} ${esc(coord(p))}</p>`:'')+row(0,T.a,xv)+row(1,T.b,yv);
      const x=affineText(T.inv.m[0],T.inv.t[0]),y=affineText(T.inv.m[1],T.inv.t[1]);
      $('formula-explanation').innerHTML=`<p>점의 좌표에는 이동량을 <b>더해요</b>.</p><div class="math-block">(x, y) → (x+a, y+b)</div><p>도형의 식은 새 좌표에서 이동량을 <b>빼서</b> 원래 좌표를 찾아요.</p><div class="math-block">원래 식: F(x, y) = 0<br>이동 후: F(${esc(x)}, ${esc(y)}) = 0</div>${before.poly?`<p>원래 방정식<br>${esc(M.equation(before.poly))}</p><p><b>x 자리에 ${esc(x)}, y 자리에 ${esc(y)}</b>를 동시에 넣어요.</p>${done?`<div class="math-block">${esc(M.equation(after.poly))}</div>`:''}`:'<p>가로·세로 이동량은 부호가 있지만, 이동한 거리 자체는 음수가 아니에요.</p>'}`;
    }else{
      const x=affineText(T.m[0],T.t[0]),y=affineText(T.m[1],T.t[1]);
      $('coordinate-calculation').innerHTML=(before.poly?`<p class="calc-note">${r.label==='C'?'원의 중심 C':`대표점 ${r.label}`} ${esc(coord(p))}</p>`:'')+`<div class="calc-row"><span class="axis-letter">x′</span><span>${esc(x)}${done&&p2?` = <strong>${M.fmt(p2[0])}</strong>`:''}</span></div><div class="calc-row y"><span class="axis-letter">y′</span><span>${esc(y)}${done&&p2?` = <strong>${M.fmt(p2[1])}</strong>`:''}</span></div>`;
      $('formula-explanation').innerHTML=`<p>${T.kind==='center'?'대칭 중심은 두 대응점을 이은 선분의 중점이에요.':'대칭축은 두 대응점을 이은 선분을 수직으로 이등분해요.'}</p><div class="math-block">(x, y) → (${esc(x)}, ${esc(y)})</div><p>같은 대칭을 두 번 하면 원래 위치로 돌아와요. 그래서 식에도 같은 대응식을 동시에 대입해요.</p><div class="math-block">F(${esc(x)}, ${esc(y)}) = 0</div>${done&&before.poly?`<p>대입한 뒤 정리하면</p><div class="math-block">${esc(M.equation(after.poly))}</div>`:''}`;
    }
  }
  function makeSteps(T,direct){
    const steps=[];const push=(phase,duration,from=[0,0],to=from,extra={})=>steps.push({phase,duration,from,to,...extra});push('start',650);
    if(T.kind==='translation'){
      const a=T.a.num,b=T.b.num;
      if(direct&&(a||b)){push('direct',Math.min(4600,1300+Math.hypot(a,b)*150),[0,0],[a,b]);}
      else{
        if(a){push('xdir',650);const step=Math.max(1,Math.ceil(Math.abs(a)/18));for(let z=0;z<Math.abs(a)-1e-10;z+=step){const end=Math.min(z+step,Math.abs(a));push('xmove',500,[Math.sign(a)*z,0],[Math.sign(a)*end,0],{chunk:step});}}
        else push('xzero',600);
        if(b){push('ydir',650,[a,0]);const step=Math.max(1,Math.ceil(Math.abs(b)/18));for(let z=0;z<Math.abs(b)-1e-10;z+=step){const end=Math.min(z+step,Math.abs(b));push('ymove',500,[a,Math.sign(b)*z],[a,Math.sign(b)*end],{chunk:step});}}
        else push('yzero',600,[a,0]);
      }
      push('result',0,[a,b]);
    }else{push('axis',2000);push('guide',1300);push('mirror',1900);push('result',0);}
    return steps;
  }
  function prepare(replay=false){
    clearErrors();if(state.sourceDirty){showError('source-error','새 출발 위치를 먼저 적용해 주세요.');return null;}
    try{
      const f=family();if(f.history.length>=100&&!replay)throw new Error('한 실험에서는 100회까지 기록해요. 기록을 저장한 뒤 처음으로 돌아가거나 새 실험을 시작해 주세요.');
      const saved=replay?f.last:null,T=saved?saved.T:getTransform(); let before=saved?saved.before:f.current;
      // A fixed center/vertex is not enough to explain a reflected figure. Prefer
      // a genuinely moving representative when the usual first point is fixed.
      if(!saved&&before.poly&&before.reps.length){let selected=before.reps.find(r=>r.label==='C')||before.reps.find(r=>r.label==='V')||before.reps[0];if(T.kind!=='translation'&&selected.p.every((v,i)=>v.eq(M.point(T,selected.p)[i]))){selected=before.reps.find(r=>r.p.some((v,i)=>!v.eq(M.point(T,r.p)[i])))||selected;}before={...before,reps:[selected,...before.reps.filter(r=>r!==selected)]};}
      const after=saved?saved.after:transformed(before,T),direct=saved?saved.direct:$('path-mode').value==='direct';
      const steps=makeSteps(T,direct),a={before,after,T,direct,steps,index:0,elapsed:0,playing:false,previous:0,replay,lessonDone:false};state.anim=a;state.completed=null;clearResult();plane.fit([before,after],T);plane.placing=false;state.placing=false;$('place-point').classList.remove('chosen');$('place-point').setAttribute('aria-pressed','false');$('placement-banner').hidden=true;$('coordinate-plane').classList.remove('placing');renderAnimation();updateControls();return a;
    }catch(e){showError('transform-error',e);return null;}
  }
  function currentScene(){const a=state.anim;if(!a)return null;const s=a.steps[a.index],p=s.duration?Math.min(1,a.elapsed/s.duration):1,eased=p*p*(3-2*p),dx=s.from[0]+(s.to[0]-s.from[0])*eased,dy=s.from[1]+(s.to[1]-s.from[1])*eased;return {before:a.before,after:a.after,T:a.T,phase:s.phase,phaseProgress:p,dx,dy,t:s.phase==='result'?1:s.phase==='mirror'?eased:0,settings:state.settings,direct:a.direct,chunk:s.chunk||1,replay:a.replay};}
  function renderAnimation(){
    const a=state.anim;if(!a)return;const scene=currentScene();plane.render(scene);$('step-badge').textContent=`${a.index+1} / ${a.steps.length}`;
    const total=a.steps.reduce((s,x)=>s+x.duration,0),elapsed=a.steps.slice(0,a.index).reduce((s,x)=>s+x.duration,0)+a.elapsed;$('playback-progress').style.width=`${total?Math.min(100,elapsed/total*100):100}%`;
    explain(scene);renderCalculation(a.before,a.T,a.after,scene.phase,scene);updateChecklist(scene.phase);
  }
  function explain(s){
    const T=s.T,p=s.before.p||s.before.reps[0]?.p,shape=!!s.before.poly;let title='',description='',tip='';
    if(s.phase==='start'){title=s.replay?'직전 움직임을 다시 봐요':'이번 출발을 확인해요';description=(shape?M.equation(s.before.poly):'P'+coord(p))+'에서 시작합니다.';tip=s.replay?'다시 보기는 이동을 추가로 적용하지 않아요.':'어느 방향으로 움직일지 먼저 생각해 보세요.';}
    else if(s.phase==='xdir'){title=`${T.a.num>0?'오른쪽':'왼쪽'}으로 ${M.fmt(T.a.num>0?T.a:T.a.neg())}만큼`;description=`가로 이동량은 ${sign(T.a)}입니다. ${T.a.num>0?'x좌표가 증가하는 양의':'x좌표가 감소하는 음의'} 방향이에요.`;tip='지금 있는 좌표가 음수여도, 오른쪽으로 움직이면 양의 방향이에요.';}
    else if(s.phase==='ydir'){title=`${T.b.num>0?'위쪽':'아래쪽'}으로 ${M.fmt(T.b.num>0?T.b:T.b.neg())}만큼`;description=`가로 이동은 끝났어요. 이제 세로 이동량 ${sign(T.b)}를 적용합니다.`;tip='가로 이동이 끝난 현재 위치에서 세로 이동을 시작해요.';}
    else if(s.phase==='xmove'){title='가로 좌표가 바뀌어요';description=`지금까지 가로로 ${sign(M.q(Number(s.dx.toFixed(4))))}만큼 이동했어요. 세로 좌표 ${M.fmt(p[1])}는 그대로예요.`;tip=s.chunk>1?`긴 이동은 ${s.chunk}단위씩 묶어 보여줘요. 마지막 남은 양까지 정확히 이동해요.`:'경로의 +1, +2…는 출발점에서 움직인 양이에요. 좌표 그 자체와 구분해요.';}
    else if(s.phase==='ymove'){title='이제 세로 좌표가 바뀌어요';description=`지금까지 세로로 ${sign(M.q(Number(s.dy.toFixed(4))))}만큼 이동했어요. 가로 좌표 ${M.fmt(p[0].add(T.a))}는 그대로예요.`;tip=s.chunk>1?`긴 이동은 ${s.chunk}단위씩 묶어 보여줘요.`:'세로 경로의 숫자는 세로 이동을 시작한 위치를 기준으로 해요.';}
    else if(s.phase==='xzero'){title='가로 이동은 0이에요';description=`가로 이동량이 0이므로 x좌표 ${M.fmt(p[0])}는 바뀌지 않아요.`;tip='0도 중요한 이동량이에요. 이 방향으로는 움직이지 않는다는 뜻이에요.';}
    else if(s.phase==='yzero'){title='세로 이동은 0이에요';description=`세로 이동량이 0이므로 y좌표 ${M.fmt(p[1])}는 바뀌지 않아요.`;tip='한 방향만 움직여도 평행이동이에요. 둘 다 0이면 같은 위치가 됩니다.';}
    else if(s.phase==='direct'){title='가로와 세로를 동시에';description=`가로 ${sign(T.a)}, 세로 ${sign(T.b)}를 동시에 적용해요. 꺾인 안내선은 두 이동량을 비교하기 위한 표시예요.`;tip='직선 경로와 가로 → 세로 경로의 도착점은 같아요.';}
    else if(s.phase==='axis'){title=T.kind==='axis'?'굵은 점선이 대칭축이에요':'대칭 중심을 찾아요';description=T.kind==='axis'?`${T.label}을 기준으로 반대편의 점을 찾을 거예요. 먼저 대칭축이 어디인지 살펴보세요.`:`${T.label}이 두 대응점의 중점이 될 거예요. 점 대칭에는 대칭축이 없습니다.`;tip=T.kind==='axis'?'대칭축은 잠시 강조된 뒤 같은 위치에 남아 있어요.':'기준은 직선이 아니라 점 하나예요.';}
    else if(s.phase==='guide'){title=T.kind==='axis'?'축까지의 거리를 재어요':'중심까지의 거리를 확인해요';const dist=T.kind==='axis'?G.distanceLabel(T,p):G.distanceCenter(T,p);description=T.kind==='axis'?`대표 위치에서 축에 수직인 선을 그어요. 축까지의 거리는 ${dist}입니다.`:`출발 위치에서 중심까지의 거리는 ${dist}입니다. 반대편에서도 이 거리가 같아야 해요.`;tip=T.kind==='axis'?'기울어진 축도 똑같아요. 가로나 세로가 아니라 축에 수직으로 재요.':'두 점을 연결한 선분의 중점에 대칭 중심이 있어요.';}
    else if(s.phase==='mirror'){title='반대편에 같은 거리만큼';description=shape?'대표점이 반대편의 대응 위치를 찾아가요. 도형 전체를 찌그러뜨리는 과정이 아니라, 대응점을 설명하는 장면이에요.':'기준의 반대편에서 같은 거리인 점을 찾아가요. 점의 이동은 대응 위치를 설명하기 위한 과정이에요.';tip=T.kind==='axis'?'대칭축 위에 있는 점은 제자리에 있어요.':'대칭 중심 자체는 대칭이동해도 제자리예요.';}
    else if(s.phase==='result'){title='이동을 완성했어요';description=resultDescription(s.before,s.after,T);tip=mode().translation?'현재 도착한 위치가 다음 이동의 출발점이 됩니다.':'같은 대칭을 한 번 더 하면 원래 위치로 돌아가요.';}
    $('stage-title').textContent=title;$('stage-description').textContent=description;$('coach-tip').textContent=tip;
  }
  function resultDescription(before,after,T){
    if(before.p&&before.p.every((v,i)=>v.eq(after.p[i])))return T.kind==='translation'?'두 이동량이 모두 0이므로 위치가 같습니다.':T.kind==='axis'?'이 점은 대칭축 위에 있어요. 대칭이동해도 같은 위치입니다.':'이 점은 대칭 중심이므로 위치가 그대로입니다.';
    if(before.poly&&M.equivalent(before.poly,after.poly))return T.kind==='translation'?'이동 전후 도형이 겹칩니다. 대표점의 대응을 확인해 보세요.':'이 도형은 선택한 기준에 대해 대칭이라 두 모습이 겹쳐요. 각각의 대표점은 어디로 대응되는지 확인하세요.';
    if(before.p)return T.kind==='translation'?`가로 ${sign(T.a)}, 세로 ${sign(T.b)}를 더해서 P′${coord(after.p)}에 도착했어요.`:`${T.label}을 기준으로 대응하는 점은 P′${coord(after.p)}입니다.`;
    const c=M.circleData(after.poly);return c?`원의 중심은 ${coord([c.h,c.k])}입니다. 반지름과 도형의 크기는 변하지 않았어요.`:'도형을 이루는 점들이 같은 변환을 따릅니다. 결과 방정식과 대표점을 함께 확인해 보세요.';
  }
  function complete(){
    const a=state.anim;if(!a)return;stopAnimation();a.index=a.steps.length-1;a.elapsed=0;
    const f=family();if(!a.replay){f.current=a.after;const entry={before:a.before,after:a.after,T:a.T,direct:a.direct,mode:state.mode,time:new Date().toISOString()};f.history.push(entry);f.last=entry;}
    state.completed={before:a.before,after:a.after,T:a.T,replay:a.replay,direct:a.direct};renderAnimation();state.anim=null;syncSource();updateHistory();
    const result=a.after.p?'P′'+coord(a.after.p):M.equation(a.after.poly);$('result-value').textContent=result;$('result-value').classList.add('ready');$('result-description').textContent=resultDescription(a.before,a.after,a.T);$('result-icon').textContent='✓';
    $('result-card').classList.remove('just-finished');void $('result-card').offsetWidth;if(!state.settings.reduced)$('result-card').classList.add('just-finished');$('playback-progress').style.width='100%';updateControls();
    $('coordinate-plane').setAttribute('aria-label',`이동 완료. ${result}. ${resultDescription(a.before,a.after,a.T)}`);
  }
  function finish(){playArrivalSound();complete();}
  function frame(now){
    const a=state.anim;if(!a||!a.playing)return;if(!a.previous)a.previous=now;const delta=Math.min(120,now-a.previous);a.previous=now;
    const step=a.steps[a.index],speed=step.phase==='axis'?1:Number($('speed').value);a.elapsed+=delta*speed;updateMotionSound(a,step);
    if(a.elapsed>=step.duration){a.elapsed=0;a.index++;if(a.index>=a.steps.length-1){finish();return;}}
    renderAnimation();raf=requestAnimationFrame(frame);
  }
  function play(){if(state.sourceDirty){showError('source-error','새 출발 위치를 먼저 적용해 주세요.');return;}let a=state.anim||prepare();if(!a)return;if(state.settings.reduced){nextStep();return;}if(a.elapsed>=a.steps[a.index].duration){a.elapsed=0;a.index++;if(a.index>=a.steps.length-1){finish();return;}}a.playing=true;a.previous=0;updateControls();raf=requestAnimationFrame(frame);}
  function pause(){if(!state.anim)return;if(state.anim.playing){stopAnimation();updateControls();}else play();}
  function nextStep(){let a=state.anim||prepare();if(!a)return;stopAnimation();let s=a.steps[a.index];if(a.elapsed>=s.duration){a.index++;if(a.index>=a.steps.length-1){finish();return;}}s=a.steps[a.index];if(movingPhases.has(s.phase))playMoveSound();a.elapsed=s.duration;renderAnimation();updateControls();}
  function replay(){const a=prepare(true);if(!a)return;toast('직전 움직임만 다시 재생합니다. 이동이 추가로 적용되지는 않아요.');if(state.settings.reduced)nextStep();else play();}
  function undo(){const f=family();if(state.anim){cancelPreview();syncSource();ready();toast('진행 중인 이동을 취소하고 출발 상태로 돌아왔어요.');return;}if(!f.history.length)return;const e=f.history.pop();f.current=e.before;f.last=f.history.at(-1)||null;state.completed=null;syncSource();plane.fit([f.current]);updateHistory();ready();toast('직전 이동 한 번을 취소했어요.');}
  function reset(){cancelPreview();const f=family();f.current=f.initial;f.history=[];f.last=null;syncSource();clearErrors();plane.fit([f.current]);updateHistory();ready();toast('이 실험의 처음 위치로 돌아왔어요.');}
  function changeMode(key){if(!MODES[key])return;cancelPreview();state.mode=key;state.placing=false;plane.placing=false;$('placement-banner').hidden=true;$('coordinate-plane').classList.remove('placing');$('place-point').setAttribute('aria-pressed','false');clearErrors();
    for(const btn of document.querySelectorAll('[data-mode]')){const active=btn.dataset.mode===key;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));}
    const md=mode();$('point-inputs').hidden=md.shape;$('shape-inputs').hidden=!md.shape;$('source-title').textContent=md.shape?'어떤 도형을 움직일까요?':'어디에서 출발할까요?';$('transform-title').textContent=md.translation?'얼마나 움직일까요?':'대칭 기준은 무엇일까요?';$('translation-inputs').hidden=!md.translation;$('reflection-inputs').hidden=md.translation;$('axis-legend').hidden=md.translation;$('board-title').textContent=md.board;
    $('path-explanation').innerHTML=md.translation?'<span>알아두기</span> 가로 → 세로 경로는 좌표 변화를 나누어 보여주는 방법이에요. 동시에 움직여도 도착점은 같아요.':'<span>알아두기</span> 점의 중간 움직임은 대응점을 찾는 안내예요. 대칭이동은 중간 도형의 변형이 아니라 최종 대응 관계를 뜻해요.';
    syncSource();updateDirections();updateAxisUI();updateHistory();plane.fit([family().current]);
    if(state.learning==='challenge')loadChallenge(0);else{state.challenge=null;ready();}
  }
  const EXAMPLES={
    'point-translation':[
      {p:[-2,3],a:3,b:-2},{p:[-4,1],a:2,b:0},{p:[0,0],a:'5/2',b:'-1/2'},{p:[3,-2],a:-5,b:4}
    ],
    'point-reflection':[
      {p:[2,3],axis:'vertical',h:1},{p:[2,3],axis:'general',line:'x+y-1=0'},{p:[2,0],axis:'xaxis'},{p:[-3,2],axis:'origin'}
    ],
    'shape-translation':[
      {eq:'(x-1)^2+(y-2)^2=4',a:3,b:-1},{eq:'y=2x+1',a:3,b:-2},{eq:'y=x^2',a:2,b:1},{eq:'x=2',a:-4,b:2}
    ],
    'shape-reflection':[
      {eq:'(x-2)^2+(y-1)^2=4',axis:'yaxis'},{eq:'y=x^2',axis:'diagonal'},{eq:'x^2+y^2=4',axis:'yaxis'},{eq:'y=2x+1',axis:'general',line:'x+y-1=0'}
    ]
  };
  function applyExample(ex){state.updating=true;if(ex.a!==undefined)$('move-x').value=ex.a;if(ex.b!==undefined)$('move-y').value=ex.b;if(ex.axis)$('axis-select').value=ex.axis;if(ex.h!==undefined)$('axis-h').value=ex.h;if(ex.k!==undefined)$('axis-k').value=ex.k;if(ex.line)$('axis-equation').value=ex.line;$('path-mode').value='step';state.updating=false;updateDirections();updateAxisUI();setSource(ex.eq?makeShape(ex.eq):makePoint(...ex.p),true);}
  function exampleNext(){if(state.learning==='challenge'){loadChallenge((state.challenge?.index??-1)+1);return;}state.exampleIndex=(state.exampleIndex+1)%EXAMPLES[state.mode].length;applyExample(EXAMPLES[state.mode][state.exampleIndex]);toast('새 예제를 불러왔어요. 이동 전에 도착 위치를 예상해 보세요.');}
  const REASONS={
    'point-translation':{options:['가로·세로 이동량을 각각 x, y좌표에 더한다.','이동량의 부호를 무조건 양수로 바꾼다.','x좌표와 y좌표를 서로 바꾼다.'],correct:0,hints:['오른쪽·위쪽은 +, 왼쪽·아래쪽은 −예요.','가로 이동은 x좌표, 세로 이동은 y좌표만 바꾸어요.','새 점은 (원래 x+a, 원래 y+b)예요.']},
    'point-reflection':{options:['대칭축 또는 중심의 반대편, 같은 거리에 놓는다.','모든 경우에 x, y 부호를 둘 다 바꾼다.','대칭축 쪽으로 한 칸만 이동한다.'],correct:0,hints:['먼저 대칭 기준이 직선인지 점인지 살펴보세요.','축 대칭에서는 축에 수직으로, 같은 거리를 확인해요.','y축은 x의 부호, x축은 y의 부호가 바뀌어요. 원점에서는 둘 다 바뀌어요.']},
    'shape-translation':{options:['원래 식에 x−a와 y−b를 동시에 대입한다.','원래 식의 상수만 전부 더한다.','원의 반지름에도 이동량을 더한다.'],correct:0,hints:['중심이나 꼭짓점이 어디로 이동하는지 먼저 생각해 보세요.','도형을 이루는 점은 (x+a, y+b)로 이동해요.','새 좌표에서 이동량을 빼면 옛 좌표예요. 원래 식에 x−a, y−b를 넣어요.']},
    'shape-reflection':{options:['점의 대응 관계를 원래 식의 변수에 동시에 대입한다.','식의 모든 부호를 무조건 뒤집는다.','반지름과 길이를 음수로 바꾼다.'],correct:0,hints:['도형의 대표점부터 대칭시켜 보세요.','대칭이동해도 길이와 반지름은 바뀌지 않아요.','y=x 대칭에서는 x와 y를 동시에 바꾸어요. y축은 x→−x, x축은 y→−y예요.']}
  };
  function setLearning(learning){cancelPreview();state.learning=learning;document.querySelectorAll('[data-learning]').forEach(btn=>{const active=btn.dataset.learning===learning;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});$('learning-description').textContent=learning==='guided'?'방향을 살피고, 한 칸씩 움직여 보세요.':learning==='free'?'원하는 점과 도형으로 마음껏 실험해 보세요.':'결과와 이유를 예상하고, 움직여 확인해 보세요.';$('challenge-card').hidden=learning!=='challenge';if(learning==='challenge')loadChallenge(0);else{state.challenge=null;ready();}}
  function loadChallenge(index){const bank=EXAMPLES[state.mode],i=((index%bank.length)+bank.length)%bank.length;state.challenge={id:`${state.mode}:${i}`,index:i,hints:0,solved:false};applyExample(bank[i]);const T=getTransform();state.challenge.expected=transformed(family().current,T);state.challenge.start=family().current;state.challenge.T=T;
    $('challenge-card').hidden=false;$('prediction-point').hidden=mode().shape;$('prediction-shape').hidden=!mode().shape;$('challenge-title').textContent=mode().shape?'이동 후 방정식은?':'이동 후 좌표는?';for(const id of ['predict-x','predict-y','predict-equation'])$(id).value='';
    // Rotate options by problem index so the correct reason is not always first.
    const base=REASONS[state.mode],options=base.options.map((s,j)=>({s,id:j}));const rotate=i%options.length;const ordered=options.slice(rotate).concat(options.slice(0,rotate));$('predict-reason').innerHTML='<option value="">이유를 선택하세요</option>'+ordered.map(o=>`<option value="${o.id}">${esc(o.s)}</option>`).join('');$('prediction-feedback').textContent='답을 예상한 뒤 [예상 확인]을 눌러요. 틀려도 힌트를 보고 다시 도전할 수 있어요.';updateControls();}
  function checkPrediction(){const task=state.challenge;if(!task)return;try{
      const correct=mode().shape?M.equivalent(M.parseEquation($('predict-equation').value),task.expected.poly):[M.parseNumber($('predict-x').value,1000000),M.parseNumber($('predict-y').value,1000000)].every((v,i)=>v.eq(task.expected.p[i]));const reason=$('predict-reason').value;
      if(!correct){$('prediction-feedback').textContent='결과를 다시 살펴볼까요? '+REASONS[state.mode].hints[Math.min(task.hints,2)];return;}
      if(reason===''){$('prediction-feedback').textContent='예상한 결과가 맞아요! 이제 그렇게 생각한 이유도 선택해 보세요.';return;}
      if(+reason!==REASONS[state.mode].correct){$('prediction-feedback').textContent='결과는 맞았어요. 이유를 다시 확인해 볼까요? '+REASONS[state.mode].hints[1];return;}
      task.solved=true;const previous=Array.isArray(state.badges[state.mode])?state.badges[state.mode]:[];if(!previous.includes(task.id))previous.push(task.id);state.badges[state.mode]=previous;save();updateBadges();$('prediction-feedback').textContent='✓ 결과와 이유를 정확하게 연결했어요! 이동을 실행해 내 예상을 눈으로 확인해 보세요.';toast('잘했어요! 결과와 이유를 모두 맞혔어요.');
    }catch(e){$('prediction-feedback').textContent=e.message;}}
  function updateBadges(){let total=0;$('progress-list').innerHTML=Object.entries(MODES).map(([key,md])=>{const count=Array.isArray(state.badges[key])?state.badges[key].length:0,earned=count>=2;if(earned)total++;return `<div class="progress-item ${earned?'earned':''}"><div>${earned?'✧':'○'}</div><b>${md.name}</b><span>서로 다른 문제 ${count}개 성공${earned?' · 배지 획득':' · 2개면 배지'}</span></div>`;}).join('');$('badge-count').textContent=`나의 배지 ${total}/4`;}
  function updateHistory(){const h=family().history;$('history-count').textContent=h.length;$('history-list').innerHTML=h.length?h.slice(-20).map((e,i)=>{const from=e.before.p?coord(e.before.p):M.equation(e.before.poly),to=e.after.p?coord(e.after.p):M.equation(e.after.poly);return `<article class="history-item"><b>${h.length-Math.min(20,h.length)+i+1}. ${esc(e.T.label)}</b><div>${esc(from)} → ${esc(to)}</div></article>`;}).reverse().join(''):'<p class="empty-note">이동을 마치면 이곳에 기록이 쌓여요.</p>';$('export-history').disabled=!h.length;updateCurrent();}
  function download(name,text,type='text/plain;charset=utf-8'){const blob=text instanceof Blob?text:new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function exportHistory(){const h=family().history,lines=['점과 도형의 이동 실험실 · 나의 실험 기록',`저장 시각: ${new Date().toLocaleString('ko-KR')}`,`현재 메뉴: ${mode().name}`,''];for(let i=0;i<h.length;i++){const e=h[i];lines.push(`${i+1}. ${MODES[e.mode].name} | ${e.T.label}`,`   출발: ${e.before.p?coord(e.before.p):M.equation(e.before.poly)}`,`   결과: ${e.after.p?coord(e.after.p):M.equation(e.after.poly)}`,'');}download('이동실험실_나의기록.txt','\uFEFF'+lines.join('\n'));toast('이동 기록을 파일로 저장했어요.');}
  async function copy(text){try{await navigator.clipboard.writeText(text);toast('복사했어요.');return true;}catch{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand('copy');}catch{}ta.remove();toast(ok?'복사했어요.':'자동 복사를 사용할 수 없어요. 내용을 선택해 복사해 주세요.');return ok;}}
  async function saveImage(){try{const svg=$('coordinate-plane').cloneNode(true),width=plane.W,height=plane.H;svg.setAttribute('width',width);svg.setAttribute('height',height);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent='.tick{font-size:10px;fill:#7a8997;paint-order:stroke;stroke:#fcfcf9;stroke-width:3px}.axis-title{font-size:12px;fill:#6f8597;font-weight:700}text{font-family:Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}.finish-pulse,.axis-pulse{animation:none}';svg.prepend(style);const blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});const canvas=document.createElement('canvas');canvas.width=Math.round(width*2);canvas.height=Math.round((height+70)*2);const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#fcfcf9';ctx.fillRect(0,0,width,height+70);ctx.drawImage(img,0,0,width,height);ctx.fillStyle='#20394d';ctx.font='bold 13px sans-serif';ctx.fillText(`이동 실험실 · ${mode().name}`,18,height+26);ctx.font='11px sans-serif';const txt=state.completed?(state.completed.after.p?'P′'+coord(state.completed.after.p):M.equation(state.completed.after.poly)):'현재 출발 위치';ctx.fillText(txt,18,height+49,width-36);URL.revokeObjectURL(url);const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw new Error('이미지 변환 실패');download('이동실험실_좌표판.png',png);toast('좌표판 이미지를 저장했어요.');}catch{toast('이 브라우저에서 이미지 저장이 제한되어 있어요. 기기의 화면 캡처를 사용해 주세요.');}}
  function shareExample(){if(!/^https?:$/.test(location.protocol)||location.href==='about:srcdoc'){toast('배포한 웹페이지에서 예제 링크를 만들 수 있어요. 로컬 파일에서는 좌표판·기록을 저장해 주세요.');return;}try{const cur=family().current,payload={mode:state.mode,point:cur.p?.map(String),equation:cur.poly?M.equation(cur.poly,false):undefined,a:$('move-x').value,b:$('move-y').value,axis:$('axis-select').value,h:$('axis-h').value,k:$('axis-k').value,line:$('axis-equation').value};const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('experiment',JSON.stringify(payload));$('share-link').value=u.toString();$('share-dialog').showModal();}catch{toast('입력한 조건을 확인해 주세요.');}}
  function readShared(){try{const raw=new URL(location.href).searchParams.get('experiment');if(!raw)return;if(raw.length>1800)throw new Error('공유한 조건이 너무 길어요.');const data=JSON.parse(raw);if(!MODES[data.mode])throw new Error('알 수 없는 실험 메뉴예요.');changeMode(data.mode);const ex=mode().shape?{eq:String(data.equation)}:{p:data.point?.map(v=>M.parseNumber(String(v)))};if(!ex.eq&&(!ex.p||ex.p.length!==2))throw new Error('공유 좌표가 올바르지 않아요.');Object.assign(ex,{a:data.a,b:data.b,axis:data.axis,h:data.h,k:data.k,line:data.line});applyExample(ex);getTransform();toast('공유된 예제의 출발 위치와 이동 조건을 불러왔어요.');}catch(e){toast('공유 예제를 불러오지 못했어요. 기본 예제로 시작합니다.');changeMode('point-translation');applyExample(EXAMPLES['point-translation'][0]);}}
  // UI event wiring. Changed inputs cancel an unfinished preview; completed state stays immutable.
  $('apply-point').addEventListener('click',applySource);$('apply-shape').addEventListener('click',applySource);
  ['point-x','point-y','shape-equation'].forEach(id=>$(id).addEventListener('input',onSourceInput));
  ['point-x','point-y','shape-equation'].forEach(id=>$(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applySource();}}));
  ['move-x','move-y','axis-h','axis-k','axis-equation'].forEach(id=>$(id).addEventListener('input',onTransformInput));
  ['axis-select','path-mode'].forEach(id=>$(id).addEventListener('change',onTransformInput));
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>changeMode(b.dataset.mode)));
  document.querySelectorAll('[data-learning]').forEach(b=>b.addEventListener('click',()=>setLearning(b.dataset.learning)));
  document.querySelectorAll('[data-nudge]').forEach(b=>b.addEventListener('click',()=>{const [id,delta]=b.dataset.nudge.split(':');try{$(id).value=M.parseNumber($(id).value).add(delta).toString();onTransformInput();}catch(e){showError('transform-error',e);}}));
  document.querySelectorAll('[data-direction]').forEach(b=>b.addEventListener('click',()=>{const [axis,dir]=b.dataset.direction.split(':');try{const current=M.parseNumber($(`move-${axis}`).value),v=current.num<0?current.neg():current;$(`move-${axis}`).value=(+dir<0?v.neg():v).toString();onTransformInput();}catch(e){showError('transform-error',e);}}));
  document.querySelectorAll('[data-axis]').forEach(b=>b.addEventListener('click',()=>{$('axis-select').value=b.dataset.axis;onTransformInput();}));
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{const presets={circle:'(x-1)^2+(y-2)^2=4',line:'y=2x+1',parabola:'y=x^2',vertical:'x=2'};$('shape-equation').value=presets[b.dataset.preset];applySource();}));
  $('place-point').addEventListener('click',()=>{state.placing=!state.placing;plane.placing=state.placing;$('place-point').setAttribute('aria-pressed',String(state.placing));$('placement-banner').hidden=!state.placing;$('coordinate-plane').classList.toggle('placing',state.placing);});
  $('run').addEventListener('click',play);$('pause').addEventListener('click',pause);$('step').addEventListener('click',nextStep);$('replay').addEventListener('click',replay);$('undo').addEventListener('click',undo);$('reset').addEventListener('click',reset);
  $('zoom-in').addEventListener('click',()=>plane.zoom(1.2));$('zoom-out').addEventListener('click',()=>plane.zoom(1/1.2));$('fit-view').addEventListener('click',()=>{const a=state.anim||state.completed;plane.fit(a?[a.before,a.after]:[family().current],a?.T||null);});
  $('sound-effects').checked=state.settings.sound;
  $('sound-effects').addEventListener('change',()=>{state.settings.sound=$('sound-effects').checked;save();});
  const settingMap={'show-original':'original','show-trail':'trail','show-reps':'reps','chess-pattern':'chess','reduce-motion':'reduced'};
  Object.entries(settingMap).forEach(([id,key])=>$(id).addEventListener('change',()=>{state.settings[key]=$(id).checked;settingsToUI();save();if(state.anim){if(key==='reduced'&&state.settings.reduced)stopAnimation();renderAnimation();updateControls();}else if(state.completed){const a=state.completed;plane.render({before:a.before,after:a.after,T:a.T,phase:'result',dx:a.T.a?.num||0,dy:a.T.b?.num||0,t:1,settings:state.settings,direct:a.direct});}else ready();plane.drawGrid();}));
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change',e=>{if(e.matches){state.settings.reduced=true;settingsToUI();if(state.anim)stopAnimation();updateControls();}});
  $('load-example').addEventListener('click',exampleNext);$('next-challenge').addEventListener('click',()=>loadChallenge((state.challenge?.index??-1)+1));$('check-prediction').addEventListener('click',checkPrediction);$('show-hint').addEventListener('click',()=>{if(!state.challenge)return;const i=Math.min(state.challenge.hints++,2);$('prediction-feedback').textContent=`힌트 ${i+1}/3 · `+REASONS[state.mode].hints[i];});
  $('help-open').addEventListener('click',()=>{$('help-dialog').showModal();if(state.anim?.playing)pause();});$('progress-open').addEventListener('click',()=>{updateBadges();$('progress-dialog').showModal();if(state.anim?.playing)pause();});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  $('clear-progress').addEventListener('click',()=>{if(confirm('이 기기에 저장된 배지 기록을 초기화할까요?')){state.badges={};save();updateBadges();toast('배지 기록을 초기화했어요.');}});
  $('export-history').addEventListener('click',exportHistory);$('save-image').addEventListener('click',saveImage);$('share-example').addEventListener('click',shareExample);$('copy-link').addEventListener('click',()=>copy($('share-link').value));$('copy-result').addEventListener('click',()=>copy($('result-value').textContent));
  document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT','BUTTON','SUMMARY'].includes(document.activeElement?.tagName)||document.querySelector('dialog[open]'))return;if(e.code==='Space'){e.preventDefault();if(state.anim)pause();else play();}if(e.code==='ArrowRight'){e.preventDefault();nextStep();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.anim?.playing){stopAnimation();updateControls();}});
  // Read-only diagnostics for reproducible tests and future integrations.
  window.MoveLab={version:'1.0.0',getSnapshot:()=>{const f=family();return {mode:state.mode,learning:state.learning,point:f.current.p?.map(String),equation:f.current.poly?M.equation(f.current.poly,false):null,history:f.history.length,phase:state.anim?.steps[state.anim.index].phase||(state.completed?'result':'ready'),playing:!!state.anim?.playing,sourceDirty:state.sourceDirty,completed:!!state.completed};}};
  settingsToUI();updateBadges();updateDirections();updateAxisUI();syncSource();ready();readShared();
  if(window.innerWidth<=640)$('input-panel').open=false;
})();
