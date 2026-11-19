const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

const PUB = ['phone', 'email', 'whatsapp', 'address', 'instagram', 'facebook', 'tiktok', 'footer_text', 'fb_pixel', 'tiktok_pixel'];
const STATUSES = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const MAX_PRODUCT_BYTES = 900 * 1024; // Upstash request limit is 1 MB

const rnd = () => crypto.randomBytes(24).toString('hex');

// Works with the Vercel/Upstash integration (KV_REST_API_*) or plain Upstash vars.
let _db;
const getDb = () => {
  if (_db) return _db;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return (_db = new Redis({ url, token }));
};

// ---- tiny data layer on top of Redis (no tables, no SQL, created on first write) ----
const ids = async (db, set) => (await db.zrange(set, 0, -1, { rev: true })).map(Number); // newest first
const getMany = async (db, prefix, list) => {
  if (!list.length) return [];
  const rows = await db.mget(...list.map((i) => `${prefix}:${i}`));
  return rows.filter(Boolean);
};
const create = async (db, name, data) => {
  const id = await db.incr(`seq:${name}`);
  const row = { id, ...data, created_at: new Date().toISOString() };
  await db.set(`${name}:${id}`, row);
  await db.zadd(`${name}s`, { score: id, member: id });
  return row;
};
const remove = async (db, name, id) => {
  await db.del(`${name}:${id}`);
  await db.zrem(`${name}s`, id);
};

module.exports = async (req, res) => {
  const send = (d, s = 200, h = {}) => {
    res.status(s);
    res.setHeader('Cache-Control', 'no-store');
    for (const k in h) res.setHeader(k, h[k]);
    res.json(d);
  };
  try {
    const db = getDb();
    if (!db) return send({ error: 'Database not connected (add Upstash Redis in Vercel → Storage)' }, 500);

    const m = req.method;
    const p = new URL(req.url, 'http://x').pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
    const parts = p.split('/');

    let b = {};
    if (m === 'POST' || m === 'PATCH') {
      b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      if (!b || typeof b !== 'object') b = {};
    }

    const ss = async () => (await db.hgetall('settings')) || {};

    // ---------- public ----------
    if (p === 'products') {
      const all = await getMany(db, 'product', await ids(db, 'products'));
      return send(all.filter((x) => x.active));
    }

    if (p === 'settings') {
      const s = await ss();
      return send(Object.fromEntries(PUB.map((k) => [k, String(s[k] ?? '')])));
    }

    if (p === 'orders' && m === 'POST') {
      const pid = +b.product_id;
      const pr = Number.isInteger(pid) ? await db.get(`product:${pid}`) : null;
      if (!pr || !pr.active || !String(b.full_name || '').trim() || !/^0[5-7]\d{8}$/.test(b.phone || '') || !b.wilaya)
        return send({ error: 'Please check your information.' }, 400);
      await create(db, 'order', {
        product_id: pr.id, product_name: pr.name, price: pr.price,
        full_name: String(b.full_name).trim().slice(0, 80), phone: b.phone,
        wilaya: String(b.wilaya).slice(0, 40), comment: String(b.comment || '').slice(0, 500),
        size: String(b.size || ''), color: String(b.color || ''), status: 'new',
      });
      return send({ ok: 1 });
    }

    if (parts[0] !== 'admin') return send({ error: 'Not found' }, 404);

    // ---------- auth (single password from Vercel env var, stateless signed cookie) ----------
    const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || process.env.SETUP_KEY || '').trim();
    const sha = (x) => crypto.createHash('sha256').update(String(x)).digest();
    const sign = (exp) => crypto.createHmac('sha256', sha('ich-session:' + ADMIN_PASSWORD)).update(String(exp)).digest('hex');
    const COOKIE = (v, age) => `ich_s=${v}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;

    if (p === 'admin/login' && m === 'POST') {
      if (!ADMIN_PASSWORD) return send({ error: 'ADMIN_PASSWORD is not set in Vercel (then redeploy)' }, 500);
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
      const rk = `rl:${ip}`;
      const tries = await db.incr(rk);
      if (tries === 1) await db.expire(rk, 900);
      if (tries > 10) return send({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
      if (!crypto.timingSafeEqual(sha(String(b.password || '').trim()), sha(ADMIN_PASSWORD))) return send({ error: 'Wrong password' }, 401);
      await db.del(rk);
      const exp = Date.now() + 7 * 864e5;
      return send({ ok: 1 }, 200, { 'Set-Cookie': COOKIE(`${exp}.${sign(exp)}`, 604800) });
    }

    let me = null;
    if (ADMIN_PASSWORD) {
      const ck = (req.headers.cookie || '').match(/(?:^|;\s*)ich_s=(\d+)\.([0-9a-f]{64})/);
      if (ck && +ck[1] > Date.now() && crypto.timingSafeEqual(Buffer.from(ck[2]), Buffer.from(sign(ck[1])))) me = { admin: true };
    }
    if (p === 'admin/me') return send({ me, configured: !!ADMIN_PASSWORD });
    if (!me) return send({ error: 'Unauthorized' }, 401);

    if (p === 'admin/logout') return send({ ok: 1 }, 200, { 'Set-Cookie': COOKIE('', 0) });

    // ---------- admin ----------
    if (parts[1] === 'products') {
      if (m === 'GET') return send(await getMany(db, 'product', await ids(db, 'products')));
      if (m === 'DELETE') {
        await remove(db, 'product', +parts[2]);
        return send({ ok: 1 });
      }
      if (!String(b.name || '').trim()) return send({ error: 'Name required' }, 400);
      const f = {
        name: b.name, price: +b.price || 0, description: b.description || '',
        sizes: b.sizes || '', colors: b.colors || '',
        images: (Array.isArray(b.images) ? b.images : []).slice(0, 5), active: b.active ? 1 : 0,
      };
      if (JSON.stringify(f).length > MAX_PRODUCT_BYTES)
        return send({ error: 'Images are too large. Use fewer or smaller images.' }, 413);
      if (b.id) {
        const old = await db.get(`product:${+b.id}`);
        if (!old) return send({ error: 'Not found' }, 404);
        await db.set(`product:${old.id}`, { ...old, ...f });
      } else await create(db, 'product', f);
      return send({ ok: 1 });
    }

    if (p === 'admin/orders' && m === 'GET')
      return send(await getMany(db, 'order', (await ids(db, 'orders')).slice(0, 500)));

    if (parts[1] === 'orders' && m === 'PATCH') {
      if (!STATUSES.includes(b.status)) return send({ error: 'Invalid status' }, 400);
      const o = await db.get(`order:${+parts[2]}`);
      if (o) await db.set(`order:${o.id}`, { ...o, status: b.status });
      return send({ ok: 1 });
    }

    if (p === 'admin/stats') {
      const all = await getMany(db, 'order', await ids(db, 'orders'));
      const live = all.filter((o) => o.status !== 'cancelled');
      const top = (key, name) => {
        const g = {};
        for (const o of all) { const k = key(o); (g[k] = g[k] || { n: name(o), c: 0 }).c++; }
        return Object.values(g).sort((a, b) => b.c - a.c).slice(0, 6);
      };
      const since = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10);
      const days = {};
      for (const o of all) {
        const d = String(o.created_at).slice(0, 10);
        if (d >= since) days[d] = (days[d] || 0) + 1;
      }
      return send({
        total: { c: live.length, r: live.reduce((s, o) => s + (o.price || 0), 0), n: live.filter((o) => o.status === 'new').length },
        products: top((o) => o.product_id, (o) => o.product_name),
        wilayas: top((o) => o.wilaya, (o) => o.wilaya),
        days: Object.keys(days).sort().map((n) => ({ n, c: days[n] })),
      });
    }

    if (p === 'admin/settings') {
      if (m === 'GET') return send(await ss());
      const rows = Object.fromEntries(PUB.filter((k) => k in b).map((k) => [k, String(b[k]).trim().slice(0, 300)]));
      if (Object.keys(rows).length) await db.hset('settings', rows);
      return send({ ok: 1 });
    }

    return send({ error: 'Not found' }, 404);
  } catch (e) {
    console.error(e);
    return send({ error: 'Server error' }, 500);
  }
};
