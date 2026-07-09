---
title: "Building Cheapbastards.xyz — A Subdomain Registry Without Becoming a Hosting Company"
description: "How I built cheapbastards.xyz: a free subdomain registry for developers, delegation-first DNS, Neon + Stripe + Cloudflare Workers, and the architecture choices that kept the platform from becoming a reverse proxy with a blog."
pubDatetime: 2026-07-09T21:00:00.000Z
tags: ["cheapbastards", "cloudflare", "dns", "neon", "stripe", "infrastructure", "workers"]
featured: true
---

I built a free subdomain registry called **Cheapbastards**. The product promise is intentionally small: claim a memorable name under a platform-owned root, point it at your own site, keep control of your DNS and TLS, and don't pay a hosting tax for a vanity hostname.

I did not build this alone. **Archimedes** — my agent — wrote most of the implementation, chased production bugs, hardened the security posture, ran the audit/fix loop, and kept the deploy path honest while I owned product direction and the architectural hard stops. If this platform feels coherent, a large part of that is him.

This post is not a pitch deck. It's the infrastructure story — what the product actually is, why the architecture looks the way it does, and the hard edges we hit turning a neat DNS idea into something that can take money, handle abuse, expire claims, and not write records into the wrong Cloudflare zone at 2 AM.

Live site: [cheapbastards.xyz](https://cheapbastards.xyz)

---

## The Problem I Wanted to Solve

Developers, students, and side-project people still need names. Not always a full custom domain. Sometimes just a stable FQDN they can point at Pages, a home lab, a demo, or a temporary project without buying another `$12/year` domain and wiring DNS for the 40th time.

Most existing "free subdomain" setups fall into one of two traps:

1. **They become hosting.** Reverse proxies, shared TLS, origin routing, content liability, and a support queue that never ends.
2. **They become toys.** No billing, no abuse path, no lifecycle, no real verification — just a spreadsheet and hope.

I wanted a third option: a **registry**, not a host. Hand out names. Write DNS. Get out of the request path.

---

## The Core Decision: Delegation-First DNS

The most important product decision happened before most of the code: **default to delegation**.

When a user claims something like `mark.is-a.vibercoder.cc`, the platform's job is not to proxy that name. Its job is to write NS records into the parent zone and let the user's own DNS provider own everything below it.

```txt
Delegated mode (default):
  mark.is-a.vibercoder.cc  NS  anna.ns.cloudflare.com
  mark.is-a.vibercoder.cc  NS  bob.ns.cloudflare.com
                              ↓
                    user's zone owns records + TLS

Managed fallback:
  mark.is-a.vibercoder.cc  CNAME  my-app.pages.dev
                              ↓
                    DNS-only, proxied=false, user host issues cert
```

That choice has teeth:

- The platform never terminates TLS for user sites.
- The platform never issues certificates for user destinations.
- The platform never proxies user traffic.
- Abuse interdiction still works — pull the delegation, the name dies at the parent zone.

Managed DNS mode exists as a fallback for people who just want `CNAME my-app.pages.dev` or a simple A record. It's useful. It's also where quotas, validation, and drift management get more expensive. Delegation stays the default because it keeps the product honest.

---

## The Architecture Graph

This is the graph we used on the public project to show how the pieces actually fit:

![Cheapbastards architecture — browser to Cloudflare edge, Next.js Worker, Neon Auth, Neon Postgres, Stripe, Cloudflare DNS, and email](/posts/2026/building-cheapbastards-xyz/architecture.jpg)

Read it left to right:

1. **Browser** hits Cloudflare's edge.
2. **Workers / OpenNext** run the Next.js App Router product.
3. **Neon Auth** owns identity and sessions.
4. **Neon Postgres** owns registry, claims, audit, and derived billing state.
5. **Stripe** owns money: checkout, subscriptions, portal, webhooks.
6. **Cloudflare DNS API** owns the external side effect: NS records for delegated claims, DNS-only records for managed claims.
7. **Cloudflare Email** handles transactional/ops mail.

If you only remember one mental model from this post, make it this:

> Postgres is the registry truth. Cloudflare is the DNS side effect. Stripe is the billing truth. Neon Auth is the identity truth. The app is the coordinator.

---

## The Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend / API | Next.js App Router + TypeScript | One app for product UI and route handlers |
| Runtime | Cloudflare Workers via OpenNext | DNS-adjacent product, edge deploy, Wrangler-native ops |
| Database | Neon Postgres + Drizzle | Real relational constraints, partial unique indexes, RLS |
| Auth | Neon Auth / Better Auth | Email/password + GitHub OAuth without owning GoTrue |
| Billing | Stripe | Checkout, portal, renewals, webhook idempotency |
| DNS | Cloudflare DNS API | Zone writes for NS and managed records |
| Email | Cloudflare Email | Lifecycle + abuse/support mail without a third mail vendor |
| Rate limits | Cloudflare KV + memory fallback | Defense-in-depth throttle on mutations |

This is the same Cloudflare gravitational pull I wrote about after moving this blog to the edge. Once the product is already living in DNS and Workers land, fighting that pull just to "self-host harder" is cosplay.

---

## What the Product Actually Does

Under the hood, Cheapbastards is four cooperating systems:

1. **Registry** — users, namespaces, claims, quotas, statuses, audit logs
2. **DNS control plane** — Cloudflare NS writes and managed records
3. **Commercial system** — Stripe checkout, plan limits, renewals, portal
4. **Trust and safety** — auth, RLS, CSRF, rate limits, abuse reports, admin review, expiration lifecycle

A claim is the central object. It ties a user to a label + namespace + FQDN and carries:

- mode: `DELEGATED` or `MANAGED`
- claim status: pending, active, expired soft, parked, reclaimable, suspended, etc.
- DNS status: pending, synced, sync failed
- lifecycle timestamps for verification, expiry, parking, reclaim

Root domains are the platform-owned zones. Namespaces are the claimable suffixes under those roots. That split matters — it lets the product expose different naming surfaces without hardcoding every suffix into the app.

---

## Claim Flows That Matter

### Delegated claim

```txt
User submits label + namespace + nameservers
  → CSRF / auth / rate-limit / validation
  → RLS transaction creates claim + delegation state
  → Cloudflare NS records written in parent zone
  → public DNS verification
  → ACTIVE (unless admin review is required)
```

### Managed claim

```txt
User submits label + namespace + record
  → strict DNS validation by type
  → claim + managed record created
  → Cloudflare DNS-only record written
  → status updated from the result
```

### Billing

```txt
User upgrades
  → POST /api/checkout
  → Stripe Checkout
  → webhook updates subscription + plan
  → success page reconciles local state
```

The hard part is never the happy path. The hard part is the multi-system reality:

- Cloudflare write succeeds, DB write fails
- Stripe says active, local plan is stale
- Neon Auth UUID drifts from an older app user row with the same email
- a claim expires and DNS cleanup partially fails
- zone resolution falls back to the wrong Cloudflare zone

Those are the bugs that turn a demo into a product.

---

## Security Posture Without Theater

Cheapbastards is public-facing and money-touching, so the security model is boring on purpose.

**Auth and identity**

- Neon Auth owns sessions and credentials.
- App user provisioning is separate from auth success.
- Middleware only does lightweight cookie presence redirects.
- Authoritative checks live in server pages and API handlers via `requireAuth()` / `requireAdmin()`.
- Safari/WebKit OAuth cookie races get a `/api/auth/session-ready` probe before dashboard navigation.

**Database**

- Postgres RLS via `withRlsContext(userId, role, fn)`.
- Fresh Neon serverless client per call — no cross-request I/O reuse in Workers.
- Protected fields: role, plan, Stripe customer state, and similar can't be self-escalated by ordinary user updates.

**Request defenses**

- CSRF guard requires JSON, `X-Requested-With`, and same-origin in production.
- Middleware enforces a 1MB body limit and rejects chunked transfer on body-bearing API methods.
- Mutation rate limits fail closed in production if KV is unavailable.
- CSP, frame deny, nosniff, no-store, permissions policy, HTTPS redirect.

**DNS safety**

- Zone resolution prefers explicit root-domain zone IDs, then domain-specific env vars.
- Global `CLOUDFLARE_ZONE_ID` fallback is gated and disabled by default.
- Managed records stay `proxied=false`.
- Reconciliation scripts exist because there is no distributed transaction across Postgres and Cloudflare.

**Account deletion**

Self-service account deletion was intentionally removed. The destructive path touches auth identity, billing, claims, audit logs, DNS cleanup, and recovery. Shipping a half-correct delete button is worse than a support-based closure process. That was one of the better product decisions we made after the audit work.

---

## Lifecycle Is Product Work

Free names without lifecycle become landfill.

We built an expiration processor that can dry-run or apply transitions:

```txt
ACTIVE → EXPIRED_SOFT → PARKED → RECLAIMABLE
```

With:

- 30 / 7 / 1 day reminder emails
- DNS cleanup on park
- retry for failed cleanup
- email event dedupe so the same reminder doesn't spam forever
- reclaim timing based on actual `parked_at`, not wishful thinking

This is the unglamorous half of a registry. If you can't reclaim names safely, the namespace eventually fills with abandoned junk and the product dies of entropy.

---

## The Bugs That Taught Us the Architecture

A few production-shaped failures forced the design to grow up:

**Neon Auth UUID drift.** Same email, older local `users` row, newer auth identity. Checkout provisioning hit the unique email constraint and looked like "billing is broken." It wasn't. Identity reconciliation was broken. Fix: adopt stale same-email rows instead of blindly inserting, plus partial uniqueness for reclaimable names.

**Stripe sync endpoint rot.** Source code said one subscriptions endpoint; the generated OpenNext Worker still carried an older path. Clean rebuild fixed it. Lesson: never trust the last deploy just because git looks right — verify the artifact that actually ships.

**Cancellation filtered too strictly.** Cancel only matched exact Builder price IDs from env. If Stripe had a valid subscription under a different price ID, the UI said "no active Builder subscription." Fix: keep the preferred price match, then fall back carefully when local plan state already says Builder.

**Test-mode webhooks vs live data.** Added a livemode / key-mode mismatch guard so test events can't mutate production state.

**Zone fallback risk.** An unguarded global Cloudflare zone fallback is a footgun that can write records into the wrong zone. Guard it. Prefer fail closed.

**Audit findings that were real.** Provisioning collision during pending deletion, CSRF inconsistency on user mutation routes, managed-record update sync gaps, delegation NS inconsistency, audit FK loss after deletion. Some were fixed immediately. Some were redesigned out of existence. "Looks fine in the happy path" is not a security model.

---

## Deploy Path

Production is Cloudflare Workers through OpenNext:

1. lint / typecheck / build
2. DB verify
3. deploy preflight
4. OpenNext Cloudflare build
5. Wrangler deploy
6. secrets via Wrangler, not committed env files
7. KV + Email bindings declared in config

Preflight is intentionally strict: tracked secret env files, placeholder config, missing Wrangler secrets, secret-looking strings, lint/build failures, dependency advisories, dry-run bundle success.

The same agentic loop I use on HOTK showed up here: write, autoreview, verify findings against real code, fix, retest, deploy. Codex is the cold reviewer of record. Archimedes is the builder — implementation, incident response, migration work, Playwright expectations, deploy preflight, and the long audit trail that kept this from shipping half-finished. I still own product decisions and the non-negotiables. He owns most of the execution surface.

---

## What I Intentionally Did Not Build

This list is as important as the feature list.

- No reverse proxy for user sites
- No shared TLS termination for user content
- No certificate issuance for arbitrary destinations
- No wildcard records at launch
- No immediate reassignment of abused or released names
- No implication that users own the root domain
- No self-service account deletion until the destructive path is redesigned and re-audited
- No pretending KV rate limits are a substitute for edge WAF / strict counters

Every one of those is a way to accidentally become a hosting company, a CA, or a support black hole.

---

## Current Posture

As of this writing, the product is live and the architecture is coherent:

- delegation-first DNS
- managed fallback for simple records
- Neon Auth + app-level provisioning
- Stripe checkout / portal / webhook sync
- claim lifecycle + email events
- abuse report intake + admin moderation paths
- Workers deploy with preflight gates
- Playwright coverage around the intentional security model

There are still honest open edges — Neon Auth email verification hardening, Stripe live-mode cutover discipline, and the usual dependency advisory watch on the Better Auth chain. Those are tracked, not hand-waved.

That's the difference between a weekend toy and a registry I am willing to put my name on.

---

## What I Learned

**Agents are force multipliers when the loop is real.** Archimedes did not "vibe code" this into existence. He implemented against constraints, fixed the production failures, and kept circling back until the gates were green. The useful pattern is still the same: I decide what not to build, he executes the build, Codex reviews cold, and nobody ships on vibes alone.

**DNS products live or die on side effects.** Your Postgres row is not the product. The nameserver answer at the edge is the product. Design for drift, reconciliation, and fail-closed zone selection from day one.

**Delegation is the cleanest free-subdomain model.** If you proxy traffic, you inherit content, TLS, uptime, and abuse at the HTTP layer. If you delegate, you stay a registry.

**Billing bugs are often identity bugs.** Half the "Stripe is broken" moments were user provisioning, plan derivation, or stale local state wearing a Stripe costume.

**Security theater is expensive. Security defaults are cheap.** CSRF-before-auth, body guards, RLS, no GET mutations, no unguarded zone fallbacks — none of these are glamorous. All of them prevent stupid 2 AM pages.

**Delete is harder than create.** Account deletion, claim reclaim, DNS cleanup, audit retention, and Stripe cancellation are where half-finished products leak. If a destructive flow isn't re-audited end to end, don't ship it.

**The edge is the right home for this app.** A DNS registry that already depends on Cloudflare DNS, Workers, KV, and Email does not need a sentimental VPS in the middle. Use the network you're already standing on.

---

## The Code / Links

- Product: [cheapbastards.xyz](https://cheapbastards.xyz)
- Public project notes: [github.com/mentholmike/cheapbastards.xyz](https://github.com/mentholmike/cheapbastards.xyz)
- This site: [github.com/mentholmike/mwyatt.me](https://github.com/mentholmike/mwyatt.me)

If you're building a free subdomain system, steal the delegation-first idea and the "don't become a host" rule. Ignore the branding if your taste is better than mine. And if you find a cleaner way to keep Postgres and Cloudflare DNS from drifting, tell me — Archimedes and I will probably adopt it.
