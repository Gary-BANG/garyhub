# Read-only Xray inventory for the next integration step

The source draft does not include live Xray configuration. Run these commands on the InterServer host only after you are ready to inspect the service. The Python snippet prints structure and counts, not client IDs, keys, destinations, passwords or full configuration. Review the output yourself before sharing it.

```bash
systemctl is-active xray
xray version | head -1
sudo python3 - <<'PY'
import json
from pathlib import Path
p = Path('/usr/local/etc/xray/config.json')
c = json.loads(p.read_text())
print('config_exists:', p.is_file())
print('api_configured:', bool(c.get('api')))
print('stats_configured:', bool(c.get('stats')))
for index, inbound in enumerate(c.get('inbounds', [])):
    stream = inbound.get('streamSettings') or {}
    settings = inbound.get('settings') or {}
    decryption = settings.get('decryption')
    ws = stream.get('wsSettings') or {}
    print('inbound:', index,
          'protocol=', inbound.get('protocol'),
          'port=', inbound.get('port'),
          'network=', stream.get('network'),
          'security=', stream.get('security'),
          'vless_encryption_enabled=', bool(decryption and decryption != 'none'),
          'ws_path_present=', bool(ws.get('path')),
          'ws_host_restricted=', bool(ws.get('host') or (ws.get('headers') or {}).get('Host')),
          'listen_is_loopback=', inbound.get('listen') in ('127.0.0.1', '::1'),
          'client_count=', len(settings.get('clients') or []))
PY
```

Do not send the complete `config.json`, `docker inspect` output, environment files, Xray UUIDs, TLS keys, Reality private keys, or subscription URLs. This inventory alone cannot prove that adding and removing users works; that behavior needs a separate isolated acceptance check before deployment.

If `security` is empty and `vless_encryption_enabled` is false while the inbound is reachable from the public network, pause customer provisioning until a transport-security design is verified. A WebSocket path alone is not transport encryption.
