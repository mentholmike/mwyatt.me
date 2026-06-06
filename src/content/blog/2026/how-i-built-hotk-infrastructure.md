---
title: "How I Built the Infrastructure for a Strategy Game — and Why I Didn't Use Vercel"
description: "The full stack behind Hand of the King: agentic code review, CI/CD to GHCR, Docker Compose on a hardened VPS, MCP with OAuth, Supabase auth, and a persistent memory layer called Lethe. All self-hosted."
pubDatetime: 2026-06-06T06:00:00.000Z
tags: ["infrastructure", "hotk", "self-hosting", "docker", "mcp", "lethe"]
featured: true
---

I built a strategy game called **Hand of the King**. It's a single-player kingdom management thing inspired by *King of Dragon Pass* — you play a foreign ruler advising a medieval court, making trade deals, fighting wars, and trying not to get assassinated. The game engine is Go. The web frontend is Vue 3. The narrative is LLM-generated.

But this post isn't about the game. It's about the infrastructure I built to run it — because honestly, the infra was harder than the game logic, and I learned more from it.

Here's the full stack, end to end, with all the mistakes and dead ends included.

---

## The Agentic Loop: An AI Agent Reviews My Code

The first thing I set up wasn't a server. It was a **feedback loop**.

I run [OpenClaw](https://openclaw.ai), which gives me an AI agent (I named him Archimedes) that can read my code, run tests, and push fixes. The workflow goes like this:

1. I write code. Or, more often lately, Archimedes writes the first draft based on a spec I give him — he has full access to the repo, can run `go test`, lint checks, and the benchmark suite.
2. Once the code looks right, he kicks off the [autoreview skill](https://github.com/mentholmike/agent-skills) — a structured closeout check that hands the diff to [Codex](https://github.com/openai/codex) for a second-model review.
3. Codex returns a structured report: findings with severity, file paths, and suggested fixes.
4. Archimedes reads every finding, verifies each one against the actual code (not blindly applied), and either patches it or rejects it with reasoning.
5. If a fix changes code, the loop restarts: focused tests, then another Codex pass.
6. The loop keeps running until Codex comes back clean. No accepted findings, no ship.

**The key thing about the autoreview loop is patience.** A single Codex review pass can take anywhere from five minutes to half an hour depending on the size of the diff and whether it pulls in dependency docs. The skill explicitly tells you not to kill a review just because it's been quiet for a few minutes — those long silences are usually the model doing real work, not a hang. I learned this the hard way: my first instinct was to interrupt runs that looked slow, and I shipped a bug that the review would have caught.

**What this catches that I miss:**

- A race condition in my session manager that I missed in three manual reviews.
- I was using `len()/4` for token counting instead of `utf8.RuneCountInString()/4`, which broke on non-ASCII narrative text (the game generates a lot of accented character names).
- My `/compact` endpoint was returning the summary nested inside a `session` object while the plugin expected it at the top level — a bug that would have broken memory bootstrap on every restart.
- A subtle issue where the MCP OAuth token resolver was swallowing errors instead of propagating them, masking a config bug on the Supabase side.

**The philosophy: Codex is the reviewer of record, not Archimedes.** Archimedes writes code with strong priors. Codex comes in cold, with fresh context, and looks for things the author wouldn't. That's the whole point — a second model catches what the first one rationalizes away. ([Peter Steinberger](https://steipete.me) has been hammering on this idea for years in his own work, and he's right: a single-model loop is just the model agreeing with itself. Two models, structured handoff, real review.)

The loop isn't perfect. Sometimes Codex over-flags stylistic nits. Sometimes Archimedes and I disagree on whether a finding is worth fixing. But the hit rate on actual bugs is high enough that I don't ship without running it. On the HOTK campaign engine, the autoreview loop has caught at least one substantive bug per merge for the last three months. That compounds.

---

## Testing with Crabbox

Before anything touches production, it goes through **Crabbox** — a disposable VPS I use as a rehearsal environment.

The workflow is:

1. Build the Docker image locally.
2. Push to GHCR.
3. Spin up Crabbox.
4. `docker compose up -d` on Crabbox.
5. Run smoke tests: hit the health endpoint, verify the API responds, check that the frontend loads.
6. If it breaks, fix locally and repeat.
7. If it passes, promote the same image to the real VPS.

Crabbox is Ubuntu 24.04, 2 vCPU, 2GB RAM — same specs as the production VPS. The point is to catch environment-specific bugs before they hit the live server. I've found Docker network issues, missing env vars, and permission problems this way that would have taken down the production deploy.

The name is stupid but it stuck. Every project needs a stupid name.

---

## CI/CD Pipeline: GitHub Actions → GHCR

I don't push to Docker Hub manually. Everything goes through GitHub Actions.

The pipeline is simple but strict:

- **On every push to `main`**: lint, test, build the Go binary, build the Docker image.
- **On tag push (`v*` semantic version)**: same as above, plus push to GHCR with the version tag.
- **Image retention policy**: only `latest`, the current semver, and one previous version are kept. Everything else gets cleaned up automatically. I learned this the hard way after racking up 57 orphaned image versions.

The images are **multi-arch** (`linux/amd64` and `linux/arm64`). I build on my Mac mini (Apple Silicon), so without multi-arch builds, the VPS (x86_64) would pull an arm64 image and fail with `no matching manifest`. Docker Buildx handles the cross-compilation.

One hard lesson: esbuild (the JS bundler) doesn't run well under QEMU emulation. If you're building a static site inside a Docker container on Apple Silicon and targeting amd64, the build will randomly die. The fix is to build the static assets **on the host** (arm64 native), then copy them into an amd64 runtime image. I maintain a separate `Dockerfile.amd64` for this path.

---

## Docker Compose Setup

The production stack is six services on a single VPS:

```
Internet
  └─ Caddy (:80/:443, automatic TLS)
      ├─ hotk-web      (static Vue site, GHCR image)
      ├─ hotk-api      (Go game engine, SQLite, REST + WebSocket)
      ├─ hotk-mcp      (MCP server, OAuth-protected)
      └─ lethe         (memory layer for the agent, SQLite)
```

All services run on a private Docker network (`hotk-prod`). Only Caddy exposes public ports. The game engine, MCP server, and memory layer are unreachable from the internet directly.

Key hardening choices:

- **Read-only root filesystems** on all containers. Nginx needs `/tmp`, `/var/cache/nginx`, and `/var/run` as `tmpfs` mounts so it can still start.
- **No-new-privileges** security option. Containers can't escalate.
- **Non-root users** where possible. The nginx container runs as `nginx:nginx`, not root.
- **Separate Docker networks**: `hotk_public` for the edge proxy, `hotk_private` for internal services. Even if someone compromises a container, they can't talk directly to the API.

The compose files live in the repo. Secrets are in `/etc/hotk/*.env` on the host, never in git.

---

## Reverse Proxy and Edge Security

**Caddy** is the current edge proxy. It handles automatic TLS (Let's Encrypt), HTTP→HTTPS redirect, and routes to the right upstream:

- `hotk.dev/` → `hotk-web`
- `hotk.dev/api/*` → `hotk-api`
- `mcp.hotk.dev/mcp` → `hotk-mcp`
- `mcp.hotk.dev/.well-known/oauth-protected-resource` → `hotk-mcp` (OAuth discovery)

Caddy is dead simple. One Caddyfile, no certificate management scripts, no cron jobs for renewals. It just works.

**The next step is SafeLine**, a WAF that sits in front of Caddy. It adds rate limiting, bot protection, and common attack blocking. I'm not running it yet — the game's still in closed beta with a small user pool — but it's the planned hardening layer before wider public access.

The rule is: ship with Caddy first, add SafeLine when you have real users to protect.

---

## Linux Security Hardening

The VPS baseline is strict:

- **UFW**: default deny inbound. Only `80/tcp` and `443/tcp` are open.
- **SSH**: key-only auth, password auth disabled, restricted to Tailscale and my home IP.
- **Non-root deploy user**: the Docker daemon runs under a dedicated user, not root.
- **No Docker socket exposed to containers**: the game engine doesn't need to launch other containers, so it doesn't get the socket. If that changes later, I'll use a Docker socket proxy with limited verbs, not raw `/var/run/docker.sock`.
- **Unattended security updates**: automatic for critical patches.
- **Daily backups**: SQLite databases (game state, Lethe memory) are dumped, compressed, and rotated with 7-day retention.
- **Log rotation**: nginx and application logs rotate daily, not left to fill the disk.

This isn't enterprise-grade, but it's good enough for a one-person operation. The principle is: default deny, minimal exposure, recoverable state.

---

## MCP: Model Context Protocol with OAuth

The **MCP server** (`mcp.hotk.dev`) is how external AI clients — ChatGPT, Claude, Cursor, whatever — talk to the game.

It implements the [Model Context Protocol](https://modelcontextprotocol.io) standard, which lets an LLM discover what tools are available and call them. In HOTK's case, the tools are things like:

- `list_campaigns` — show active games
- `propose_action` — submit a turn action
- `get_realm_state` — fetch the current kingdom status

The MCP server is **OAuth-protected**. When a client connects, it hits the OAuth discovery endpoint:

```
GET https://mcp.hotk.dev/.well-known/oauth-protected-resource
```

Which returns:

```json
{
  "authorization_servers": ["https://yccnaslxsopkxztamgpq.supabase.co/auth/v1"],
  "resource": "https://mcp.hotk.dev/mcp",
  "scopes_supported": ["email"]
}
```

The client then redirects to Supabase Auth, the user logs in, and Supabase issues a token that the MCP server validates. No API keys pasted into chat windows. No static bearer tokens shared across users. Real OAuth with PKCE.

This was a deliberate choice. The old approach — copy-pasting a static `hotk_ag` bearer token — works for dev but is unacceptable for production. OAuth gives me user identity, scoped permissions, and audit trails.

The MCP server itself is a small Go binary. It translates MCP tool calls into HTTP requests to the HOTK API, validates the OAuth token against Supabase, and returns structured responses the LLM can understand.

---

## Supabase: Auth and User Data

**Supabase** handles all user-facing auth: registration, login, password resets, OAuth (Discord, Google), and JWT sessions.

Why Supabase Cloud and not self-hosted?

Because self-hosting Supabase means running Postgres, GoTrue, Realtime, Storage, Kong, and email/OAuth config yourself. That's a full-time job. For a closed beta with a small user pool, Supabase Cloud is the right tradeoff: I get enterprise auth without the ops overhead.

Supabase stores:
- User profiles (email, display name, tier)
- API keys (bcrypt-hashed, scoped, revocable)
- Subscription status (manual for now, Stripe later)

It does **not** store game state. Campaigns, turns, and events live in SQLite on the HOTK VPS. The separation is intentional: auth data is user-platform, game data is game-platform. If Supabase has an outage, existing games keep running.

---

## Lethe: The Memory Layer

**Lethe** is the piece I'm most proud of, and it's the one nobody sees.

It's a persistent memory layer for AI agents. The problem it solves is simple: every time my agent (Archimedes) starts a new session, he wakes up with zero context. He doesn't remember what we were working on yesterday, what bugs we fixed, or what decisions we made.

Lethe fixes that. It's a Go server backed by SQLite, running at `localhost:18483`, with an OpenClaw plugin that hooks into every agent turn. On every message, it auto-logs:

- What the user said
- What tools the agent used
- What the agent decided
- Any flags (uncertainties, blockers, things to revisit)

On session start, the plugin fetches a **compact summary** of the previous session and prepends it to the agent's system prompt. So when Archimedes wakes up, he reads something like:

> *"Previous session: fixed token counting bug, shipped Lethe v0.1.2, 3 open flags remain: thread auto-logging needs cleanup, template capitalization inconsistency, wildcard search escaping."*

Then he knows where we left off.

The Lethe server also has a web UI (warm paper aesthetic, Syne + JetBrains Mono fonts) for browsing sessions, events, checkpoints, and flags. I use it to review what the agent did when I wasn't watching — which is often, because he runs benchmarks hourly while I sleep.

Lethe is open source: [github.com/openlethe/lethe](https://github.com/openlethe/lethe). The plugin is bundled. The skill file teaches any agent how to use it.

---

## What This Cost (in Time, Not Money)

The VPS is $5/month. The domain is $12/year. Supabase free tier covers the beta user count. GHCR is free for public repos. The only real cost is time.

Time spent:
- Agentic autoreview loop: ~2 weeks to get reliable
- CI/CD pipeline: ~3 days (mostly fighting multi-arch builds)
- Crabbox testing workflow: ~1 day
- Docker Compose + hardening: ~1 week
- MCP + OAuth: ~1 week (OAuth is fiddly)
- Lethe: ~3 weeks (the plugin was the hard part)
- WAGMIOS (the Docker management platform that runs the homelab): ~2 months, but that's a separate project

Total: about 2 months of evenings and weekends. Not trivial, but not a full-time job either.

---

## What I Learned

**Self-hosting is slower than SaaS, but you own the debugging.** When something breaks at 2 AM, I can SSH in, read the logs, and fix it. I don't open a support ticket and hope.

**AI agents are force multipliers, not replacements.** Archimedes doesn't write code I couldn't write. He writes code I don't have time to write, catches bugs I'd miss, and runs tests while I sleep. The loop is: I do the thinking, he does the repetitive execution.

**OAuth is worth the pain.** The static bearer token approach (paste a key into a chat window) is faster to set up but creates a security debt you'll pay later. MCP with real OAuth took longer to build, but now I have user identity, scoped permissions, and an audit trail.

**Read-only containers are free security.** It costs nothing to add `read_only: true` and `tmpfs` mounts to your compose file. It buys you a lot if someone ever compromises a container.

**Document your decisions.** The `vpsdesign.md` file in the HOTK repo is the single most valuable document I wrote. Every time I come back to this project after a week away, I read it first. It saves me from re-discovering my own reasoning.

---

## What's Next

The current stack runs a closed beta. The next milestones:

1. **SafeLine WAF** — add rate limiting and bot protection before public links.
2. **Multiplayer** — designed, not shipped. Room codes, WebSocket lobbies, hosted game instances.
3. **Stripe billing** — manual tier assignment now, automated subscriptions later.
4. **Lethe v0.2** — project-level scrum board, better search, cross-project memory.
5. **CKA** — I'm studying for the Certified Kubernetes Administrator exam. The homelab already runs Talos Linux, ArgoCD, and Longhorn. This stack is my practice ground.

---

## The Code

Everything is open source:

- **HOTK game + API**: [github.com/mentholmike/hotk](https://github.com/mentholmike/hotk)
- **HOTK web frontend**: [github.com/mentholmike/hotk-web](https://github.com/mentholmike/hotk-web)
- **HOTK MCP server**: [github.com/mentholmike/hotk-mcp](https://github.com/mentholmike/hotk-mcp)
- **Lethe memory layer**: [github.com/openlethe/lethe](https://github.com/openlethe/lethe)
- **WAGMIOS homelab platform**: [github.com/mentholmike/wagmios](https://github.com/mentholmike/wagmios)
- **This site**: [github.com/mentholmike/mwyatt.me](https://github.com/mentholmike/mwyatt.me)

If you're building something similar, steal what works, ignore what doesn't, and tell me what you did differently. I'm always looking for better ways to do this.
