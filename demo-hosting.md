# Hosting the demo on a DigitalOcean droplet

This guide walks through getting an internet-accessible copy of Glimmergrove
running at **https://anrpg.com** on a new DigitalOcean droplet, using two
scripts that live in this repository:

| Script | Purpose |
| --- | --- |
| `scripts/demo/setup-droplet.sh` | One-shot setup: installs everything and brings the game online. |
| `scripts/demo/redeploy.sh` | Wipes the demo (database + code), re-clones the repository, rebuilds, re-seeds, and restarts. Installed on the droplet as `glimmergrove-redeploy`. |

## What the setup script installs

```
Browser ──HTTPS──> nginx (Let's Encrypt cert, port 443)
                     │ proxy
                     ▼
                   Next.js server (systemd service "glimmergrove",
                   127.0.0.1:3000, runs as unprivileged user "glimmer")
                     │
                     ▼
                   PostgreSQL (localhost only, database "virtualpet")
```

Everything on one droplet:

- **Node.js 22** (NodeSource) and the app built in production mode
- **PostgreSQL** with a dedicated `vpet` role and a generated password
- **nginx** terminating TLS with your existing Let's Encrypt certificate and
  proxying to the app; HTTP redirects to HTTPS
- **systemd service** `glimmergrove` that starts on boot and restarts on
  failure; the app runs as the non-root system user `glimmer`
- **ufw firewall** allowing only SSH, HTTP, and HTTPS
- A 2 GB **swapfile** on droplets with less than 2 GB RAM (the Next.js build
  is memory-hungry)
- `/etc/glimmergrove-demo.conf` (root-only) recording the deployed repo,
  branch, domain, and database credentials for later redeploys

## Prerequisites

- A DigitalOcean droplet running **Ubuntu 24.04 LTS** (22.04 also works).
  1 GB RAM works thanks to the automatic swapfile; 2 GB is more comfortable.
- The DNS **A record for `anrpg.com` pointing at the droplet's public IP**
  (set this at your DNS provider; verify with `dig +short anrpg.com`).
- Your **Let's Encrypt certificate already on the droplet** (the script looks
  under `/etc/letsencrypt/live/anrpg.com/`). If it is missing — for example
  on a brand-new droplet — the script still completes over plain HTTP and
  prints the exact `certbot` command to run; re-run setup afterwards to
  switch nginx to HTTPS.
- Root SSH access to the droplet.

## Step 1 — Get the scripts onto the droplet

Either copy just the setup script from your machine:

```sh
scp scripts/demo/setup-droplet.sh root@YOUR_DROPLET_IP:/root/
```

or clone the repository on the droplet after SSHing in:

```sh
ssh root@YOUR_DROPLET_IP
apt-get update && apt-get install -y git
git clone https://github.com/doublestoppd/np.git
cd np
```

> **Private repository?** Plain `git clone` will fail. Create a fine-grained
> GitHub personal access token with read-only content access to the repo and
> use `https://<TOKEN>@github.com/doublestoppd/np.git` as the URL. If you do
> this, pass the same URL as `REPO_URL` in Step 2 so redeploys keep working —
> it is stored in root-only `/etc/glimmergrove-demo.conf`.

## Step 2 — Run the setup script

As root on the droplet:

```sh
bash scripts/demo/setup-droplet.sh
```

Defaults: domain `anrpg.com`, repo `https://github.com/doublestoppd/np.git`,
branch `main`. Override any of them with environment variables:

```sh
DOMAIN=anrpg.com \
REPO_URL=https://github.com/doublestoppd/np.git \
BRANCH=main \
bash scripts/demo/setup-droplet.sh
```

> **Until the game foundation is merged to `main`**, deploy the feature
> branch instead:
>
> ```sh
> BRANCH=claude/virtual-pet-game-foundation-fgqnhz bash scripts/demo/setup-droplet.sh
> ```
>
> The script fails fast with a clear message if the chosen branch does not
> contain the game.

The script takes a few minutes (mostly `npm ci` and the production build) and
ends with a summary. It is safe to re-run at any time; re-running redeploys
the app and refreshes nginx/systemd config without touching existing player
data.

## Step 3 — Verify

- Open **https://anrpg.com** — you should see the sign-in page.
- Create an account, pick a starter pet, and feed it.
- On the droplet:

  ```sh
  systemctl status glimmergrove     # service state
  journalctl -u glimmergrove -f     # live app logs
  ```

## Wiping and redeploying

Setup installs the second script as a global command. To **wipe everything
(all demo accounts, pets, inventories), pull a fresh copy of the repository,
rebuild, re-seed, and restart**:

```sh
glimmergrove-redeploy
```

It lists exactly what it is about to destroy and asks for confirmation; use
`glimmergrove-redeploy --yes` to skip the prompt (e.g. from cron or CI). It
redeploys whatever `REPO_URL`/`BRANCH` are set in
`/etc/glimmergrove-demo.conf` — edit that file first to switch branches.

To update the code **without** wiping player data instead, re-run
`setup-droplet.sh` (it re-clones and rebuilds but preserves the database), or
do it manually:

```sh
cd /srv/glimmergrove/app
sudo -u glimmer -H git pull
sudo -u glimmer -H bash -c 'npm ci && NODE_OPTIONS=--max-old-space-size=2048 npm run build && npx prisma migrate deploy'
systemctl restart glimmergrove
```

(The `NODE_OPTIONS` heap size matters: without it, `next build`'s
type-check stage runs out of memory on small droplets — see
Troubleshooting.)

## Day-2 operations

| Task | Command |
| --- | --- |
| App logs (live) | `journalctl -u glimmergrove -f` |
| Restart app | `systemctl restart glimmergrove` |
| nginx logs | `tail -f /var/log/nginx/access.log /var/log/nginx/error.log` |
| Database shell | `sudo -u postgres psql virtualpet` |
| Deployed commit | `git -C /srv/glimmergrove/app rev-parse --short HEAD` |
| Change deployed branch | edit `/etc/glimmergrove-demo.conf`, then `glimmergrove-redeploy` |
| Certificate renewal | handled by certbot's systemd timer; check `certbot renew --dry-run` |

## Troubleshooting

- **The domain doesn't load** — confirm DNS: `dig +short anrpg.com` must
  print the droplet IP. DNS changes can take a while to propagate.
- **Browser warns about the certificate** — the cert on the droplet probably
  doesn't match `anrpg.com`. Check `certbot certificates`, fix with
  `certbot --nginx -d anrpg.com`, then re-run the setup script.
- **Build fails with `FATAL ERROR: Reached heap limit Allocation failed —
  JavaScript heap out of memory`** (during "Linting and checking validity
  of types") — Node capped its heap at the default (~half of RAM), which
  is too small for `next build`'s type-check worker on a 1 GB droplet.
  Both scripts now build with `NODE_OPTIONS=--max-old-space-size=2048`;
  if you see this, you are running an older copy of the script — pull the
  latest repository and re-run, or export that variable before building
  manually. Confirm swap is active with `swapon --show` (setup and
  redeploy both provision a 2 GB swapfile on droplets under 2 GB RAM).
- **Build killed / droplet froze during setup** — almost always memory.
  The script adds swap on small droplets, but on a 512 MB droplet resize up
  to at least 1 GB.
- **`git clone` failed** — private repo without a token (see Step 1), or a
  typo'd `BRANCH`. The failure message from git names the branch it tried.
- **App starts but pages 500** — check `journalctl -u glimmergrove -n 100`.
  A wrong `DATABASE_URL` (edited by hand?) or an unapplied migration are the
  usual suspects; `glimmergrove-redeploy` restores a known-good state.
- **Port 3000 already in use** — another process is squatting on it:
  `ss -ltnp | grep 3000`, stop it, then `systemctl restart glimmergrove`.

## Security notes (demo-grade, on purpose)

- Sign-up is open to anyone on the internet; treat all data as disposable.
  `glimmergrove-redeploy` resets the world at any time.
- PostgreSQL listens on localhost only, the app runs as a non-root user, and
  the database password is generated per droplet and stored in root-only
  files (`/etc/glimmergrove-demo.conf` and the app's `.env`).
- This is a single-box demo topology — no backups, no monitoring, no
  rate limiting. Don't point real users at it.
- Keep the droplet patched: `apt-get update && apt-get upgrade` now and
  then, or enable unattended upgrades.
