#!/usr/bin/env python3
"""Generate private candidate files for the GaryHub WSS migration; never deploy them."""

import argparse
import ipaddress
import json
import os
import secrets
import subprocess
import uuid
from pathlib import Path


def bridge_gateway(container, network):
    result = subprocess.run(
        ['docker', 'inspect', container, '--format', '{{json .NetworkSettings.Networks}}'],
        capture_output=True, text=True, check=True,
    )
    networks = json.loads(result.stdout)
    gateway = networks.get(network, {}).get('Gateway')
    if not gateway:
        raise ValueError(f'No gateway for {network} on {container}')
    if not ipaddress.ip_address(gateway).is_private:
        raise ValueError('Refusing a nonprivate Docker gateway')
    return gateway


def prepare(xray_config, caddyfile, out, host, gateway, port):
    if out.exists():
        raise FileExistsError(f'Output directory already exists: {out}')
    original = json.loads(xray_config.read_text())
    caddy = caddyfile.read_text()
    inbounds = original.get('inbounds')
    if not isinstance(inbounds, list) or not inbounds:
        raise ValueError('Expected a nonempty Xray inbounds array')
    if any(str(item.get('port')) == str(port) for item in inbounds):
        raise ValueError(f'Xray port {port} already exists')
    if any(item.get('tag') == 'garyhub-access-wss' for item in inbounds):
        raise ValueError('Access inbound tag already exists')
    if host in caddy:
        raise ValueError(f'Caddyfile already mentions {host}; inspect manually')
    client_id = str(uuid.uuid4())
    ws_path = '/access-' + secrets.token_hex(16)
    inbounds.append({
        'tag': 'garyhub-access-wss',
        'listen': gateway,
        'port': port,
        'protocol': 'vless',
        'settings': {
            'clients': [{'id': client_id, 'email': 'garyhub-migration-test'}],
            'decryption': 'none',
        },
        'streamSettings': {'network': 'ws', 'security': 'none', 'wsSettings': {'path': ws_path}},
    })
    # Caddy terminates TLS. Xray's unencrypted WS listener is reachable on the
    # host's Docker bridge only; verify the public firewall before deploying.
    site = f'''\n\n{host} {{
    @access path {ws_path}
    route {{
        reverse_proxy @access {gateway}:{port}
        respond 404
    }}
}}
'''
    out.mkdir(mode=0o700)
    try:
        for name, content in (
            ('xray-candidate.json', json.dumps(original, ensure_ascii=False, indent=2) + '\n'),
            ('Caddyfile-candidate', caddy.rstrip() + site),
            ('private-test-profile.txt',
             f'Host: {host}\nPort: 443\nProtocol: VLESS\nTransport: WebSocket\nTLS: on\n'
             f'UUID: {client_id}\nWebSocket path: {ws_path}\n'
             'Keep this file private. Candidate files are not deployed.\n'),
        ):
            path = out / name
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, 'w') as file:
                file.write(content)
    except Exception:
        # Keep candidate secrets private even on an interrupted preparation.
        raise
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--xray', type=Path, default=Path('/usr/local/etc/xray/config.json'))
    parser.add_argument('--caddyfile', type=Path, default=Path('/opt/my-services/caddy/Caddyfile'))
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--host', default='vpn.garyhub.uk')
    parser.add_argument('--network', default='my-services_default')
    parser.add_argument('--container', default='caddy')
    parser.add_argument('--port', type=int, default=18080)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('port must be between 1024 and 65535')
    gateway = bridge_gateway(args.container, args.network)
    out = prepare(args.xray, args.caddyfile, args.out, args.host, gateway, args.port)
    print('Candidate files written privately to:', out)
    print('No live configuration was changed. Do not upload this directory or paste its contents into chat.')
    print('Validate Xray candidate: xray run -test -config=' + str(out / 'xray-candidate.json'))


if __name__ == '__main__':
    main()
