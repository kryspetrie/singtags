# SingTags setup guide (from zero)

This guide takes you from **no domain and no hosting** to a live HTTPS site. Follow the steps in order.

**Recommended path:** buy the domain at [Namecheap](https://www.namecheap.com/), put DNS on **Cloudflare** (proxied), and host the static site on a **public Amazon S3 website** bucket. Cloudflare terminates HTTPS; S3 is the origin.

Cloudflare is used for **DNS + HTTPS** (and later, optionally, a **Worker** for [Search by Vibe](plans/vibe-search.md) / Workers AI). You do **not** deploy the SPA to Cloudflare Pages. CloudFront is **not** required for hobby / low traffic.

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
| Cloudflare DNS (proxied) | Nameservers + Universal SSL + optional cache |
| Amazon S3 (website hosting) | Stores the SPA, indexes, and `library/` media (public read) |
| Cloudflare Worker (optional, later) | `api.singtags.com` for vibe search — not site hosting |

**Rough cost at hobby traffic:** domain ~$10–15/year; Cloudflare free; S3 mostly storage + a little egress. Exact prices change — check vendors when you buy.

---

## Checklist

- [ ] 1. Buy a domain on Namecheap
- [ ] 2. Create a Cloudflare account; add the domain and switch Namecheap nameservers
- [ ] 3. Wait until Cloudflare shows the domain as **Active**
- [ ] 4. Create an AWS account; create an S3 bucket with **static website hosting** and public read
- [ ] 5. Point Cloudflare DNS (orange cloud) at the S3 website endpoint
- [ ] 6. Install Node.js + AWS CLI locally; build once
- [ ] 7. Copy `deploy/.env.deploy.example` → `.env.deploy`; set `S3_BUCKET`
- [ ] 8. Deploy website: `./deploy/publish.sh website`
- [ ] 9. (When ready) Sync media: `./deploy/publish.sh library`
- [ ] 10. Confirm HTTPS and a tag page load

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

## Step 3 — S3 bucket (public website)

1. Create an S3 bucket (e.g. `singtags-prod`) in a region you prefer.
2. Enable **Static website hosting**:
   - Index document: `index.html`
   - Error document: `index.html` (SPA routes)
3. Allow a public bucket policy (turn off “Block public policies” / “Restrict public buckets” as needed).
4. Attach a public-read policy for objects, e.g.:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::YOUR-BUCKET/*"
  }]
}
```

5. Typical layout in one bucket:
   - Site at bucket root (or under `S3_PREFIX`)
   - Media under `library/` (`S3_LIBRARY_PREFIX=library`)
6. Install the [AWS CLI](https://docs.aws.amazon.com/cli/) and configure credentials that can `s3 sync` that bucket.

Website endpoint form: `http://YOUR-BUCKET.s3-website-REGION.amazonaws.com`  
(Use this hostname as the Cloudflare origin — not the REST `s3.amazonaws.com` endpoint.)

---

## Step 4 — Point Cloudflare DNS at S3

In Cloudflare DNS for the domain:

- **www** → CNAME to `YOUR-BUCKET.s3-website-REGION.amazonaws.com` — **Proxied** (orange cloud)
- **Apex** → CNAME to the same S3 website host (Cloudflare CNAME flattening) — **Proxied**, or redirect apex → `www` with a Redirect Rule

Prefer one canonical host; redirect the other with a Redirect Rule.

SSL/TLS mode: **Flexible** (Cloudflare → visitor is HTTPS; origin S3 website is HTTP-only). **Full** / Full (strict) will 525 against the S3 website endpoint.

Orange-cloud proxy is required for HTTPS on the custom domain. The **origin of the SPA remains S3**, not Pages.

Optional SPA polish: a Cloudflare Transform / Redirect rule so unknown paths still serve `/index.html` if the S3 error document is not enough.

---

## Step 5 — Local build

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

## Step 6 — Env file

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
```

`.env.deploy` is gitignored. Never commit tokens or keys.

---

## Step 7 — First website deploy

```bash
./deploy/publish.sh website
```

This builds `web/` and syncs the SPA + indexes to S3 (**never** uploads `library/`). Open `https://your-domain` (Cloudflare) and verify browse + a tag page.

Redeploy after app or index changes with the same command.

---

## Step 8 — Library media

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
| Custom domain not HTTPS | Cloudflare proxy (orange cloud) on; SSL/TLS mode **Flexible** (S3 website is HTTP-only; Full causes 525) |
| SPA route 404 on refresh | S3 website error document `index.html`; optional Cloudflare rewrite |
| Media 404 | `VITE_MEDIA_BASE`; library sync completed; CORS if media is on another host |
| Deploy permission errors | AWS credentials can `s3:PutObject` / `s3:DeleteObject` on the bucket |
| AccessDenied on public URL | Bucket policy allows `s3:GetObject`; public policy not blocked |
