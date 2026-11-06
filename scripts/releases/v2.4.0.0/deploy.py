"""Run shared verification, retained host checks, and the stocks access gate."""
from pathlib import Path
import importlib.util
import sys

root = Path(__file__).resolve().parent
source = root/'prior_checks.py'
if not source.exists():
    source = root.parent/'v2.3.2.3'/'deploy.py'
# Execute the reviewed checks in this release context (config and runtime are siblings).
context = {'__name__': 'retained_checks', '__file__': str(root/'prior_checks.py')}
exec(compile(source.read_bytes(), str(source), 'exec'), context)
d = context['d']
def verify():
    context['verify']()
    status = context['status']
    for endpoint in ['/stocks/', '/api/stocks/groups', '/api/stocks/quote?symbol=sz300033']:
        if status('calendar.garyhub.uk', endpoint) != b'401':
            raise RuntimeError('Missing stock login gate: '+endpoint)
d.verify_https = verify
if __name__ == '__main__':
    try:
        d.main()
    except Exception as error:
        d.say('STOPPED: '+str(error))
        sys.exit(1)
