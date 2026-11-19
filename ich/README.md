# ICH — Vercel only (no Supabase)

All data (products, orders, settings, sessions) is stored in a
Redis database created **inside Vercel**. There is no SQL and no tables to set up:
the code creates everything on first use.

## Deploy
1. Push this folder to GitHub (the folder containing `vercel.json` must be the repo root, or set it as Root Directory in Vercel).
2. Vercel → Add New Project → import the repo. Framework: **Other**. No build command. Deploy.
3. In the project: **Storage → Create Database → Upstash (Redis)** → connect it to the project.
   Vercel adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
4. Add env var **`ADMIN_PASSWORD`** (Settings → Environment Variables). This is the only admin password.
5. **Redeploy** (so the new env vars are picked up), then open `/admin` and sign in with that password.

Footer text, contacts, social links and pixels are all edited in Admin → Settings. Replace `public/img/hero.jpg` to change the background.

## Local test
`npm i -g vercel && npm i && vercel env pull .env.local && vercel dev`

## Notes
- Product images are resized in the browser (max 800px) and stored with the product. Keep to a few images per product (limit is about 900 KB per product).
- Sessions expire by themselves after 7 days.

## Look & feel
- Luxury-minimal storefront: `public/index.html` + `public/store.css`. Light by default; the ◐ button switches to dark (remembered per visitor).
- Smooth scrolling uses Lenis from a CDN and falls back to normal scrolling if it can't load.
- `public/img/hero.jpg` is the hero and the image band above the footer. `logo.png` / `logo-mark.png` are transparent and flip with the theme.
- `/admin` keeps its own dark style (`public/style.css`).
