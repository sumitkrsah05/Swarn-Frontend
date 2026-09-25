# Deploying swarn on a VM

Two containers: **api** (the FastAPI backend from `agent2/`) and **web** (this
Next.js app). Users open the web app on port 3000; the browser calls the API
on port 8420 directly, so both ports must be reachable from the users'
network. An optional Caddy proxy puts both behind one address with HTTPS.

Tested layout — two sibling checkouts:

```
/opt/swarn/
├── agent2/            # backend
└── swarn-frontend/    # this repo (deploy/ is in here)
```

## 1. Prepare the VM (Ubuntu / Debian)

```bash
# Docker Engine + the compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
docker compose version          # v2.24 or newer

# room for the images (~3 GB) and your data
df -h /
```

Any Linux with Docker 24+ and Compose v2.24+ works; the commands below are
identical.

## 2. Put the code on the VM

Either clone both repositories side by side:

```bash
sudo mkdir -p /opt/swarn && sudo chown $USER /opt/swarn && cd /opt/swarn
git clone <your-agent2-remote> agent2
git clone <your-swarn-frontend-remote> swarn-frontend
```

or copy them from your machine (skips caches and the 2 GB of old runs):

```bash
rsync -av --exclude node_modules --exclude .next --exclude .venv --exclude venv \
      --exclude runs --exclude __pycache__ \
      ~/Desktop/Project/agent2 ~/Desktop/Project/swarn-frontend  user@VM:/opt/swarn/
```

## 3. Configure

```bash
cd /opt/swarn/swarn-frontend/deploy
cp .env.example .env
cp api.env.example api.env
```

Edit **`.env`**: set `PUBLIC_HOST` to the address people will type in the
browser (the VM's IP, e.g. `172.16.21.108`, or its DNS name). Keep the ports
unless they clash.

Edit **`api.env`**: the model endpoint and key (`SWARN_DEPLOYED_*`). If you
already have a working `agent2/.env`, copy it over `api.env` as-is.

Data folders (owned by uid 1000, the user inside the api container):

```bash
mkdir -p data/{workspace,sessions,runs,knowledge,aide-runs}
sudo chown -R 1000:1000 data
```

Optional — bring existing data along (uploads, plots, reports, traces):

```bash
cp -r /path/to/old/agent2/workspace/. data/workspace/
cp -r /path/to/old/agent2/sessions/.  data/sessions/
cp -r /path/to/old/agent2/knowledge/. data/knowledge/
sudo chown -R 1000:1000 data
```

## 4. Build and start

```bash
docker compose up -d --build       # first build: 5–15 minutes
docker compose ps                  # api should become "healthy"
docker compose logs -f api         # Ctrl+C to stop following
```

## 5. Open the firewall and test

```bash
sudo ufw allow 3000/tcp && sudo ufw allow 8420/tcp     # if ufw is active

curl http://localhost:8420/api/jobs                    # {"jobs":[...]}
curl -I http://localhost:3000                          # HTTP/1.1 200 OK
```

Then open `http://<PUBLIC_HOST>:3000` in a browser. The app bar should show
the model name and a green **live** dot. Ask something on the landing page,
or upload a CSV, and a workspace opens.

## 6. Day-to-day

```bash
docker compose logs -f api web     # logs
docker compose restart api         # restart one service
docker compose down                # stop (data stays in ./data)

# update after pulling new code
git -C /opt/swarn/agent2 pull && git -C /opt/swarn/swarn-frontend pull
docker compose up -d --build

# backup = the data folder + the two env files
tar czf swarn-backup-$(date +%F).tgz data .env api.env
```

Changing `PUBLIC_HOST` or the ports needs `docker compose up -d --build`
again, because the API address is baked into the web image.

## 7. One address with HTTPS (optional)

If the VM has a DNS name (say `swarn.example.com` pointing at it) you can
serve everything from one origin with automatic HTTPS:

```bash
echo "SITE_ADDRESS=swarn.example.com" >> .env      # or SITE_ADDRESS=:80 for plain HTTP on the IP
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d --build
```

Caddy (`Caddyfile`) routes `/api/*`, `/ws/*` and `/docs` to the API and
everything else to the web app; ports 3000 and 8420 are no longer published.
To password-protect the site, uncomment the `basic_auth` block in
`Caddyfile` (instructions inside) and `docker compose restart proxy`.

Use this mode whenever the app is reachable from outside your network: the
API has no authentication of its own and can execute code.

## 8. Where generated code runs

The agent's `run_python` / `run_shell` tools execute inside the **api
container** (`SWARN_SANDBOX=subprocess`), isolated from the VM but not from
the API's own files. If you prefer per-run sibling containers, mount the
Docker socket and switch the mode — add to `api` in a compose override:

```yaml
    environment:
      SWARN_SANDBOX: docker
      SWARN_SANDBOX_USER: "1000:1000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

## 9. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Browser console: CORS error on `/api/...` | `PUBLIC_HOST` (or the port) in `.env` differs from the address in the browser. Fix `.env`, `docker compose up -d --build`. |
| Amber live dot, no live steps, but pages load | Port 8420 is blocked between the users and the VM, or the websocket is proxied without upgrade support. Open the port, or use the Caddy mode. |
| `api` never becomes healthy | `docker compose logs api`. Usually a bad `api.env` line or the model endpoint unreachable from the VM (`curl $SWARN_DEPLOYED_BASE_URL/models`). |
| Runs finish instantly with no cards, the answer shows `<tool_call>` text | The model endpoint returns tool calls as text. Enable a tool-call parser on that endpoint, or point `SWARN_DEPLOYED_*` at a model that returns structured tool calls. |
| "Permission denied" on `/app/workspace` in the api logs | `sudo chown -R 1000:1000 deploy/data` |
| Build fails downloading Python packages | The VM needs outbound HTTPS to PyPI and ghcr.io during `docker compose build`. |

## Without Docker (systemd)

If Docker is not an option, run the same two processes directly.

```bash
# backend
cd /opt/swarn/agent2
curl -LsSf https://astral.sh/uv/install.sh | sh          # installs uv
uv sync --frozen --python 3.12                            # creates .venv
cp .env.example .env && nano .env                         # model settings
export SWARN_CORS_ORIGINS=http://<PUBLIC_HOST>:3000 SWARN_SANDBOX=subprocess
.venv/bin/uvicorn agent.web.dashboard:app --host 0.0.0.0 --port 8420

# frontend (Node 22)
cd /opt/swarn/swarn-frontend
npm ci
NEXT_PUBLIC_SWARN_API=http://<PUBLIC_HOST>:8420 npm run build
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
PORT=3000 HOSTNAME=0.0.0.0 node .next/standalone/server.js
```

Wrap each in a systemd unit (`ExecStart` as above, `WorkingDirectory` set,
`Restart=always`, `EnvironmentFile=/opt/swarn/agent2/.env` for the API) to
survive reboots.
