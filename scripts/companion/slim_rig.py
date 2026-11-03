"""Shrink a character rig SVG for the website companion.

Usage: python scripts/companion/slim_rig.py <source milu-rig.svg> <output rig.svg>

Rounds path and geometry numbers to one decimal place (the companion is shown
at roughly 100 CSS pixels, so 0.1 source units is far below a screen pixel),
drops the fixed width/height and authoring title, and refuses anything that
could execute or load external content.
"""
import hashlib
import re
import sys

UNSAFE = re.compile(r'<script|<foreignObject|<image|\son\w+\s*=|href="(?!#)', re.I)
NUMBER = re.compile(r'-?\d*\.\d+(?:e-?\d+)?')
GEOMETRY = re.compile(r'\s(d|x|y|cx|cy|rx|ry|r|width|height|stroke-width)="([^"]*)"')


def number(match):
    value = round(float(match.group(0)), 1)
    text = f'{value:.1f}'.rstrip('0').rstrip('.')
    return '0' if text in ('', '-0') else text.replace('0.', '.', 1) if text.startswith(('0.', '-0.')) else text


def slim(svg):
    if UNSAFE.search(svg):
        raise SystemExit('refusing: the SVG contains scripts, embedded documents or external references')
    svg = re.sub(r'<title>.*?</title>', '', svg, flags=re.S)
    svg = re.sub(r'<svg([^>]*?)\s(width|height)="[^"]*"', r'<svg\1', svg, count=2)
    svg = re.sub(r'\s(role|aria-label)="[^"]*"', '', svg, count=2)
    svg = GEOMETRY.sub(lambda m: f' {m.group(1)}="{NUMBER.sub(number, m.group(2))}"', svg)
    # Path data: drop spaces the parser does not need.
    svg = re.sub(r'\sd="([^"]*)"', lambda m: ' d="' + re.sub(r' (?=-)|(?<=[A-Za-z]) ', '', m.group(1)) + '"', svg)
    return re.sub(r'>\s+<', '><', svg).strip() + '\n'


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    source = open(sys.argv[1], encoding='utf-8').read()
    result = slim(source)
    with open(sys.argv[2], 'w', encoding='utf-8', newline='\n') as out:
        out.write(result)
    print(f'source sha256 {hashlib.sha256(source.encode()).hexdigest()}')
    print(f'{len(source.encode()) / 1024:.1f} KiB -> {len(result.encode()) / 1024:.1f} KiB')


if __name__ == '__main__':
    main()
