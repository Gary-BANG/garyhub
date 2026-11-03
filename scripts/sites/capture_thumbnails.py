#!/usr/bin/env python3
"""Refresh the Elsewhere page previews: screenshot each linked site with headless
Edge/Chrome and store a 640x400 WebP under lab-service/public/sites/thumbs/.

The site list is read from lab-service/public/sites/index.html (href + data-thumb),
so adding a link there and rerunning this script is all a new entry needs.
Requires Pillow and a local Edge or Chrome. Run on the maintainer's machine; the
server never fetches these sites.
"""
import argparse, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / 'lab-service/public/sites/index.html'
THUMBS = ROOT / 'lab-service/public/sites/thumbs'
BROWSERS = [r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
            r'C:\Program Files\Google\Chrome\Application\chrome.exe', 'microsoft-edge', 'google-chrome', 'chromium']


def sites():
    html = PAGE.read_text(encoding='utf-8')
    found = re.findall(r'<a class="site" href="(https://[^"]+)" data-thumb="/thumbs/([a-z0-9-]+)\.webp(?:\?v=[\d.]+)?"', html)
    if not found:
        raise SystemExit('No site links found in ' + str(PAGE))
    return found


def browser():
    for candidate in BROWSERS:
        path = candidate if os.path.isabs(candidate) else shutil.which(candidate)
        if path and Path(path).is_file():
            return path
    raise SystemExit('Edge or Chrome was not found.')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--only', help='capture a single thumbnail name, e.g. ece470')
    args = parser.parse_args()
    from PIL import Image
    exe = browser()
    THUMBS.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        for url, name in sites():
            if args.only and name != args.only:
                continue
            shot = Path(work) / (name + '.png')
            subprocess.run([exe, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--mute-audio',
                            '--user-data-dir=' + str(Path(work) / ('profile-' + name)), '--window-size=1440,900',
                            '--virtual-time-budget=8000', '--screenshot=' + str(shot), url],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
            with Image.open(shot) as image:
                image = image.convert('RGB').resize((640, 400), Image.LANCZOS)
                target = THUMBS / (name + '.webp')
                image.save(target, 'WEBP', quality=80, method=6)
            print(f'{name}: {url} -> {target.relative_to(ROOT).as_posix()} ({target.stat().st_size} bytes)')


if __name__ == '__main__':
    sys.exit(main())
