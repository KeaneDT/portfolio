# 07 · Deploy on Cloudflare (cheap, fast, nothing to maintain)

The domain **keanetravasso.com** is registered on Cloudflare. The site is fully static, so it runs on **Workers static assets** (the current recommended way; Cloudflare steers new static sites here). Static asset requests are free and unlimited on the free plan; the only recurring cost is the domain renewal.

> Cloudflare's product UI changes often. If a menu name below does not match, search the dashboard for "Custom domains" under the Worker. The CLI path (`wrangler`) is the stable one.

## One-time setup
```bash
cd site
npm install
npx wrangler login        # opens a browser, authorises your Cloudflare account
npm run deploy            # = vite build && wrangler deploy
```
`wrangler.jsonc` already points `assets.directory` at `./dist` and needs no Worker script.

## Attach the domain
1. Cloudflare dashboard → **Workers & Pages** → your worker (`keanetravasso-portfolio`) → **Settings → Domains & Routes → Add → Custom domain** → `keanetravasso.com`.
2. Add `www.keanetravasso.com` the same way, then create a **Redirect Rule** (Rules → Redirect Rules) `www` → `https://keanetravasso.com` (301, preserve path).
3. SSL/TLS mode **Full (strict)** (default for Workers custom domains). Turn on **Always Use HTTPS**.

Because the domain's DNS is already on Cloudflare, attaching a custom domain creates the DNS record for you.

## Updating the site
Edit → `npm run deploy`. Every deploy is atomic and instantly live; roll back from the worker's *Deployments* tab. Optional: connect the GitHub repo in the dashboard for deploy-on-push (Workers Builds), build command `npm run build`, root directory `site`.

## Headers and caching
Add `site/public/_headers` (served as-is):
```
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```
Vite fingerprints files in `/assets/`, so the immutable year-long cache is safe. HTML stays revalidated.

## Email for the contact address
The footer shows `hello@keanetravasso.com` as a **placeholder**. To make it real for free: Cloudflare dashboard → **Email → Email Routing** → enable for the domain, add `hello@` → forward to your personal inbox (verify it). Replying *as* `hello@` needs a send service (Gmail "Send mail as" with an SMTP relay) and is optional. Test it by emailing it from another account before launch.

## Analytics (optional, privacy-friendly)
Cloudflare **Web Analytics** (free, no cookies, no consent banner). Add the snippet to `index.html` only; do not add third-party trackers to a portfolio.

## Cost summary
| Item | Cost |
|---|---|
| Domain `.com` at Cloudflare | at-cost registrar price per year (check the current figure in the dashboard) |
| Hosting (Workers static assets) | free tier is ample for a portfolio |
| Email Routing | free |
| Web Analytics | free |

## Troubleshooting
- **Blank page, console says WebGL2 unavailable:** expected on very old devices; the `.no-gl` fallback should show. If it does not, that is a bug: see `base.css`.
- **404 on `/case-study`:** the build emits `case-study.html`; `html_handling: auto-trailing-slash` serves it at `/case-study`. Link with the extension during development.
- **Old assets after deploy:** hard refresh; HTML is revalidated, assets are fingerprinted.
