"""Cut a row of poses from a generated sheet into WebP frames for a 'frames' companion character.

Each figure is split at the transparent gaps between poses, optionally mirrored, scaled into the
character's units (one output pixel per unit) and placed so its feet land on the character's
feet point. An optional ground shadow is drawn under each pose. The script prints the
[x, y, w, h] rect for each frame, ready for characters.js.

Example (Lili, sheet drawn facing the other way):
  python -I scripts/companion/place_frames.py sheet.webp calendar-app/public/companion/characters/lili \
    touchdown squash rise --mirror --scale .94 --feet 302.5 608 \
    --shadow 256 616 92 10 --shadow-opacity .2 .24 .2
"""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

SOLID = 128  # alpha above which a pixel counts as part of the figure


def figures(sheet, min_width=40):
    """Split the sheet into figures at fully transparent columns."""
    alpha = sheet.getchannel('A')
    columns = alpha.point(lambda a: 255 if a > SOLID else 0).resize((sheet.width, 1), Image.BOX)
    runs, start = [], None
    for x in range(sheet.width + 1):
        on = x < sheet.width and columns.getpixel((x, 0)) > 0
        if on and start is None: start = x
        if not on and start is not None:
            if x - start >= min_width: runs.append((start, x))
            start = None
    found = []
    for a, z in runs:
        figure = sheet.crop((a, 0, z, sheet.height))
        # Generated sheets carry faint specks; keep only the pose's own box and drop near-clear pixels.
        left, top, right, bottom = figure.getchannel('A').point(lambda v: 255 if v > SOLID else 0).getbbox()
        figure = figure.crop((max(0, left - 4), max(0, top - 4), min(figure.width, right + 4), min(figure.height, bottom + 4)))
        figure.putalpha(figure.getchannel('A').point(lambda v: 0 if v < 8 else v))
        found.append(figure)
    return found


def feet_of(figure, band=12):
    """Bottom edge and the horizontal centre of the lowest `band` rows."""
    mask = figure.getchannel('A').point(lambda a: 255 if a > SOLID else 0)
    left, top, right, bottom = mask.getbbox()
    row = mask.crop((0, bottom - band, figure.width, bottom)).getbbox()
    return (row[0] + row[2]) / 2, bottom


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('sheet', type=Path)
    p.add_argument('out', type=Path)
    p.add_argument('names', nargs='+')
    p.add_argument('--mirror', action='store_true', help='flip every pose horizontally')
    p.add_argument('--scale', type=float, default=1.0, help='character units per sheet pixel')
    p.add_argument('--feet', type=float, nargs=2, required=True, metavar=('X', 'Y'))
    p.add_argument('--shadow', type=float, nargs=4, metavar=('CX', 'CY', 'RX', 'RY'))
    p.add_argument('--shadow-color', default='#202c46')
    p.add_argument('--shadow-opacity', type=float, nargs='+', default=[.2])
    p.add_argument('--quality', type=int, default=90)
    args = p.parse_args()

    found = figures(Image.open(args.sheet).convert('RGBA'))
    if len(found) != len(args.names):
        raise SystemExit(f'found {len(found)} figures, expected {len(args.names)}')
    for i, (name, figure) in enumerate(zip(args.names, found)):
        if args.mirror: figure = ImageOps.mirror(figure)
        size = (round(figure.width * args.scale), round(figure.height * args.scale))
        # Resample with premultiplied alpha so edges do not pick up dark fringes.
        figure = figure.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')
        fx, fy = feet_of(figure)
        ox, oy = round(args.feet[0] - fx), round(args.feet[1] - fy)
        x0, y0, x1, y1 = ox, oy, ox + figure.width, oy + figure.height
        if args.shadow:
            cx, cy, rx, ry = args.shadow
            x0, y0, x1, y1 = min(x0, int(cx - rx) - 2), min(y0, int(cy - ry) - 2), max(x1, int(cx + rx) + 2), max(y1, int(cy + ry) + 2)
        frame = Image.new('RGBA', (x1 - x0, y1 - y0))
        if args.shadow:
            opacity = args.shadow_opacity[min(i, len(args.shadow_opacity) - 1)]
            layer = Image.new('RGBA', frame.size)
            ImageDraw.Draw(layer).ellipse((cx - rx - x0, cy - ry - y0, cx + rx - x0, cy + ry - y0), fill=args.shadow_color)
            layer.putalpha(layer.getchannel('A').point(lambda a: round(a * opacity)))
            frame.alpha_composite(layer)
        frame.alpha_composite(figure, (ox - x0, oy - y0))
        left, top, right, bottom = frame.getchannel('A').getbbox()
        frame = frame.crop((left, top, right, bottom))
        args.out.mkdir(parents=True, exist_ok=True)
        frame.save(args.out / f'{name}.webp', quality=args.quality, alpha_quality=100, method=6)
        print(f"{name}:[{x0 + left}, {y0 + top}, {frame.width}, {frame.height}]")


if __name__ == '__main__':
    main()
