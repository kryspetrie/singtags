# SingTags setup guide (from zero)

This guide takes you from **no domain and no hosting** to a live site on HTTPS. Follow the steps in order.

**Recommended path:** buy the domain at [Namecheap](https://www.namecheap.com/), put DNS on **Cloudflare**, host the app on **Cloudflare Pages**, and (when media gets large) store sheets/audio on **Cloudflare R2**.

You do **not** need Amazon AWS for the recommended path. An AWS (S3 + CloudFront) appendix is at the end if you prefer that later.

Related docs:

- Day-to-day deploy commands → [PUBLISH.md](PUBLISH.md)
- Env template → [`.env.deploy.example`](../.env.deploy.example) at repo root

---

## What you are building

SingTags is a **static site**: HTML/JS/CSS plus JSON indexes and media files. There is no server app to run.

| Piece | Role |
| --- | --- |
| Domain (Namecheap) | You own `singtags.com` (or whatever you buy) |
| Cloudflare DNS | Points the domain at Pages; free HTTPS |
| Cloudflare Pages | Serves the Vue app + indexes |
| Cloudflare R2 (optional later) | Cheap object storage for large `sample-data` (audio, sheets) |

**Rough cost at hobby traffic:** domain ~$10–15/year; Cloudflare free tier covers DNS, Pages, and a large amount of R2 egress for typical personal use. Exact prices change — check Namecheap and Cloudflare when you buy.

---

## Checklist (print this)

- [ ] 1. Pick and buy a domain on Namecheap
- [ ] 2. Create a Cloudflare account
- [ ] 3. Add the domain to Cloudflare and switch Namecheap nameservers
- [ ] 4. Wait until Cloudflare shows the domain as **Active**
- [ ] 5. Install Node.js locally; build the site once
- [ ] 6. Create a Cloudflare Pages project and deploy
- [ ] 7. Attach the custom domain to Pages; confirm HTTPS works
- [ ] 8. (Optional) Add R2 for media when the library is too big for Pages
- [ ] 9. Save `.env.deploy` so future publishes are one command

---

## Step 1 — Buy a domain on Namecheap

1. Create a Namecheap account and search for a name (e.g. `singtags.com`).
2. Purchase a **.com** (or another TLD you like). Prefer annual renewal you can live with.
3. In Namecheap → **Domain List** → **Manage**, note:
   - Domain name
   - That you will **change nameservers** in Step 3 (do not rely on Namecheap “BasicDNS” for the live site)

**Privacy:** Namecheap usually includes WhoisGuard / domain privacy on many TLDs — leave it on.

**Email:** You do not need email on this domain for SingTags. If you later want `hello@yourdomain`, use Cloudflare Email Routing or a mailbox provider; that is separate from site hosting.

---

## Step 2 — Create a Cloudflare account

1. Sign up at [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. Verify your email.
3. Stay on the **Free** plan unless you know you need more.

You will use this account for DNS, Pages, and later R2.

---

## Step 3 — Point Namecheap DNS at Cloudflare

### 3a. Add the site in Cloudflare

1. Cloudflare dashboard → **Add a domain** (or **Add site**).
2. Enter the domain you bought (e.g. `singtags.com`).
3. Choose the **Free** plan.
4. Cloudflare scans existing DNS records. You can accept defaults for now; Pages will add what it needs later.
5. Cloudflare shows **two nameservers**, something like:

   ```text
   ada.ns.cloudflare.com
   bob.ns.cloudflare.com
   ```

   Copy both exactly (yours will differ).

### 3b. Change nameservers at Namecheap

1. Namecheap → **Domain List** → **Manage** → **Nameservers**.
2. Change from **Namecheap BasicDNS** (or whatever is selected) to **Custom DNS**.
3. Paste the two Cloudflare nameservers (one per field).
4. Save.

### 3c. Wait for activation

- Cloudflare will show the domain as **Pending** until it sees the new nameservers.
- Propagation is often under an hour; it can take up to 24–48 hours.
- Do not continue to “custom domain on Pages” until the domain is **Active** in Cloudflare.

**Tip:** Keep Namecheap as the **registrar** (where you renew and pay). Cloudflare only becomes the **DNS host**. You renew at Namecheap; you edit DNS records in Cloudflare.

---

## Step 4 — Prepare the project on your machine

### 4a. Prerequisites

- **Node.js** 20+ (LTS is fine): [https://nodejs.org/](https://nodejs.org/)
- **npm** (comes with Node)
- This repo cloned or copied locally
- Sample (or full) data already built under `sample-data/` and indexes under `web/public/indexes/` — see [PUBLISH.md](PUBLISH.md) if you still need to seed/rasterize/index

### 4b. Install and smoke-test locally

```bash
cd web
npm install
npm run build
npm run preview
```

Open the preview URL and confirm home/browse/tag pages load.

### 4c. Deploy env file

From the **repo root**:

```bash
cp .env.deploy.example .env.deploy
```

For the recommended path, start with something like:

```bash
# .env.deploy
CF_PAGES_PROJECT=singtags
BRANCH=main
SYNC_MEDIA=1
VITE_BASE=/
```

`SYNC_MEDIA=1` bundles `sample-data` into the Pages upload. That is fine for the **250-tag sample**. For the full ~7k library, skip to Step 8 (R2) instead of uploading everything to Pages.

---

## Step 5 — Create Cloudflare Pages and deploy

### 5a. Log in with Wrangler (once)

```bash
npx wrangler login
```

A browser window opens; authorize the Cloudflare account that owns your domain.

### 5b. Create the Pages project (once)

```bash
npx wrangler pages project create singtags
```

Use the same name as `CF_PAGES_PROJECT` in `.env.deploy`. Production branch: `main` is fine even if you are not using Git integration (direct upload).

### 5c. First publish

```bash
./scripts/publish.sh pages
```

This builds `web/` and uploads `web/dist` to Pages. When it finishes, Wrangler prints a `*.pages.dev` URL — open it and verify the site.

SPA routes (`/tag/123`, etc.) are covered by `web/public/_redirects`.

### 5d. Redeploy later

Whenever you change the app or rebuild indexes/media:

```bash
./scripts/publish.sh pages
```

---

## Step 6 — Attach your Namecheap domain to Pages

1. Cloudflare dashboard → **Workers & Pages** → your **singtags** project.
2. **Custom domains** → **Set up a custom domain**.
3. Enter:
   - Apex: `singtags.com` (or your real domain)
   - and/or `www.singtags.com`
4. Cloudflare creates the DNS records automatically (usually a CNAME for `www`, and either CNAME flattening or equivalent for the apex).
5. Wait until the status shows **Active** and SSL is provisioned (often a few minutes after the domain is Active in Cloudflare).

### Recommended DNS shape

| Host | Type | Target | Proxy |
| --- | --- | --- | --- |
| `@` (apex) | Managed by Pages custom domain | Pages | Proxied (orange cloud) |
| `www` | CNAME → apex or Pages hostname | … | Proxied |

Pick one canonical host (apex **or** `www`) and redirect the other in Pages → **Custom domains** / Redirect Rules so you do not serve two origins.

### Verify

1. Visit `https://yourdomain.com` (and `www` if configured).
2. Confirm the padlock (HTTPS).
3. Open a tag URL and refresh — Vue Router should not 404.

---

## Step 7 — Day-two ops (keep this short)

| Task | Command / place |
| --- | --- |
| Ship a new app build | `./scripts/publish.sh pages` |
| Rebuild indexes only | `python3 scripts/build_indexes.py` then publish |
| Refresh sample media | seed/rasterize scripts in [PUBLISH.md](PUBLISH.md), then publish (or R2 sync) |
| Domain renewal | Namecheap Domain List |
| DNS / SSL issues | Cloudflare dashboard for that domain |

Secrets stay in `.env.deploy` (gitignored). Never commit API tokens.

---

## Step 8 — When to add R2 (full library / large media)

Use R2 when:

- Full-library audio + sheets are too large or slow to upload to Pages every time, or
- You want media on `media.yourdomain.com` and the app shell on the apex.

### 8a. Create an R2 bucket

1. Cloudflare dashboard → **R2** → enable R2 if prompted.
2. **Create bucket**, e.g. `singtags-media`.
3. Note your **Account ID** (R2 overview sidebar).

### 8b. API token for uploads

1. R2 → **Manage R2 API Tokens** → create a token with **Object Read & Write** on that bucket.
2. Save **Access Key ID** and **Secret Access Key** once.

Add to `.env.deploy`:

```bash
R2_BUCKET=singtags-media
R2_ACCOUNT_ID=your_32_char_account_id
AWS_ACCESS_KEY_ID=…
AWS_SECRET_ACCESS_KEY=…
```

### 8c. Public access for the browser

Browsers must be able to GET objects over HTTPS.

1. On the bucket → **Settings** → **Custom Domains** → connect `media.yourdomain.com` (Cloudflare will add DNS).
2. Or use an R2.dev public subdomain for testing only.

Then set media base to that host **including** the `sample-data` path segment your app expects:

```bash
VITE_MEDIA_BASE=https://media.yourdomain.com/sample-data
SYNC_MEDIA=0
```

Upload media:

```bash
MEDIA_ONLY=1 SYNC_MEDIA=1 ./scripts/deploy_r2.sh
```

Redeploy the app shell so it is built with `VITE_MEDIA_BASE`:

```bash
./scripts/publish.sh pages
```

CORS: if sheets/audio fail in the browser console with CORS errors, on the R2 bucket add a CORS rule allowing your site origin (`https://yourdomain.com`) and methods `GET` / `HEAD`.

---

## Architecture (recommended)

```text
Namecheap          Cloudflare                         Visitors
─────────          ──────────                         ────────
Registrar    →     DNS (nameservers)
                   Pages  →  https://yourdomain.com     ←── HTTPS
                   R2     →  https://media.… (optional) ←── media
```

Local machine runs `./scripts/publish.sh` to push builds; nothing runs “in production” except Cloudflare’s static edge.

---

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Domain stuck **Pending** in Cloudflare | Nameservers at Namecheap match Cloudflare’s pair exactly; wait longer; `dig NS yourdomain.com` |
| `*.pages.dev` works, custom domain does not | Domain **Active**; custom domain status on the Pages project; SSL still provisioning |
| Hard refresh on `/tag/123` 404s | `_redirects` present in deploy (`/* /index.html 200`); redeploy Pages |
| Blank page / wrong asset URLs | `VITE_BASE=/` for apex hosting; do not set a prefix unless the site lives under a path |
| Media 404 after split to R2 | `VITE_MEDIA_BASE` matches the public URL; objects under `…/sample-data/tags/…`; rebuild+redeploy app after changing env |
| `wrangler login` fails | Use the same Cloudflare account that owns the domain; try again in a normal browser profile |

---

## Appendix A — AWS instead (S3 + CloudFront)

Only if you want AWS. More moving parts: IAM user, S3 bucket, CloudFront distribution, ACM certificate in **us-east-1**, Route 53 **or** Namecheap DNS records pointing at CloudFront.

High level:

1. Create an S3 bucket (block public access; CloudFront will use **OAC**).
2. Request ACM cert in **us-east-1** for `yourdomain.com` + `www` (DNS validation — add CNAMEs at Cloudflare or Namecheap).
3. Create CloudFront distribution → S3 origin with OAC; alternate domain names = your domain; custom error responses **403/404 → `/index.html` status 200**.
4. Point DNS: CNAME/ALIAS `www` and apex to the CloudFront domain name.
5. Deploy:

   ```bash
   # .env.deploy
   S3_BUCKET=your-bucket
   S3_PREFIX=
   CLOUDFRONT_DISTRIBUTION_ID=E123…
   SYNC_MEDIA=1
   ./scripts/publish.sh s3
   ```

Details for sync flags and cache headers: [PUBLISH.md](PUBLISH.md).

For a first launch, prefer Cloudflare Pages (main steps above).

---

## Appendix B — Decision guide

| Goal | Choice |
| --- | --- |
| Fastest path to HTTPS + custom domain | Namecheap + Cloudflare DNS + Pages |
| Lowest ops complexity | Same (no AWS account) |
| Huge media library | Pages for app + R2 for `sample-data` |
| Already deep in AWS | S3 + CloudFront (Appendix A) |
| Keep renewing the domain | Always at **Namecheap** (registrar) |

---

## Appendix C — Suggested order of purchases / clicks

1. Buy domain on Namecheap (~10 minutes).
2. Create Cloudflare account; add domain; copy nameservers (~10 minutes).
3. Paste nameservers into Namecheap; wait for **Active** (minutes to hours).
4. Meanwhile: `npm install` / `npm run build` locally.
5. `wrangler login` → create Pages project → `./scripts/publish.sh pages`.
6. Attach custom domain in Pages; test `https://…`.
7. Later: R2 only when media size forces it.

When this checklist is done, bookmark [PUBLISH.md](PUBLISH.md) for routine deploys.
