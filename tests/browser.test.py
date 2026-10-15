"""Offline Chromium integration tests. No network, accounts, or deployed site required.
Requires: pip install playwright; playwright install chromium
Set CHROMIUM_EXECUTABLE to use an existing browser binary.
"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text(encoding='utf-8')
RESULTS=[]

def check(name, condition=True):
    assert condition, name
    RESULTS.append({'test':name,'status':'passed'})

def run():
 with sync_playwright() as pw:
    opts={'headless':True,'args':['--no-sandbox']}
    executable=os.environ.get('CHROMIUM_EXECUTABLE')
    if executable: opts['executable_path']=executable
    browser=pw.chromium.launch(**opts)
    page=browser.new_page(viewport={'width':1440,'height':1120},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.set_content(HTML,wait_until='load')
    snap=lambda:page.evaluate('MoveLab.getSnapshot()')
    click=lambda s:page.locator(s).click()
    fill=lambda s,v:page.locator(s).fill(str(v))
    def finish(start=True):
        if start:click('#step')
        for _ in range(60):
            if snap()['completed']:return
            click('#step')
        raise AssertionError('Animation did not finish in 60 steps')
    def point(x,y):
        fill('#point-x',x);fill('#point-y',y);click('#apply-point')
    def movement(a,b):
        fill('#move-x',a);fill('#move-y',b)
    def switch(name):click(f'[data-mode="{name}"]')
    def axis(name):page.locator('#axis-select').select_option(name)
    def shape(eq):fill('#shape-equation',eq);click('#apply-shape')
    def reduced():
        page.locator('.display-options').evaluate('(e)=>e.open=true')
        page.locator('#reduce-motion').check()
    check('initial source and four menus',snap()['point']==['-2','3'] and page.locator('[data-mode]').count()==4)
    check('default chess square is 1 coordinate unit','한 칸 1단위' in page.locator('#grid-unit').inner_text())
    page.locator('#toast').evaluate('(e)=>e.hidden=true')
    page.screenshot(path=str(ROOT/'docs/desktop-initial.png'),full_page=True)
    finish()
    check('point translation signed displacement',snap()['point']==['1','1'] and snap()['history']==1)
    scene='\n'.join(page.locator('#scene-layer text').all_text_contents())
    check('trajectory numbers and final coordinate on plane','가로 +3' in scene and '세로 −2' in scene and 'P′ (1, 1)' in scene)
    page.locator('#toast').evaluate('(e)=>e.hidden=true')
    page.screenshot(path=str(ROOT/'docs/desktop-result.png'),full_page=True)
    reduced();click('#replay');finish(start=False)
    check('replay does not add another transformation',snap()['point']==['1','1'] and snap()['history']==1)
    movement(-2,1);finish()
    check('next transformation starts from current position',snap()['point']==['-1','2'] and snap()['history']==2)
    click('#undo');check('undo restores exact previous state',snap()['point']==['1','1'] and snap()['history']==1)
    click('#reset');check('reset restores initial experiment',snap()['point']==['-2','3'] and snap()['history']==0)
    point(-4,1);movement(2,0);finish();check('positive direction from negative coordinates',snap()['point']==['-2','1'])
    point(0,0);movement('5/2','-1/2');finish();check('fractional final coordinates remain exact',snap()['point']==['5/2','-1/2'])
    movement(0,0);finish();check('zero movement keeps position',snap()['point']==['5/2','-1/2'] and '위치가 같습니다' in page.locator('#result-description').inner_text())
    fill('#point-x','1/3');check('unapplied source blocks execution',page.locator('#run').is_disabled())
    click('#apply-point');movement('2/3',0);finish();check('exact fractional addition',snap()['point']==['1','-1/2'])
    point(0,0);movement(3,4);page.locator('#path-mode').select_option('direct');finish();check('simultaneous path yields same displacement',snap()['point']==['3','4'])
    switch('point-reflection');point(2,3);axis('vertical');fill('#axis-h',1);finish()
    check('reflection in x=1',snap()['point']==['0','3'])
    check('both equal distances labeled','\n'.join(page.locator('#scene-layer text').all_text_contents()).count('거리 1')==2)
    switch('point-reflection');point(2,3);axis('general');fill('#axis-equation','x+y-1=0');finish()
    check('general oblique mirror exact result',snap()['point']==['-2','-1'])
    page.locator('#toast').evaluate('(e)=>e.hidden=true')
    page.screenshot(path=str(ROOT/'docs/point-reflection.png'),full_page=True)
    finish();check('reflection involution restores point',snap()['point']==['2','3'])
    point(2,0);axis('xaxis');finish();check('point on axis remains fixed','대칭축 위' in page.locator('#result-description').inner_text())
    point(-3,2);axis('origin');finish();check('central reflection has no fake axis',snap()['point']==['3','-2'] and '대칭축' not in '\n'.join(page.locator('#scene-layer text').all_text_contents()))
    point(3,4);axis('center');fill('#axis-h',1);fill('#axis-k',2);finish();check('arbitrary center',snap()['point']==['-1','0'])
    axis('general');fill('#axis-equation','y=x^2');click('#step');check('curved mirror rejected','직선만' in page.locator('#transform-error').inner_text())
    switch('shape-translation');shape('(x-1)^2+(y-2)^2=4');movement(3,-1);finish()
    check('circle translated by exact substitution',snap()['equation']=='(x - 4)^2 + (y - 1)^2 = 4')
    check('circle SVG keeps equal radii',page.locator('#scene-layer ellipse').count()>=1)
    page.locator('#toast').evaluate('(e)=>e.hidden=true')
    page.screenshot(path=str(ROOT/'docs/shape-translation.png'),full_page=True)
    shape('y=2x+1');movement(3,-2);finish();check('line translation canonical result',snap()['equation']=='y = 2x - 7')
    shape('x=2');movement(-4,3);finish();check('vertical line supported',snap()['equation']=='x = -2')
    switch('shape-reflection');shape('(x-2)^2+(y-1)^2=4');axis('yaxis');finish();check('circle reflection',snap()['equation']=='(x + 2)^2 + (y - 1)^2 = 4')
    shape('y=x^2');axis('diagonal');finish();check('sideways parabola keeps both branches',snap()['equation']=='x = y^2' and page.locator('#scene-layer path').count()>=2)
    page.locator('#toast').evaluate('(e)=>e.hidden=true')
    check('reflection selects a moving representative instead of a fixed vertex', 'Q′ (1, −1)' in '\n'.join(page.locator('#scene-layer text').all_text_contents()))
    page.screenshot(path=str(ROOT/'docs/shape-reflection.png'),full_page=True)
    shape('x^2+y^2=4');axis('yaxis');finish();check('coincident reflected figure explained','두 모습이 겹쳐요' in page.locator('#result-description').inner_text())
    for eq in ['x^2+y^2=-1','y=1/x','y=sin(x)','y=x^3','1=0','0=0']:
        fill('#shape-equation',eq);click('#apply-shape');check(f'invalid or unsupported equation rejected: {eq}',page.locator('#source-error').is_visible())
    for eq in ['x^2+2xy+3y^2=4','xy=1','x^2-y^2=0','(x+y)^2=1','(x-1)^2+(y-2)^2=0']:
        shape(eq);axis('general');fill('#axis-equation','2x+3y-1=0');finish();check(f'general conic renders after reflection: {eq}',not page.locator('#scene-layer').evaluate('(e)=>/NaN|Infinity/.test(e.innerHTML)'))
    switch('point-translation');click('[data-learning="challenge"]')
    check('challenge locks assigned problem fields',page.locator('#point-x').is_disabled() and page.locator('#move-x').is_disabled())
    fill('#predict-x',1);fill('#predict-y',1);page.locator('#predict-reason').select_option('0');click('#check-prediction')
    check('prediction with reason accepted','정확하게' in page.locator('#prediction-feedback').inner_text())
    click('#next-challenge');fill('#predict-x',-2);fill('#predict-y',1);page.locator('#predict-reason').select_option('0');click('#check-prediction')
    check('two distinct problems earn badge','1/4' in page.locator('#badge-count').inner_text())
    click('[data-learning="free"]');check('free experimentation unlocks input',not page.locator('#point-x').is_disabled())
    click('#help-open');check('coordinate help dialog',page.locator('#help-dialog').is_visible());click('.dialog-close[data-close="help-dialog"]')
    # Ordinary time-based playback, pause, and cancellation, independent of manual-step tests.
    page.locator('#reduce-motion').uncheck();point(-2,3);movement(3,-2);page.locator('#path-mode').select_option('step');page.locator('#speed').select_option('2');click('#run');page.wait_for_timeout(150)
    check('time-based animation running and inputs locked',snap()['playing'] and page.locator('#point-x').is_disabled())
    click('#pause');paused=snap();page.wait_for_timeout(120)
    check('pause stops frames without committing',not snap()['playing'] and snap()['history']==0)
    click('#run');page.wait_for_function('MoveLab.getSnapshot().completed',timeout=12000)
    check('real animation commits exactly once',snap()['point']==['1','1'] and snap()['history']==1)
    # Changing an input while a preview is paused cancels that preview, not committed history.
    click('#run');page.wait_for_timeout(100);click('#pause');fill('#move-x',1)
    check('editing a paused preview cancels it safely',snap()['phase']=='ready' and snap()['point']==['1','1'] and snap()['history']==1)
    # Responsive render and touch interaction at emulated tablet and phone dimensions.
    for name,width,height,touch in [('tablet-landscape',1024,768,True),('tablet-portrait',768,1024,True),('mobile',390,844,True)]:
        ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=touch,is_mobile=False,device_scale_factor=1)
        pg=ctx.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));pg.set_content(HTML,wait_until='load')
        pg.wait_for_timeout(80)
        check(f'{name}: no horizontal overflow',pg.evaluate('document.documentElement.scrollWidth <= innerWidth+1'))
        pg.locator('#step').click();check(f'{name}: touch-sized controls operate',pg.evaluate('MoveLab.getSnapshot().phase')=='start')
        if name=='mobile':check('mobile: settings initially collapsed',not pg.locator('#input-panel').evaluate('(e)=>e.open'))
        pg.screenshot(path=str(ROOT/f'docs/{name}.png'),full_page=True)
        ctx.close()
    # srcdoc tests the same embedded execution style as the Streamlit wrapper.
    embedded=browser.new_page(viewport={'width':1200,'height':900})
    embedded.set_content('<iframe id="app" style="width:100%;height:850px;border:0"></iframe>')
    embedded.locator('#app').evaluate('(e, html)=>{e.srcdoc=html}',HTML)
    embedded.frame_locator('#app').locator('#step').click()
    check('iframe/srcdoc app initializes and responds',embedded.frame_locator('#app').locator('#step-badge').inner_text()=='1 / 9')
    check('no uncaught JavaScript errors',not errors)
    browser.close()
 print(json.dumps({'suite':'browser-integration','status':'passed','checks':len(RESULTS),'results':RESULTS},ensure_ascii=False,indent=2))
 (ROOT/'tests/browser-results.json').write_text(json.dumps({'status':'passed','checks':len(RESULTS),'results':RESULTS},ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__':run()
