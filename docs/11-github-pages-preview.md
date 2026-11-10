# 11 · GitHub Pages preview

GitHub Pages is an additional public preview target. The default `npm run build` and Cloudflare Workers deploy stay at the site root, with `https://keanetravasso.com/` as the canonical URL. Pages builds use the repository’s project path and Pages URL at build time, so internal navigation, assets, canonical metadata, and social preview images point to the preview.

## Automatic deployment

`.github/workflows/pages.yml` builds `site/` with Node.js 24, uploads `site/dist`, and deploys it through GitHub Pages. It runs on pushes to `codex/portfolio` or `main` and can also be started from the repository’s Actions tab. In repository settings, choose **Pages → Build and deployment → GitHub Actions** as the source. The deploy job publishes its live URL in the workflow run’s `github-pages` environment.

The usual project-site URL is `https://<owner>.github.io/<repository>/`; GitHub’s Pages configuration supplies the actual base URL and path to the build. If the repository itself is named `<owner>.github.io`, GitHub serves it at the host root instead.

## Preview differences

- GitHub Pages hosts this preview under its Pages URL. It does not change DNS for `keanetravasso.com`, and the workflow does not add a `CNAME` file or configure a custom domain.
- The output includes `404.html`, which GitHub Pages uses for its not-found response. The site’s explicit navigation links use `.html` file paths so the secondary pages work on both the Pages preview and the Cloudflare Worker.
- Cloudflare’s Worker serves extensionless routes such as `/case-study` through its configured HTML handling. GitHub Pages does not provide that Worker route handling, so use `/case-study.html` there.
- Canonical and social preview URLs in the Pages build use the Pages URL. Cloudflare builds retain the `keanetravasso.com` canonical and social image URLs.

## Local checks

From `site/`, `npm run build -- --base /<repository>/` can reproduce the project-site asset and link paths. Set `SITE_URL` to the full Pages base URL, with or without its final slash, to reproduce its canonical and social metadata. The Pages workflow normalizes both values from GitHub’s `configure-pages` outputs automatically.
