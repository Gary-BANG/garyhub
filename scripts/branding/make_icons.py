#!/usr/bin/env python3
"""Draw the GaryHub site icons (planet and ring on deep space) without third-party packages.

Writes favicon.svg, icons/icon-192.png, icons/icon-512.png and icons/apple-touch-icon.png into both
services' public folders. Run from the repository root: python scripts/branding/make_icons.py
The PNGs are plain RGBA, 3x3 supersampled; rerunning produces identical bytes.
"""
import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGETS = [ROOT/'lab-service/public', ROOT/'calendar-app/public']
SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="s" cx="50%" cy="20%" r="90%"><stop offset="0" stop-color="#16205a"/><stop offset="1" stop-color="#03050d"/></radialGradient><linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7aa7ff"/><stop offset="1" stop-color="#b48cff"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#s)"/><circle cx="32" cy="32" r="11.5" fill="url(#p)"/><ellipse cx="32" cy="32" rx="24" ry="8.6" fill="none" stroke="url(#p)" stroke-width="2.7" transform="rotate(-24 32 32)"/></svg>
'''


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def sample(x, y, rounded):
    """Colour and coverage at a point of the 64x64 design space."""
    if rounded:
        dx, dy = max(abs(x - 32) - 18, 0), max(abs(y - 32) - 18, 0)
        if dx * dx + dy * dy > 14 * 14:
            return None
    t = min(1.0, math.hypot(x - 32, y - 12.8) / 57.6)
    colour = lerp((0x16, 0x20, 0x5a), (0x03, 0x05, 0x0d), t)
    mark = lerp((0x7a, 0xa7, 0xff), (0xb4, 0x8c, 0xff), min(1.0, max(0.0, ((x - 8) + (y - 8)) / 96)))
    if (x - 32) ** 2 + (y - 32) ** 2 <= 11.5 ** 2:
        colour = mark
    # Ring: an ellipse outline rotated by -24 degrees, 2.7 wide.
    angle = math.radians(24)
    u = (x - 32) * math.cos(angle) - (y - 32) * math.sin(angle)
    v = (x - 32) * math.sin(angle) + (y - 32) * math.cos(angle)
    k = math.hypot(u / 24, v / 8.6)
    if k > 0:
        distance = abs(k - 1) / math.hypot(u / (24 * 24 * k), v / (8.6 * 8.6 * k))
        if distance <= 1.35:
            colour = mark
    return colour


def png(size, rounded):
    rows = []
    step = 64 / size
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            total, hits = [0.0, 0.0, 0.0], 0
            for sy in (1 / 6, 0.5, 5 / 6):
                for sx in (1 / 6, 0.5, 5 / 6):
                    colour = sample((px + sx) * step, (py + sy) * step, rounded)
                    if colour:
                        hits += 1
                        for i in range(3):
                            total[i] += colour[i]
            row += bytes([round(c / hits) for c in total] if hits else [0, 0, 0]) + bytes([round(255 * hits / 9)])
        rows.append(bytes(row))
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    # Home-screen icons are full-bleed squares (the platform rounds them); the two web icons keep rounded corners.
    images = {'icons/icon-192.png': png(192, True), 'icons/icon-512.png': png(512, True), 'icons/icon-maskable-512.png': png(512, False),
              'icons/apple-touch-icon.png': png(180, False)}
    for target in TARGETS:
        (target/'icons').mkdir(exist_ok=True)
        (target/'favicon.svg').write_bytes(SVG.encode())
        for name, data in images.items():
            (target/name).write_bytes(data)
    print({name: len(data) for name, data in images.items()})
