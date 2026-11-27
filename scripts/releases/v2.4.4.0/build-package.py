"""Build the registered personal site navigator release using the shared overlay updater."""
import argparse
import sys
from pathlib import Path

VERSION = '2.4.4.0'
BASE = '46039938205395492a7dcd212025ecc6760ced01'
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'scripts/updater'))
from build_overlay import build

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('output')
    build(ROOT, HERE, parser.parse_args().output)
