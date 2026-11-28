"""Browser regression for local file and folder selection against a local, seeded GaryHub test instance."""
import argparse
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit
from playwright.sync_api import expect, sync_playwright


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', default='http://localhost:18442')
    parser.add_argument('--calendar', default='http://localhost:18441')
    parser.add_argument('--browser', help='Chromium executable, optional')
    args = parser.parse_args()
    assert all(urlsplit(url).hostname in ('127.0.0.1', 'localhost') for url in [args.tools, args.calendar])
    with TemporaryDirectory() as tmp, sync_playwright() as pw:
        root = Path(tmp)
        course = root / 'ECE_310_题库'
        lessons = course / '章节'
        lessons.mkdir(parents=True)
        no_html = root / '没有网页'
        no_html.mkdir()
        (no_html / '说明.txt').write_text('fixture', encoding='utf-8')
        single = root / '练习 01.HTM'
        single.write_text('<title>原网页标题</title><h1>单文件已打开</h1>', encoding='utf-8')
        (lessons/'index.html').write_text('<title>题库主页</title><h1>课程首页</h1><a href="第二题.html">下一题</a>', encoding='utf-8')
        (lessons/'第二题.html').write_text('<title>第二题</title><h1>第二题已打开</h1>', encoding='utf-8')

        browser = pw.chromium.launch(executable_path=args.browser, args=['--no-sandbox'])
        origin = 'https://tools.garyhub.uk'
        local_tools = args.tools.rstrip('/')
        auth = pw.request.new_context(base_url=args.calendar)
        csrf = auth.get('/api/csrf').json()['token']
        assert auth.post('/api/login', headers={'Origin':'https://tools.garyhub.uk','X-CSRF-Token':csrf},
                         data={'username':'check_alice','password':'Synthetic-Only-2026!'}).ok
        cookies=[{'name':c['name'],'value':c['value'],'url':origin} for c in auth.storage_state()['cookies']]
        def setup(scenario):
            context = browser.new_context()
            context.add_cookies(cookies)
            # Keep production browser-origin rules and route every HTTP request to the two local fixtures.
            def route_local(route):
                req = route.request
                if not req.url.startswith(origin + '/'):
                    route.abort()
                    return
                headers = {**req.all_headers(), 'host':'tools.garyhub.uk'}
                response = context.request.fetch(local_tools + req.url[len(origin):], method=req.method,
                                                 headers=headers, data=req.post_data_buffer, max_redirects=0)
                route.fulfill(response=response)
            context.route("https://**/*", route_local)
            if scenario == 'legacy':
                context.add_init_script('window.showOpenFilePicker=window.showDirectoryPicker=undefined')
            elif scenario == 'blocked':
                context.add_init_script("""window.showOpenFilePicker=async()=>{throw new DOMException('denied','NotAllowedError')};
                    window.showDirectoryPicker=async()=>{throw new DOMException('cancelled','AbortError')};""")
            elif scenario == 'late':
                context.add_init_script('window.showOpenFilePicker=()=>new Promise(resolve=>window.finishPicker=resolve)')
            page=context.new_page()
            page.goto(origin+'/useful/site-navigator/')
            expect(page.locator('#who')).to_have_text('check_alice')
            page.locator('#add').click()
            return context,page

        def standard_click(page, control, target):
            with page.expect_file_chooser() as chooser:
                page.locator(control).click()
            chooser.value.set_files(target)

        for kind, target, entry in [('file',single,single.name),('folder',course,'章节/index.html')]:
            ctx,p=setup('blocked')
            if kind == 'folder':
                p.set_viewport_size({'width':375,'height':812})
            p.locator('#name').fill('ECE_310_题库 '+kind)
            p.locator('#remember').check()
            expect(p.locator('#submit')).to_be_disabled()
            p.locator('#pick-'+kind).click()
            expect(p.locator('#'+kind)).to_be_visible()
            assert p.evaluate('document.documentElement.scrollWidth <= innerWidth')
            expect(p.locator('#form-status')).to_contain_text('普通选择')
            message=p.locator('#form-status').inner_text()
            p.locator('#name').press('Enter')
            expect(p.locator('#form-status')).to_have_text(message)
            expect(p.locator('#submit')).to_be_disabled()
            # Both recovery routes dispatch Chromium's real filechooser event.
            standard_click(p, '#file' if kind=='file' else '#pick-folder', target)
            expect(p.locator('#chosen')).to_contain_text(target.name)
            expect(p.locator('#entry')).to_have_value(entry)
            expect(p.locator('#name')).to_have_value('ECE_310_题库 '+kind)
            expect(p.locator('#storage-note')).to_contain_text('下次打开需要重新选择')
            expect(p.locator('#submit')).to_be_enabled()
            p.locator('#submit').click()
            frame=p.frame_locator('#frame iframe')
            if kind=='folder':
                frame.get_by_text('下一题',exact=True).click()
                expect(frame.get_by_role('heading')).to_have_text('第二题已打开')
            else:
                expect(frame.get_by_role('heading')).to_have_text('单文件已打开')
            p.locator('#leave').click()
            expect(p.locator('#sites').get_by_text('ECE_310_题库 '+kind,exact=True)).to_be_visible()
            p.reload()
            p.locator('#sites').get_by_text('ECE_310_题库 '+kind,exact=True).click()
            expect(p.locator('#drawer-title')).to_have_text('关联本机文件')
            ctx.close()
            print('PASS',kind,'native exception, actionable fallback, real selection, saved name, open and relink')

        ctx,p=setup('legacy')
        standard_click(p,'#pick-folder',no_html)
        expect(p.locator('#form-status')).to_contain_text('未找到 HTML 入口')
        expect(p.locator('#submit')).to_be_disabled()
        standard_click(p,'#pick-file',single)
        expect(p.locator('#name')).to_have_value('原网页标题')
        p.locator('#file').dispatch_event('cancel')
        expect(p.locator('#form-status')).to_contain_text('保留')
        expect(p.locator('#entry')).to_have_value(single.name)
        standard_click(p,'#pick-folder',no_html)
        expect(p.locator('#form-status')).to_contain_text('未找到 HTML 入口')
        expect(p.locator('#entry')).to_have_value(single.name)
        expect(p.locator('#submit')).to_be_enabled()
        standard_click(p,'#pick-folder',course)
        expect(p.locator('#entry')).to_have_value('章节/index.html')
        expect(p.locator('#name')).to_have_value('题库主页')
        p.locator('#entry').select_option('章节/第二题.html')
        expect(p.locator('#name')).to_have_value('第二题')
        p.locator('#submit').click()
        expect(p.frame_locator('#frame iframe').get_by_role('heading')).to_have_text('第二题已打开')
        ctx.close()
        print('PASS unsupported native API, Chinese names, nested entries, useful error, previous choice, temporary open')

        ctx,p=setup('late')
        p.locator('#pick-file').click()
        expect(p.locator('#file')).to_be_visible()
        standard_click(p,'#file',single)
        expect(p.locator('#entry')).to_have_value(single.name)
        p.evaluate("""async()=>{const dir=await navigator.storage.getDirectory();
            const h=await dir.getFileHandle('obsolete.html',{create:true});
            window.finishPicker([h])}""")
        p.wait_for_timeout(100)
        expect(p.locator('#entry')).to_have_value(single.name)
        p.locator('#tab-url').click()
        expect(p.locator('#submit')).to_be_enabled()
        p.locator('#tab-local').click()
        expect(p.locator('#entry')).to_have_value(single.name)
        ctx.close()
        browser.close()
        print('PASS late picker cannot replace current selection; tab switching preserves valid entry')


if __name__=='__main__':
    run()
