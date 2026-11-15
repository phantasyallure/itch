# ICH — Cloudflare Pages + D1
1. `npm i -g wrangler && wrangler login`
2. `wrangler d1 create ich` → paste the database_id into wrangler.toml
3. `wrangler d1 execute ich --remote --file=schema.sql`
4. `wrangler pages deploy public --project-name ich` (run from this folder)
5. Open `/admin` → create the owner account. (Optional: set a SETUP_KEY variable in Pages settings first so nobody else can claim it.)
Add contact + pixels in Admin → Settings. Replace `public/img/hero.jpg` to change the background.
