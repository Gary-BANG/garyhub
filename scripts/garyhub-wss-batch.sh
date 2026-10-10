#!/usr/bin/env bash
set -eu
umask 077
if [ "${1:-}" != "--worker" ]; then
  nohup bash "$0" --worker > /root/garyhub-wss-batch.log 2>&1 < /dev/null &
  task_pid=$!
  tail --pid="$task_pid" -n +1 -f /root/garyhub-wss-batch.log
  wait "$task_pid"
  exit 0
fi
python3 -u - <<'PY'
import base64, fcntl, ipaddress, json, os, secrets, shutil, socket
import subprocess, sys, time, uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

os.umask(0o077)
lock = open('/root/garyhub-wss-batch.lock', 'a')
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit('Another installation is running. Check /root/garyhub-wss-batch.log')
host, port, tag = 'vpn.garyhub.uk', 18080, 'garyhub-access-wss'
xfile = Path('/usr/local/etc/xray/config.json')
cfile = Path('/opt/my-services/caddy/Caddyfile')
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(3)
work = Path('/root/garyhub-wss-' + stamp)
work.mkdir(mode=0o700)
container_candidate = '/etc/caddy/.garyhub-candidate-' + stamp
log = open(work / 'private-validation.log', 'w')
touched = False

def command(args, timeout=40):
    result = subprocess.run(args, capture_output=True, timeout=timeout)
    if result.returncode:
        log.write('FAILED: ' + repr(args) + '\n')
        log.write(result.stdout.decode(errors='replace'))
        log.write(result.stderr.decode(errors='replace'))
        log.flush()
        raise RuntimeError('Command failed: ' + args[0])
    return result.stdout

def put(path, data):
    # Preserve inode, mode and owner: Caddy uses a single-file bind mount.
    with open(path, 'wb') as target:
        target.write(data)
        target.flush()
        os.fsync(target.fileno())

def reload_caddy():
    command(['docker', 'exec', 'caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])

try:
    print('[1/6] Checking service, paths, DNS and private network...', flush=True)
    for name in ['docker', 'xray', 'systemctl', 'curl']:
        if not shutil.which(name):
            raise RuntimeError('Required command missing: ' + name)
    command(['systemctl', 'is-active', '--quiet', 'xray'])
    pid = command(['systemctl', 'show', 'xray', '-p', 'MainPID', '--value']).decode().strip()
    args = Path('/proc/' + pid + '/cmdline').read_bytes().decode().split('\0')
    configs = []
    for index, arg in enumerate(args):
        if arg in ['-config', '--config', '-c']:
            configs.append(args[index + 1])
        elif arg.startswith(('-config=', '--config=', '-c=')):
            configs.append(arg.split('=', 1)[1])
        if 'confdir' in arg:
            raise RuntimeError('Multiple-config service requires manual review')
    if len(configs) != 1 or Path(configs[0]).resolve() != xfile.resolve():
        raise RuntimeError('Running Xray config path does not match the expected file')
    socket.getaddrinfo(host, 443, socket.AF_INET)
    networks = json.loads(command(['docker', 'inspect', 'caddy', '--format', '{{json .NetworkSettings.Networks}}']))
    gateway = networks['my-services_default']['Gateway']
    address = ipaddress.ip_address(gateway)
    if address.version != 4 or not address.is_private or address.is_loopback or address.is_unspecified:
        raise RuntimeError('Unexpected bridge gateway')
    with socket.socket() as probe:
        probe.bind((gateway, port))
    old_x, old_c = xfile.read_bytes(), cfile.read_bytes()
    if command(['docker', 'exec', 'caddy', 'cat', '/etc/caddy/Caddyfile']) != old_c:
        raise RuntimeError('Host/container Caddyfile mismatch')
    config = json.loads(old_x)
    if not isinstance(config.get('inbounds'), list) or not config['inbounds']:
        raise RuntimeError('Unexpected Xray configuration')
    if any(i.get('tag') == tag or str(i.get('port')) == str(port) for i in config['inbounds']):
        raise RuntimeError('New inbound already exists; refusing duplicate installation')
    if host.encode() in old_c:
        raise RuntimeError('Hostname already exists in Caddyfile; inspect before changing')

    print('[2/6] Saving private backups and preparing new test credentials...', flush=True)
    (work / 'xray-original.json').write_bytes(old_x)
    (work / 'Caddyfile-original').write_bytes(old_c)
    client = str(uuid.uuid4())
    ws_path = '/access-' + secrets.token_hex(16)
    config['inbounds'].append({'tag': tag, 'listen': gateway, 'port': port, 'protocol': 'vless',
        'settings': {'clients': [{'id': client, 'email': 'garyhub-migration-test'}], 'decryption': 'none'},
        'streamSettings': {'network': 'ws', 'security': 'none', 'wsSettings': {'path': ws_path}}})
    new_x = (json.dumps(config, ensure_ascii=False, indent=2) + '\n').encode()
    block = f'''\n\n{host} {{
    @access path {ws_path}
    route {{
        reverse_proxy @access {gateway}:{port}
        respond 404
    }}
}}
'''
    new_c = old_c.rstrip() + block.encode()
    (work / 'xray-candidate.json').write_bytes(new_x)
    (work / 'Caddyfile-candidate').write_bytes(new_c)
    query = urlencode({'encryption': 'none', 'security': 'tls', 'sni': host,
                       'type': 'ws', 'host': host, 'path': ws_path})
    (work / 'PRIVATE-v2rayN-test.txt').write_text(f'vless://{client}@{host}:443?{query}#GaryHub-WSS-test\n')

    print('[3/6] Validating both candidate configurations...', flush=True)
    command(['xray', 'run', '-test', '-config=' + str(work / 'xray-candidate.json')])
    command(['docker', 'cp', str(work / 'Caddyfile-candidate'), 'caddy:' + container_candidate])
    command(['docker', 'exec', 'caddy', 'caddy', 'validate', '--config', container_candidate, '--adapter', 'caddyfile'])
    if xfile.read_bytes() != old_x or cfile.read_bytes() != old_c:
        raise RuntimeError('Configuration changed during preparation; refusing overwrite')

    print('[4/6] Applying configuration; Xray connections may briefly reconnect...', flush=True)
    touched = True
    put(xfile, new_x)
    command(['systemctl', 'restart', 'xray'])
    command(['systemctl', 'is-active', '--quiet', 'xray'])
    put(cfile, new_c)
    if command(['docker', 'exec', 'caddy', 'cat', '/etc/caddy/Caddyfile']) != new_c:
        raise RuntimeError('Caddy bind mount did not see the updated file')
    reload_caddy()

    print('[5/6] Waiting for certificate and checking TLS/WebSocket (up to 90 seconds)...', flush=True)
    verified = False
    for attempt in range(18):
        key = base64.b64encode(secrets.token_bytes(16)).decode()
        result = subprocess.run(['curl', '--noproxy', '*', '--http1.1', '-sS', '--max-time', '3',
            '--resolve', host + ':443:127.0.0.1', '-D', '-', '-o', '/dev/null',
            '-H', 'Connection: Upgrade', '-H', 'Upgrade: websocket',
            '-H', 'Sec-WebSocket-Version: 13', '-H', 'Sec-WebSocket-Key: ' + key,
            'https://' + host + ws_path], capture_output=True, timeout=6)
        if b'HTTP/1.1 101 ' in result.stdout:
            verified = True
            break
        time.sleep(2)
    if not verified:
        raise RuntimeError('TLS/WebSocket verification did not succeed')
    command(['systemctl', 'is-active', '--quiet', 'xray'])
    (work / 'SUCCESS').write_text('TLS and WebSocket passed; full client traffic remains to be tested.\n')
    Path('/root/garyhub-wss-result.json').write_text(json.dumps({'directory': str(work), 'status': 'tls-ws-ready'}))
    print('[6/6] DONE: TLS certificate and WebSocket handshake passed.', flush=True)
    print('Original port 8080 is preserved. Full VPN traffic and external port isolation still need testing.')
    print('Private v2rayN test link: ' + str(work / 'PRIVATE-v2rayN-test.txt'))
    print('Backups and private logs: ' + str(work))
except BaseException as error:
    print('FAILED:', type(error).__name__, str(error), flush=True)
    if touched:
        print('Restoring both original configurations...', flush=True)
        failures = []
        for label, operation in [
            ('Xray restore', lambda: put(xfile, old_x)),
            ('Caddy restore', lambda: put(cfile, old_c)),
            ('Xray restart', lambda: command(['systemctl', 'restart', 'xray'])),
            ('Caddy reload', reload_caddy),
            ('Xray health', lambda: command(['systemctl', 'is-active', '--quiet', 'xray']))]:
            try:
                operation()
            except BaseException:
                failures.append(label)
        print('ROLLBACK: ' + ('completed' if not failures else 'NEEDS ATTENTION: ' + ', '.join(failures)))
    else:
        print('Stopped before changing live configuration.')
    print('Private logs/backups: ' + str(work))
    sys.exit(1)
finally:
    if shutil.which('docker'):
        subprocess.run(['docker', 'exec', 'caddy', 'rm', '-f', container_candidate], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log.close()
PY
