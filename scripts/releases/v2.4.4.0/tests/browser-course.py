"""Optional real-browser regression for the ECE 470 course ZIP supplied by its owner.

Run against a local Tools service, for example:
python browser-course.py course.zip --tools http://localhost:3000 --browser /path/to/chromium
The archive stays on the test machine. Playwright is a test-only dependency.
"""
import argparse
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--tools', default='http://localhost:3000')
    parser.add_argument('--browser', help='Optional Chromium executable')
    args = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.browser, headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 840})
        page.goto(args.tools.rstrip('/') + '/useful/site-navigator/')
        page.locator('#add').click()
        page.locator('#file').set_input_files(args.archive)
        expect(page.locator('#name')).to_have_value(re.compile('ECE 470'), timeout=15000)
        selected = page.locator('#entry').input_value()
        assert selected.endswith('study-site/dist/index.html')
        expect(page.locator('#remember')).not_to_be_checked()
        page.locator('#submit').click()
        frame = page.frame_locator('#frame iframe')
        frame.get_by_role('heading', name='机器人学研习室').wait_for(timeout=25000)
        frame.get_by_text('进入题库解析', exact=True).first.click()
        frame.locator('a[href^="#question/"]').first.click()
        figure = frame.locator('figure img').first
        expect(figure).to_be_visible()
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
        page.locator('#back-asset').click()
        page.locator('#leave').click()
        expect(page.locator('#sites .card')).to_have_count(0)
        page.set_viewport_size({'width': 375, 'height': 812})
        page.locator('#add').click()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        expect(page.locator('#submit')).to_be_visible()
        print(f'PASS {selected} | question image and formula | PDF page {target} | temporary mode | 375 px')
        browser.close()


if __name__ == '__main__':
    main()
