"""Build v2.4.4.1 with the shared, strict upgrade packager."""
import argparse
import sys
from pathlib import Path

VERSION = '2.4.4.1'
BASE = '1aa5eca38991db74cc8c648b8e44386eb785858f'
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'scripts/updater'))
from build_overlay import build

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output')
    build(ROOT, HERE, parser.parse_args().output)
