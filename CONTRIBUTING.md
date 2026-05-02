# Contributing & local setup

## Contact modal (single source)

The demo form markup lives in **`partials/contact-modal.html`**. Pages keep region markers:

`<!-- @partial contact-modal.html -->` … `<!-- @/partial contact-modal.html -->`

After editing that file, regenerate the inlined HTML everywhere:

```bash
npm run build
```

Commit **`partials/contact-modal.html`** and the updated **`index.html`**, **`blog/index.html`**, and **`blog/post.html`**.

Logic (open/close/validation) stays in **`/scripts.js`** (loaded root-relative).

## Sanity & Netlify (blog)

Copy **`.env.example`** → **`.env`** in the repo root. For automated posts (`npm run publish:daily-blog`), set the four keys listed there. For **Netlify** (blog read + sitemap/RSS), add **`SANITY_PROJECT_ID`** in site env and optional **`SITE_ORIGIN`** (see **`.env.example`** Netlify note).

Studio: **`studio/.env`** with **`SANITY_STUDIO_PROJECT_ID`** (same project id — see **`studio/.env.example`**).

```bash
cd studio && npm install && npm run dev
```

Serve the marketing site locally with redirects and functions:

```bash
netlify dev
```

(Netlify runs **`npm install && npm run build`** before deploy; that includes injecting partials.)

## Sitemap & RSS

Production **`https://www.maliapp.co.il/sitemap.xml`** is served by **Netlify** via **`netlify/functions/sitemap.js`** (`netlify.toml` redirect). Do not add a static `sitemap.xml` in this repo—it would confuse the setup. **`robots.txt`** keeps pointing crawlers at the live **`/sitemap.xml`** URL.

## Paths

Prefer **root-relative** asset and script URLs (e.g. **`/scripts.js`**, **`/assets/…`**) so pages work from `/blog/` routes and matches Netlify Dev.
