# ICH — Vercel + Supabase

## 1. Supabase
1. Create a project at supabase.com.
2. SQL Editor → New query → paste `supabase.sql` → Run.
3. Project Settings → API: copy the **Project URL** and the **service_role** key (or "secret" key).

## 2. Vercel
1. Push this folder to GitHub (the folder containing `vercel.json` must be the repo root, or set it as Root Directory in Vercel).
2. Vercel → Add New Project → import the repo. Framework: **Other**. No build command.
3. Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SETUP_KEY` (optional, protects owner creation)
4. Deploy, then open `/admin` and create the owner account.

Add contact + pixels in Admin → Settings. Replace `public/img/hero.jpg` to change the background.

## Local test
`npm i -g vercel && npm i && cp .env.example .env.local` (fill it) then `vercel dev`.

## Look & feel
- Luxury-minimal storefront: `public/index.html` + `public/store.css`. Light by default; the ◐ button switches to dark (remembered per visitor).
- Smooth scrolling uses Lenis from a CDN and falls back to normal scrolling if it can't load.
- `public/img/hero.jpg` is the hero and the image band above the footer. `logo.png` / `logo-mark.png` are transparent and flip with the theme.
- `/admin` keeps its own dark style (`public/style.css`).
