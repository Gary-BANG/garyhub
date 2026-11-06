"""Run with Playwright and STUDY_CHROMIUM pointing at a Chromium executable."""
import json
import mimetypes
import os
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[4]
PUBLIC = ROOT / 'lab-service/public'
fixture = json.loads(subprocess.check_output(['node', '-e',
    "console.log(JSON.stringify(require('./scripts/releases/v1.4.3.1/tests/study-fixture.cjs').fixture()))"], cwd=ROOT))
markdown = fixture['courses'][0]['lectures'][0]['content']
fixture['courses'][0]['lectures'][0]['content'] = markdown + '\n\n' + '\n\n'.join(
    f'## Unit {i}\n\n' + ('Paragraph. ' * 80) for i in range(18)) + '\n\n###### Deep\n\nVisible target.\n\n```\nraw\n```'
USER = {'id': 9, 'username': 'reader', 'role': 'user'}

def exercise(browser, width):
    from urllib.parse import urlsplit
    state = json.loads(json.dumps(fixture))
    context = browser.new_context(viewport={'width': width, 'height': 800},
                                  permissions=['clipboard-read', 'clipboard-write'])
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def serve(route):
        nonlocal state
        path = urlsplit(route.request.url).path
        if path == '/api/academic/state':
            if route.request.method == 'PUT':
                state = route.request.post_data_json['state']
                return route.fulfill(json={'revision': 2, 'updatedAt': '2026-11-05T12:00:00Z'})
            return route.fulfill(json={'state': state, 'user': USER, 'revision': 1})
        if path == '/api/academic/preferences':
            prefs = state['settings']
            if route.request.method == 'PUT':
                data = route.request.post_data_json
                prefs.update({k:data[k] for k in ['studyTheme', 'fontSize', 'headingSize']})
                return route.fulfill(json={'revision': 2})
            return route.fulfill(json={'revision': 1, 'accountId': USER['id'], 'fontSize':prefs['fontSize'],
                'studyTheme':prefs.get('studyTheme','auto'), 'headingSize':prefs.get('headingSize',32)})
        if path == '/personalize/':
            path = '/personalize/index.html'
        if path == '/api/academic/links':
            return route.fulfill(json={'links': []})
        if path == '/api/hub/me' or path == '/api/me':
            return route.fulfill(json={'user': USER})
        if path.startswith('/api/'):
            return route.fulfill(json={'token': 'test', 'items': []})
        if path == '/' or path == '/index.html':
            path = '/index.html'
        if path in ['/study/', '/grades/']:
            path = '/academic/index.html'
        file = PUBLIC / path.lstrip('/')
        if file.is_file():
            return route.fulfill(path=file, content_type=mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
        return route.fulfill(status=404, body='')
    context.route('**/*', serve)
    page.goto('https://tools.garyhub.uk/')
    page.get_by_role('link', name='个性化', exact=True).click()
    expect(page).to_have_url('https://tools.garyhub.uk/personalize/')
    expect(page.locator('dialog')).to_have_count(0)
    page.locator('#gh-language-switch').click()
    expect(page.locator('h1')).to_have_text('Personalization')
    page.locator('#gh-language-switch').click()
    form=page.locator('#preferences')
    for theme in ['dark','light','warm']:
        form.get_by_label('外观').select_option(theme)
        form.locator('[name=fontSize]').fill('21')
        form.locator('[name=headingSize]').fill('38')
        form.get_by_role('button',name='保存设置').click()
        expect(page.locator('#message')).to_have_text('设置已保存')
        expect(page.locator('html')).to_have_attribute('data-theme',theme)
    page.get_by_role('link',name='打开学习中心').click()
    expect(page.locator('#prose')).to_have_css('font-size', '21px')
    expect(page.locator('#prose h1').first).to_have_css('font-size', '38px')
    expect(page.locator('html')).to_have_attribute('data-theme', 'warm')
    assert state['settings']['studyTheme'] == 'warm'
    stats = page.locator('.study-stats .stat')
    assert stats.count() == 4 and stats.first.bounding_box()['height'] < 92
    assert float(stats.first.locator('strong span').evaluate('e=>getComputedStyle(e).fontSize').strip('px')) >= 28
    courses, toc = page.locator('[data-nav=courses]'), page.locator('[data-nav=outline]')
    courses.click()
    expect(page.locator('#courseSidebar')).to_be_hidden()
    toc.click()
    expect(page.locator('#outlinePanel')).to_be_visible()
    expect(page.locator('#courseList')).to_be_hidden()
    courses.click()
    expect(page.locator('#courseList')).to_be_visible()
    toc.click()
    assert not courses.inner_text().strip() and not toc.inner_text().strip()
    expect(page.locator('.outline-tools svg')).to_have_count(2)
    page.evaluate('scrollTo(0,0)')
    expect(page.locator('#readPercent')).to_have_text('0%')
    page.locator('#gh-language-switch').click()
    expect(page.locator('label[for=readMeter]')).to_have_text('Reading progress')
    expect(page.locator('#readHint')).to_have_text('Ready to read')
    expect(page.get_by_role('button',name='Collapse outline levels')).to_be_visible()
    page.evaluate('scrollTo(0,document.documentElement.scrollHeight/2)')
    page.wait_for_function('document.querySelector("#readMeter").value>0 && document.querySelector("#readMeter").value<100')
    expect(page.locator('#readHint')).to_have_text('Reading')
    page.evaluate('scrollTo(0,document.documentElement.scrollHeight)')
    expect(page.locator('#readPercent')).to_have_text('100%')
    expect(page.locator('#readHint')).to_contain_text('Finished.')
    page.evaluate('scrollTo(0,0)')
    page.locator('#gh-language-switch').click()
    expect(page.locator('label[for=readMeter]')).to_have_text('阅读进度')
    links = page.locator('.outline-tree a')
    assert links.count() == page.locator('#prose .note-heading').count()
    assert links.get_by_text('Nested', exact=True).count() == 2
    content = page.get_by_role('button', name='收起全部正文')
    page.get_by_role('button', name='收起目录层级').click()
    expect(links.get_by_text('Deep', exact=True)).to_be_hidden()
    expect(page.locator('#prose').get_by_text('Visible target.', exact=True)).to_be_visible()
    page.get_by_role('button', name='展开目录层级').click()
    content.click()
    assert page.locator('.note-section[open]').count() == 0
    expect(links.get_by_text('Deep', exact=True)).to_be_visible()
    links.get_by_text('Deep', exact=True).click()
    expect(page.locator('#prose').get_by_text('Visible target.', exact=True)).to_be_in_viewport()
    expect(page.locator('#prose h6')).to_be_in_viewport()
    expect(page.locator('#prose').get_by_text('Second repeated heading.', exact=True)).to_be_hidden()
    if width < 850:
        expect(page.locator('#courseSidebar')).to_be_hidden()
        toc.click()
    page.get_by_role('button', name='展开全部正文').click()
    links.get_by_text('Unit 12', exact=True).click()
    assert page.evaluate('scrollY') > 500
    for button in [courses, toc]:
        box = button.bounding_box()
        assert 0 <= box['y'] < 50, box
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    expect(page.locator('.code-bar span').first).to_have_text('python')
    expect(page.locator('.code-bar span').last).to_have_text('纯文本')
    page.locator('.code-bar button').first.click()
    assert page.evaluate('navigator.clipboard.readText()').strip() == '# not a heading\nprint(1)'
    assert page.evaluate('window.UNSAFE') is None
    if courses.get_attribute('aria-expanded') == 'false':
        courses.click()
    page.locator('[data-lecture=lecture-b]').click()
    toc.click()
    expect(page.locator('#tocItems')).to_have_text('这份讲义没有标题')
    page.locator('[data-view=grades]').click()
    expect(page.locator('.study-nav')).to_have_count(0)
    assert page.locator('html').get_attribute('data-theme') != 'warm'
    page.locator('#personalize').click()
    expect(page).to_have_url('https://tools.garyhub.uk/personalize/')
    page.goto('https://tools.garyhub.uk/study/?personalize=study')
    expect(page).to_have_url('https://tools.garyhub.uk/personalize/')
    assert not errors, errors
    print(f'PASS Chromium {width}px: standalone personalization, bilingual reading progress, icon controls, themes, persistence, type, cards, both sidebar modes, tree, content, sticky scroll, duplicate/deep headings, clipboard and empty lecture')
    context.close()

if __name__ == '__main__':
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('STUDY_CHROMIUM'), args=[
            '--no-sandbox', '--in-process-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--no-zygote'])
        for width in [1440, 390]:
            exercise(browser, width)
        browser.close()
