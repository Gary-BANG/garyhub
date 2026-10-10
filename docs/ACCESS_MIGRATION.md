# Access migration plan (not executed)

## Confirmed state on 2026-10-10

- Xray 26.2.6 runs as a host systemd service. One VLESS/WebSocket client listens on TCP 8080.
- `streamSettings.security` is unset and VLESS Encryption is disabled. The listener is not loopback.
- A test from a separate Windows machine returned `TcpTestSucceeded=True` for `garyhub.uk:8080`. The deployment record says this port does not pass through Caddy. Treat this path as lacking transport encryption; do not issue it to customers.

## Cutover order

1. Save a restricted backup of the Xray config and document the existing client's connection settings privately. Never put either in Git or a support transcript.
2. Confirm a new DNS name, HTTPS certificate path, Caddy container network, and a private route from Caddy to a separate Xray WebSocket backend. Do not bind the replacement backend to an unfiltered public interface.
3. Validate the new Xray configuration with `xray run -test -config=/path/to/candidate.json` and validate the Caddy candidate. Test a separate temporary client from outside the host, including the WebSocket upgrade and WSS certificate.
4. Migrate the existing personal client, then block direct public access to 8080. Verify that the old public connection fails and the new WSS connection works before retiring the old inbound. Keep a rollback route and restricted backups until acceptance.
5. Add per-user Xray credentials via a reconciler that retains the baseline configuration, applies only grants that are active, and removes expired or revoked clients from Xray. Test that a copied profile stops working at expiry. Do not use subscription expiry alone as enforcement.
6. Expose a user-specific, revocable subscription URL through GaryHub only after reconciliation works. Verify import on v2rayN and test token rotation, logout, and two different Calendar accounts.
7. Deploy the invitation UI and set `ACCESS_STORE_URL` to the exact HTTPS store homepage after it is supplied. Payment remains entirely on the third-party store and issuance remains manual.

Nothing in this document changes the live server. Never close port 8080 before the existing client has a working replacement.

## Candidate WSS route for this host

The owner inspected the Caddy container: it is on `my-services_default` with host gateway `172.18.0.1` on 2026-10-10. A candidate is `vpn.garyhub.uk` on Caddy HTTPS/WSS, reverse-proxied to a separate host Xray VLESS/WS inbound bound to `172.18.0.1:18080`. The gateway address is an observation, not a permanent Docker contract; validate it again before use and after network recreation. The new DNS name and exact WebSocket path need to be chosen before writing live configuration.

Conceptual request path:

```text
v2rayN -- WSS/443 --> Caddy (vpn.garyhub.uk) -- WS/private bridge --> Xray (172.18.0.1:18080)
```

Keep the old systemd Xray inbound on public 8080 while validating the new route. Add a separate inbound/tag to the same Xray process, not a replacement of the existing inbound, and preserve its existing client array. Caddy must use a route specific to the new hostname and WebSocket path. Do not copy a live Caddyfile or Xray config into the repo. A public firewall check must confirm 18080 is unreachable from outside even if its host address changes. After testing the new route, switch the old client and remove public 8080 access.

The migration does not require exposing Xray's optional management API on the public network. A separate local reconciler can maintain individual credentials from active entitlements and remove expired/revoked ones after transport security is verified. The existing one-client inbound is never used as the paid-user pool.

## Batch installer

`scripts/garyhub-wss-batch.sh` now implements preparation and application on the host. Run it as root using Bash. It starts a detached worker, writes private backups under `/root/garyhub-wss-<timestamp>`, validates both candidates, preserves the bind-mounted Caddyfile inode, restarts Xray, reloads Caddy, then verifies the publicly trusted TLS certificate and a WebSocket 101 response through localhost port 443 with the correct hostname. Existing Xray clients and port 8080 remain in the configuration. Xray restart temporarily interrupts active connections. If application or verification fails, the worker attempts to restore both original files and services and reports any failed rollback operation. Backup files also remain available for manual recovery after host/process failure.

The installer does not deploy the access UI, issue customer credentials, enforce expiry, or close port 8080. A successful handshake does not prove end-to-end VLESS traffic or external port isolation; test the private v2rayN profile and check that public 18080 is unreachable before completing migration. The profile stays in a mode-0600 file under its mode-0700 backup directory. Do not paste it into chat. The installer refuses a duplicate inbound/tag/domain or an unexpected running Xray config path.

Local verification used simulated command dependencies for successful application, candidate-validation failure, and Xray-restart failure with rollback. Live Xray/Caddy validation has not been run from this workspace. Current DNS was verified by the owner through Google DNS and subsequently the VPS resolver: `vpn.garyhub.uk` resolves via CNAME to `garyhub.uk`, IPv4 `162.35.168.17`.
