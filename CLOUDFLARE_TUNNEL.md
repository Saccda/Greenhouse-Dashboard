# Cloudflare Tunnel — stable setup for Node-RED + backend

Your current Node-RED tunnel is a **quick tunnel** (`cloudflared tunnel --url ...`), which hands out
a random `*.trycloudflare.com` URL that changes every time `cloudflared` restarts. That's fine for
occasional access, but the backend's public URL needs to stay constant — Vercel's frontend
(`NEXT_PUBLIC_API_URL`) and the backend's own CORS allowlist both hardcode it. A **named tunnel**
fixes this with a permanent hostname, and lets both services share one tunnel process.

## 1. Get a domain via Cloudflare Registrar

Cloudflare dashboard → **Domain Registration** → **Register a Domain** → search and buy
(~$10-15/yr depending on TLD, sold at cost). It's automatically added to your Cloudflare account —
no separate nameserver step needed.

## 2. Authenticate cloudflared to your account

On the lab desktop (where `cloudflared` is already installed for the current Node-RED tunnel):

```powershell
cloudflared tunnel login
```

Opens a browser — log in and pick the domain you just registered. This creates a `cert.pem` under
`%USERPROFILE%\.cloudflared\`.

## 3. Create one named tunnel for both services

```powershell
cloudflared tunnel create greenhouse
```

Outputs a tunnel UUID and writes `<UUID>.json` (credentials) into `%USERPROFILE%\.cloudflared\`.
Note the UUID for the config below.

## 4. Write the ingress config

Create `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: C:\Users\<you>\.cloudflared\<TUNNEL-UUID>.json

ingress:
  - hostname: noderd.farmos-mechanicalengineering.com
    service: http://localhost:1880
  - hostname: api.farmos-mechanicalengineering.com
    service: http://localhost:8000
  - service: http_status:404   # catch-all, required as the last rule
```

Replace `<TUNNEL-UUID>` and `<you>` with the actual values from step 3's output.

## 5. Route DNS for both hostnames

```powershell
cloudflared tunnel route dns greenhouse noderd.farmos-mechanicalengineering.com
cloudflared tunnel route dns greenhouse api.farmos-mechanicalengineering.com
```

This creates the CNAME records in Cloudflare DNS automatically — no manual DNS editing.

## 6. Run it as a persistent Windows service

`cloudflared` has built-in Windows service support (no NSSM needed for this one):

```powershell
cloudflared service install
```

This reads `config.yml` and registers `cloudflared` to auto-start on boot, same effect as the NSSM
setup for the backend. Start it via `services.msc` or `net start cloudflared`.

## 7. Retire the old quick tunnel

Stop whatever process/script currently runs `cloudflared tunnel --url http://localhost:1880`
(the quick tunnel) — it's superseded by the named tunnel service from step 6, which now handles
both Node-RED and the backend under stable hostnames.

## 8. Wire up the app config

- **Vercel** → Project → Settings → Environment Variables → `NEXT_PUBLIC_API_URL` =
  `https://api.farmos-mechanicalengineering.com` → redeploy.
- **Backend `.env`** on the lab desktop → `CORS_ORIGIN=http://localhost:3000,https://api.farmos-mechanicalengineering.com,https://greenhouse-dashboard-saccada.vercel.app`
  → `nssm restart GreenhouseBackend`.
