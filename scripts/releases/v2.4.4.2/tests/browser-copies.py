"""Test local copies with Chromium restarts and a seeded, loopback-only GaryHub instance."""
import argparse
import re
import shutil
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ORIGIN = 'https://tools.garyhub.uk'
PAGE = ORIGIN + '/useful/site-navigator/'


def browser_profile(pw, args, path, requests):
    ctx = pw.chromium.launch_persistent_context(path, executable_path=args.browser,
                args=['--no-sandbox'], viewport={'width': 1240, 'height': 820})
    ctx.add_init_script('window.showOpenFilePicker = window.showDirectoryPicker = undefined')
    def route_local(route):
        req = route.request
        if not req.url.startswith(ORIGIN + '/'):
            route.abort()
            return
        if req.method == 'POST' and '/site-navigator' in req.url:
            requests.append(req.post_data_json)
        resp = ctx.request.fetch(args.tools.rstrip('/') + req.url[len(ORIGIN):], method=req.method,
                                 headers={**req.all_headers(), 'host':'tools.garyhub.uk'},
                                 data=req.post_data_buffer, max_redirects=0)
        route.fulfill(response=resp)
    ctx.route('https://**/*', route_local)
    return ctx


def login(pw, ctx, calendar, username):
    auth = pw.request.new_context(base_url=calendar)
    token = auth.get('/api/csrf').json()['token']
    assert auth.post('/api/login', headers={'Origin': ORIGIN, 'X-CSRF-Token': token},
                     data={'username': username, 'password': 'Synthetic-Only-2026!'}).ok
    ctx.clear_cookies()
    ctx.add_cookies([{'name': c['name'], 'value': c['value'], 'url': ORIGIN} for c in auth.storage_state()['cookies']])
    auth.dispose()


def choose(page, kind, target):
    with page.expect_file_chooser() as selection:
        page.locator('#pick-' + kind).click()
    selection.value.set_files(target)
    expect(page.locator('#chosen')).to_contain_text(target.name)


def add(page, name, kind, target, keep=True, copy=True):
    page.locator('#add').click()
    choose(page, kind, target)
    page.locator('#name').fill(name)
    expect(page.locator('#remember')).not_to_be_checked()
    expect(page.locator('#copy-option')).to_be_hidden()
    if keep:
        page.locator('#remember').check()
        expect(page.locator('#keep-copy')).to_be_checked()
        if not copy:
            page.locator('#keep-copy').uncheck()
    page.locator('#submit').click()
    expect(page.locator('#frame iframe')).to_be_visible(timeout=30000)


def card(page, name):
    return page.locator('#sites .card').filter(has=page.get_by_text(name, exact=True))


def read_course(page):
    frame = page.frame_locator('#frame iframe')
    frame.get_by_role('heading', name='机器人学研习室').wait_for(timeout=25000)
    frame.get_by_text('进入题库解析', exact=True).first.click()
    frame.locator('a[href^="#question/"]').first.click()
    figure = frame.locator('figure img').first
    expect(figure).not_to_have_js_property('naturalWidth', 0)
    expect(frame.locator('.katex').first).to_be_visible()
    pdf = frame.locator('a[href*=".pdf#page="]').first
    if not pdf.count():
        frame.locator('a[href="#lectures"]').first.click()
        frame.locator('a[href^="#lecture/"]').first.click()
        pdf = frame.locator('a[href*=".pdf#page="]').first
    target = int(pdf.get_attribute('href').split('#page=')[-1])
    pdf.click()
    expect(page.locator('#asset-body canvas')).to_be_visible(timeout=20000)
    expect(page.locator('#page-num')).to_have_text(re.compile(rf'^{target} / [0-9]+$'))
    print('PASS course from stored copy: figure, KaTeX, PDF page', target, flush=True)


def saved_rows(page):
    return page.evaluate("""async () => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open('garyhub-personal-sites',1);
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
      const keys = await new Promise(resolve => {const r=db.transaction('bindings').objectStore('bindings').getAllKeys();
        r.onsuccess=()=>resolve(r.result);}); db.close(); return keys;
    }""")


def run(pw, args, tmp):
    posts = []
    html = tmp / 'chapter.html'
    html.write_text('<h1>独立练习</h1>', encoding='utf-8')
    folder = tmp / 'ECE_310_题库'
    nested = folder / '章节'
    nested.mkdir(parents=True)
    (nested/'index.html').write_text('<title>题库</title><link rel="stylesheet" href="course.css"><h1>第一题</h1><a href="next.html">下一题</a>', encoding='utf-8')
    (nested/'next.html').write_text('<h1>第二题</h1>', encoding='utf-8')
    (nested/'course.css').write_text('h1 { color: rgb(15, 68, 150); }')
    archive = tmp / 'course.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in nested.iterdir():
            z.write(f, f.relative_to(folder))
    if args.course:
        private = tmp / 'practice.zip'
        shutil.copyfile(args.course, private)
    alice = 'check_alice'
    profile = tmp/'profile'
    ctx = browser_profile(pw, args, profile, posts)
    login(pw, ctx, args.calendar, alice)
    p = ctx.pages[0]
    p.goto(PAGE)
    expect(p.locator('#who')).to_have_text(alice)
    add(p, '临时阅读', 'file', html, keep=False)
    p.click('#leave')
    expect(p.locator('.card')).to_have_count(0)
    assert not saved_rows(p)
    for name, kind, target in [('单页','file',html), ('数字信号处理题库 · ECE 310','folder',folder), ('压缩课程','file',archive)]:
        add(p, name, kind, target)
        expect(p.locator('#copy-badge')).to_be_visible()
        p.click('#leave')
        expect(card(p,name)).to_contain_text('已存本机副本')
    if args.course:
        add(p, 'ECE 470 ZIP', 'file', private)
        p.click('#leave')
        private.unlink()
    # Recreate the v1 binding shape produced by the old standard picker.
    add(p, '旧题库', 'file', html, copy=False)
    p.click('#leave')
    old_card = card(p,'旧题库')
    old_id = old_card.get_attribute('id').removeprefix('site-')
    uid = p.evaluate("(async () => (await (await fetch('/api/hub/me')).json()).user.id)()")
    p.evaluate("""async ([uid,site]) => {
      const db=await new Promise(ok=>{const r=indexedDB.open('garyhub-personal-sites',1); r.onsuccess=()=>ok(r.result);});
      await new Promise(ok=>{const tx=db.transaction('bindings','readwrite'); tx.objectStore('bindings').put({
        account:uid,site,handle:null,entry:'chapter.html',device:crypto.randomUUID(),last:'ready'}); tx.oncomplete=ok;});db.close();
    }""", [uid, old_id])
    p.reload()
    old_card.locator('.card-main').click()
    expect(p.locator('#drawer-title')).to_have_text('关联本机文件')
    choose(p,'file',html)
    p.click('#submit')
    expect(p.frame_locator('#frame iframe').get_by_role('heading')).to_have_text('独立练习')
    p.click('#leave')
    assert old_card.get_attribute('id') == 'site-' + old_id
    assert sum(k[1] == old_id for k in saved_rows(p)) == 2
    count = p.locator('.card').count()
    # Removing the outside sources ensures the snapshot owns the bytes.
    html.unlink()
    shutil.rmtree(folder)
    archive.unlink()
    ctx.close()

    ctx = browser_profile(pw, args, profile, posts)
    login(pw, ctx, args.calendar, alice)
    p = ctx.pages[0]
    p.goto(PAGE)
    expect(p.locator('.card')).to_have_count(count)
    unexpected_choosers = []
    p.on('filechooser', lambda chooser: unexpected_choosers.append(chooser))
    for name in ['单页','旧题库','数字信号处理题库 · ECE 310','压缩课程'] + (['ECE 470 ZIP'] if args.course else []):
        card(p,name).locator('.card-main').click()
        expect(p.locator('#drawer')).to_be_hidden()
        expect(p.locator('#copy-badge')).to_be_visible()
        frame = p.frame_locator('#frame iframe')
        if name == 'ECE 470 ZIP':
            read_course(p)
        elif name in ['单页','旧题库']:
            expect(frame.get_by_role('heading')).to_have_text('独立练习')
        else:
            expect(frame.get_by_role('heading')).to_have_css('color','rgb(15, 68, 150)')
            frame.get_by_text('下一题').click()
            expect(frame.get_by_role('heading')).to_have_text('第二题')
        p.locator('#leave').click()
    assert not unexpected_choosers
    print('PASS Chromium restart, removed original files, old bookmark retained, zero file pickers',flush=True)
    card(p,'单页').locator('.card-main').click()
    p.click('#full')
    expect(p.locator("#full")).to_have_attribute("aria-pressed","true")
    assert p.evaluate("document.fullscreenElement?.id") == "reader-content"
    assert p.locator('#leave').evaluate('b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}')
    p.click('#full')
    expect(p.locator('#full')).to_have_attribute('aria-pressed','false')
    assert p.evaluate('!document.fullscreenElement')
    p.evaluate("() => {document.getElementById('reader-content').requestFullscreen=async()=>{throw new TypeError('Denied')};}")
    p.set_viewport_size({'width':375,'height':812})
    p.click('#full')
    expect(p.locator('#reader')).to_have_class('maximized')
    p.click('#leave')
    expect(p.locator('#reader')).to_be_hidden()
    assert p.locator('#status').inner_text() == ''
    print('PASS native fullscreen target, visible controls and restricted-browser fallback',flush=True)

    replacement = tmp / 'new.html'
    replacement.write_text('<h1>新题库内容</h1>', encoding='utf-8')
    card(p,'单页').get_by_text('更新副本').click()
    choose(p,'file',replacement)
    p.evaluate("""() => {window.realPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value,...args) {
        if(Array.isArray(value.account)) throw new DOMException('Insufficient storage','QuotaExceededError');
        return window.realPut.call(this,value,...args);
      };}""")
    p.click('#submit')
    expect(p.locator('#form-status')).to_contain_text('空间不足')
    p.click('#cancel')
    card(p,'单页').locator('.card-main').click()
    expect(p.frame_locator('#frame iframe').get_by_role('heading')).to_have_text('独立练习')
    p.click('#leave')
    p.evaluate('() => { IDBObjectStore.prototype.put=window.realPut; }')
    card(p,'单页').get_by_text('更新副本').click()
    choose(p,'file',replacement)
    p.click('#submit')
    expect(p.frame_locator('#frame iframe').get_by_role('heading')).to_have_text('新题库内容')
    p.click('#leave')
    p.reload()
    card(p,'单页').locator('.card-main').click()
    expect(p.frame_locator('#frame iframe').get_by_role('heading')).to_have_text('新题库内容')
    p.click('#leave')
    # Same machine and browser with a different signed-in user.
    login(pw, ctx, args.calendar, 'check_bob')
    p.reload()
    expect(p.locator('#who')).to_have_text('check_bob')
    expect(p.locator('.card')).to_have_count(0)
    login(pw, ctx, args.calendar, alice)
    p.reload()
    expect(p.locator('.card')).to_have_count(count)
    other = browser_profile(pw,args,tmp/'second-profile',posts)
    login(pw,other,args.calendar,alice)
    q = other.pages[0]
    q.goto(PAGE)
    card(q,'旧题库').locator('.card-main').click()
    expect(q.locator('#drawer-title')).to_have_text('关联本机文件')
    assert not saved_rows(q)
    q.click('#cancel')
    q.on('dialog',lambda d: d.accept())
    card(q,'旧题库').get_by_text('移除').click()
    expect(card(q,'旧题库')).to_have_count(0)
    other.close()
    p.reload()
    expect(p.locator('.card')).to_have_count(count-1)
    expect(card(p,'旧题库')).to_have_count(0)
    assert all(k[1] != old_id for k in saved_rows(p))
    item = card(p,'压缩课程')
    sid=item.get_attribute('id').removeprefix('site-')
    p.on('dialog',lambda d: d.accept())
    item.get_by_text('移除').click()
    expect(item).to_have_count(0)
    assert all(k[1] != sid for k in saved_rows(p))
    allow = {'accountId','id','name','kind','entry','url','revision','device','state'}
    assert posts and all(set(payload) <= allow for payload in posts)
    print('PASS quota rollback, refreshed copy, account/profile isolation, local and remote removal, metadata-only writes',flush=True)
    ctx.close()



def verify_live_access(pw, args, tmp):
    ctx = browser_profile(pw,args,tmp/'native-profile',[])
    login(pw,ctx,args.calendar,'check_alice')
    ctx.add_init_script("""FileSystemHandle.prototype.queryPermission=async()=>localStorage.getItem('perm')||'granted';
      FileSystemHandle.prototype.requestPermission=async()=>{localStorage.setItem('promptCount',String(1+Number(localStorage.promptCount||0)));
        localStorage.setItem('perm','granted');return 'granted';};""")
    p=ctx.pages[0]
    p.goto(PAGE)
    expect(p.locator('#who')).to_have_text('check_alice')
    p.evaluate("""async () => {const root=await navigator.storage.getDirectory();
      window.sourceHandle=await root.getFileHandle('live.html',{create:true});
      window.writeOriginal=async(text)=>{const w=await sourceHandle.createWritable();await w.write('<h1>'+text+'</h1>');await w.close();};
      await writeOriginal('首次保存');window.showOpenFilePicker=async()=>[sourceHandle];}""")
    p.click('#add')
    p.click('#pick-file')
    expect(p.locator('#chosen')).to_contain_text('live.html')
    p.fill('#name','实时题库')
    p.check('#remember')
    p.click('#submit')
    frame=p.frame_locator('#frame iframe')
    expect(frame.get_by_role('heading')).to_have_text('首次保存')
    expect(p.locator('#copy-badge')).to_be_hidden()
    p.click('#leave')
    site=card(p,'实时题库')
    p.evaluate("writeOriginal('原文件已更新')")
    site.locator('.card-main').click()
    expect(frame.get_by_role('heading')).to_have_text('原文件已更新')
    p.click('#leave')
    p.evaluate("localStorage.setItem('perm','prompt')")
    site.locator('.card-main').click()
    expect(frame.get_by_role('heading')).to_have_text('首次保存')
    expect(p.locator('#copy-badge')).to_be_visible()
    assert p.evaluate("Number(localStorage.promptCount||0)") == 0
    p.click('#leave')
    for _ in range(2):
        p.evaluate("async()=>{const m=await import('./permissions.mjs?v=2.4.4.2');await m.audit()}")
    def notices():
        return p.evaluate("""async()=>((await (await fetch('/api/hub/notifications?scope=all')).json()).items||[])
            .filter(x=>x.type==='site_permission' && x.body.includes('实时题库'))""")
    assert len(notices())==1
    p.goto(ORIGIN+urlsplit(notices()[0]['action_url']).path+'?site='+site.get_attribute('id').removeprefix('site-'))
    site.get_by_text('重新授权').click()
    expect(frame.get_by_role('heading')).to_have_text('原文件已更新')
    expect(p.locator('#copy-badge')).to_be_hidden()
    p.click('#leave')
    assert not notices() and p.evaluate("Number(localStorage.promptCount)") == 1
    print('PASS live original preferred, expired access uses copy without a prompt, one notification, explicit regrant reads latest original',flush=True)
    ctx.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser', help='Chromium executable')
    parser.add_argument('--tools', default='http://127.0.0.1:18442')
    parser.add_argument('--calendar', default='http://127.0.0.1:18441')
    parser.add_argument('--course', type=Path, help='Optional ECE 470 ZIP')
    args = parser.parse_args()
    if any(urlsplit(url).hostname not in ['127.0.0.1','localhost'] for url in (args.calendar,args.tools)):
        parser.error('Use loopback fixtures')
    with TemporaryDirectory() as tmp, sync_playwright() as pw:
        run(pw,args,Path(tmp))
        verify_live_access(pw,args,Path(tmp))
