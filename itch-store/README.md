# Ich store (Cloudflare Worker + D1 + R2)

## Deploy from the Cloudflare dashboard (GitHub)
Workers & Pages > Create > Import a repository, then:
- Root directory: itch-store   (the folder that contains wrangler.toml)
- Build command: (empty)
- Deploy command: npx wrangler deploy

Before the deploy can work, create the database and bucket (Cloudflare dashboard or CLI):
1. D1: create a database named itch-db, copy its ID into wrangler.toml (database_id), then run schema.sql in the database's Console tab.
2. R2: create a bucket named itch-images.
3. Worker > Settings > Variables and secrets: add secret ADMIN_PASSWORD (and TELEGRAM_BOT_TOKEN if you use Telegram).
4. Push to GitHub; the build redeploys.

## Deploy from your computer
1. npx wrangler login
2. npx wrangler d1 create itch-db        -> copy database_id into wrangler.toml
3. npx wrangler r2 bucket create itch-images
4. npx wrangler d1 execute itch-db --remote --file=schema.sql
5. npx wrangler secret put ADMIN_PASSWORD
6. npx wrangler deploy

Shop: https://itch.<your-subdomain>.workers.dev   Admin: same address + /admin
WhatsApp, contact info, social links and pixels are edited in the admin (Settings / Marketing).

## Telegram order alerts
1. In Telegram, open @BotFather, send /newbot, follow the steps, and copy the bot token.
2. Open your new bot and press Start (the bot can only message you after this).
3. Get your chat ID: send any message to @userinfobot, it replies with your ID.
   (For a group: add the bot to the group; the group ID starts with a minus sign.)
4. Put the ID in wrangler.toml as TELEGRAM_CHAT_ID (several IDs: "111,222").
5. Save the token as a secret:  npx wrangler secret put TELEGRAM_BOT_TOKEN
6. Deploy again, then Admin > Settings > "Send test message".

## Product pages
Every product has its own page at /p/<n>-<id> (open a product in the admin and tap "Voir la page du produit" to get the link). Share that link in ads and posts.
