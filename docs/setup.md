# SingTags setup guide (from zero)

This guide takes you from **no domain and no hosting** to a live HTTPS site. Follow the steps in order.

**Recommended path:** buy the domain at [Namecheap](https://www.namecheap.com/), put DNS on **Cloudflare**, and host the static site on **Amazon S3** (optional **CloudFront** in front of the bucket).

Cloudflare is used for **DNS** (and later, optionally, a **Worker** for [Search by Vibe](plans/vibe-search.md) / Workers AI). You do **not** deploy the SPA to Cloudflare Pages.

Related docs:

- Day-to-day deploy → [publish.md](publish.md)
- Env template → [`deploy/.env.deploy.example`](../deploy/.env.deploy.example)
- Planned AI API → [vibe search](plans/vibe-search.md)

---

## What you are building

SingTags is a **static site**: HTML/JS/CSS plus JSON indexes and media. There is no app server.

| Piece | Role |
| --- | --- |
| Domain (Namecheap) | You own `singtags.com` (or whatever you buy) |
| Cloudflare DNS | Nameservers + DNS records; free HTTPS when proxied |
| Amazon S3 | Stores the SPA, indexes, and `library/` media |
| CloudFront (recommended) | CDN + custom-domain HTTPS in front of S3 |
| Cloudflare Worker (optional, later) | `api.singtags.com` for vibe search — not site hosting |

**Rough cost at hobby traffic:** domain ~$10–15/year; Cloudflare DNS free; S3/CloudFront mostly storage + a little egress. Exact prices change — check vendors when you buy.

---

## Checklist

- [ ] 1. Buy a domain on Namecheap
- [ ] 2. Create a Cloudflare account; add the domain and switch Namecheap nameservers
- [ ] 3. Wait until Cloudflare shows the domain as **Active**
- [ ] 4. Create an AWS account; create an S3 bucket
- [ ] 5. (Recommended) Create CloudFront + ACM cert for the domain
- [ ] 6. Point Cloudflare DNS at CloudFront (or the S3 website endpoint for a quick test)
- [ ] 7. Install Node.js + AWS CLI locally; build once
- [ ] 8. Copy `deploy/.env.deploy.example` → `.env.deploy`; set `S3_BUCKET`
- [ ] 9. Deploy website: `./deploy/publish.sh website`
- [ ] 10. (When ready) Sync media: `./deploy/publish.sh library`
- [ ] 11. Confirm HTTPS and a tag page load

---

## Step 1 — Buy a domain on Namecheap

1. Create a Namecheap account and search for a name (e.g. `singtags.com`).
2. Purchase a **.com** (or another TLD you like).
3. In Namecheap → **Domain List** → **Manage**, note that you will change nameservers in Step 2.

**Privacy:** leave WhoisGuard / domain privacy on if offered.

---

## Step 2 — Cloudflare account + DNS

1. Sign up at [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) (Free plan is fine).
2. **Add a site** → enter your domain → Free plan.
3. Cloudflare shows **two nameservers**. In Namecheap → **Domain List** → **Manage** → **Nameservers** → **Custom DNS**, paste those two hostnames.
4. Wait until Cloudflare shows the domain as **Active** (often minutes; sometimes longer).

Do not attach a Cloudflare Pages project for this app. DNS (and later a Worker subdomain) is enough.

---

## Step 3 — S3 bucket

1. Create an S3 bucket (e.g. `singtags-prod`) in a region you prefer.
2. Typical layout in one bucket:
   - Site at bucket root (or under `S3_PREFIX`)
   - Media under `library/` (`S3_LIBRARY_PREFIX=library`)
3. Install the [AWS CLI](https://docs.aws.amazon.com/cli/) and configure credentials that can `s3 sync` that bucket.

---

## Step 4 — CloudFront + HTTPS (recommended)

1. Request an ACM certificate in **us-east-1** for apex and `www` (required for CloudFront).
2. Create a CloudFront distribution with the S3 bucket as origin (OAC recommended).
3. Configure SPA-friendly error responses so client routes return `index.html` (HTTP 200) for missing paths.
4. Put the distribution id in `.env.deploy` as `CLOUDFRONT_DISTRIBUTION_ID` so deploys can invalidate.

Without CloudFront you can test via the S3 website endpoint, but custom-domain HTTPS is awkward; prefer CloudFront for production.

---

## Step 5 — Point Cloudflare DNS at the site

In Cloudflare DNS for the domain:

- Apex / `www` → CloudFront distribution (CNAME or flattened CNAME / ALIAS as Cloudflare allows)
- Prefer one canonical host; redirect the other with a Redirect Rule

Orange-cloud proxy is fine for DNS/CDN features; the **origin of the SPA remains S3/CloudFront**, not Pages.

---

## Step 6 — Local build

```bash
# Need a local library/ tree (gitignored) for media in dev
python3 build/build_indexes.py

cd web
npm install
npm run build
```

Dev server:

```bash
cd web && npm run dev
```

Vite serves `library/` at `/library`.

---

## Step 7 — Env file

```bash
cp deploy/.env.deploy.example .env.deploy
```

Minimum:

```bash
S3_BUCKET=your-bucket
# S3_PREFIX=singtags
# S3_LIBRARY_PREFIX=library
# VITE_BASE=/singtags/
# VITE_MEDIA_BASE=https://cdn.example/library
# CLOUDFRONT_DISTRIBUTION_ID=EXXXXX
```

`.env.deploy` is gitignored. Never commit tokens or keys.

---

## Step 8 — First website deploy

```bash
./deploy/publish.sh website
```

This builds `web/` and syncs the SPA + indexes to S3 (**never** uploads `library/`). Open the CloudFront URL and verify browse + a tag page.

Redeploy after app or index changes with the same command.

---

## Step 9 — Library media

When you are ready to publish audio/sheets:

```bash
./deploy/publish.sh library
# or both:
./deploy/publish.sh all
```

Set `VITE_MEDIA_BASE` to the public library URL when building if media is not under the same origin `/library` path.

---

## Day-two ops

| Task | Command |
| --- | --- |
| Ship app / indexes | `./deploy/publish.sh website` |
| Rebuild indexes | `python3 build/build_indexes.py` then website publish |
| Refresh media | `./deploy/publish.sh library` |
| Dry run | `DRY_RUN=1 S3_BUCKET=… ./deploy/library_s3.sh` |

Details: [publish.md](publish.md).

---

## Optional later — Cloudflare Worker (vibe search)

DNS can stay on Cloudflare. A Worker on `api.singtags.com` is planned for [Search by Vibe](plans/vibe-search.md) (Workers AI). That is **separate** from hosting the static SPA.

The SPA itself is published only with the S3 scripts above — **not** Cloudflare Pages.

---

## Troubleshooting

| Symptom | Things to check |
| --- | --- |
| Custom domain not HTTPS | ACM cert issued in us-east-1; CloudFront alternate domain names; Cloudflare DNS points at the distribution |
| SPA route 404 on refresh | CloudFront custom error responses → `index.html` |
| Media 404 | `VITE_MEDIA_BASE`; library sync completed; CORS if media is on another host |
| Deploy permission errors | AWS credentials can `s3:PutObject` / `s3:DeleteObject` on the bucket |
