const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { promisify } = require('util');
const pbkdf2 = promisify(crypto.pbkdf2);

const PUB = ['phone', 'email', 'fb_pixel', 'tiktok_pixel'];
const STATUSES = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'];

const rnd = () => crypto.randomBytes(24).toString('hex');
const hash = async (p, s) => (await pbkdf2(p, s, 100000, 32, 'sha256')).toString('hex');
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const ok = async (p) => { const { data, error } = await p; if (error) throw error; return data; };
const imgs = (r) => { let i = []; try { i = JSON.parse(r.images || '[]'); } catch {} return { ...r, images: i }; };

let _db;
const getDb = () => _db || (_db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}));

module.exports = async (req, res) => {
  const send = (d, s = 200, h = {}) => {
    res.status(s);
    res.setHeader('Cache-Control', 'no-store');
    for (const k in h) res.setHeader(k, h[k]);
    res.json(d);
  };
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      return send({ error: 'Server not configured (missing Supabase env vars)' }, 500);

    const db = getDb();
    const m = req.method;
    const p = new URL(req.url, 'http://x').pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
    const parts = p.split('/');

    let b = {};
    if (m === 'POST' || m === 'PATCH') {
      b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      if (!b || typeof b !== 'object') b = {};
    }

    const ss = async () => Object.fromEntries((await ok(db.from('settings').select('k,v'))).map((r) => [r.k, r.v]));

    // ---------- public ----------
    if (p === 'products')
      return send((await ok(db.from('products').select('*').eq('active', 1).order('id', { ascending: false }))).map(imgs));

    if (p === 'settings') {
      const s = await ss();
      return send(Object.fromEntries(PUB.map((k) => [k, s[k] || ''])));
    }

    if (p === 'orders' && m === 'POST') {
      const pid = +b.product_id;
      const pr = Number.isInteger(pid)
        ? await ok(db.from('products').select('*').eq('id', pid).eq('active', 1).maybeSingle())
        : null;
      if (!pr || !String(b.full_name || '').trim() || !/^0[5-7]\d{8}$/.test(b.phone || '') || !b.wilaya)
        return send({ error: 'Please check your information.' }, 400);
      await ok(db.from('orders').insert({
        product_id: pr.id, product_name: pr.name, price: pr.price,
        full_name: String(b.full_name).trim().slice(0, 80), phone: b.phone,
        wilaya: String(b.wilaya).slice(0, 40), comment: String(b.comment || '').slice(0, 500),
        size: String(b.size || ''), color: String(b.color || ''),
      }));
      return send({ ok: 1 });
    }

    if (parts[0] !== 'admin') return send({ error: 'Not found' }, 404);

    // ---------- auth ----------
    const { count: n, error: ce } = await db.from('users').select('*', { count: 'exact', head: true });
    if (ce) throw ce;

    if (p === 'admin/setup' && m === 'POST') {
      if (n || (process.env.SETUP_KEY && b.key !== process.env.SETUP_KEY) || !b.email || (b.password || '').length < 8)
        return send({ error: 'Setup refused' }, 403);
      const s = rnd();
      await ok(db.from('users').insert({ email: b.email.toLowerCase(), name: b.name || 'Owner', salt: s, hash: await hash(b.password, s) }));
      return send({ ok: 1 });
    }

    if (p === 'admin/login' && m === 'POST') {
      const u = await ok(db.from('users').select('*').eq('email', (b.email || '').toLowerCase()).maybeSingle());
      if (!u || !safeEq(u.hash, await hash(b.password || '', u.salt))) return send({ error: 'Wrong email or password' }, 401);
      const t = rnd();
      await db.from('sessions').delete().lt('expires', Date.now());
      await ok(db.from('sessions').insert({ token: t, user_id: u.id, expires: Date.now() + 6048e5 }));
      return send({ ok: 1 }, 200, { 'Set-Cookie': `s=${t}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800` });
    }

    const ck = (req.headers.cookie || '').match(/(?:^|; )s=(\w+)/);
    let me = null;
    if (ck) {
      const se = await ok(db.from('sessions').select('user_id').eq('token', ck[1]).gt('expires', Date.now()).maybeSingle());
      if (se) me = await ok(db.from('users').select('id,email,name').eq('id', se.user_id).maybeSingle());
    }
    if (p === 'admin/me') return send({ me, setup: !n });
    if (!me) return send({ error: 'Unauthorized' }, 401);

    if (p === 'admin/logout') {
      await ok(db.from('sessions').delete().eq('token', ck[1]));
      return send({ ok: 1 }, 200, { 'Set-Cookie': 's=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
    }

    // ---------- admin ----------
    if (parts[1] === 'products') {
      if (m === 'GET')
        return send((await ok(db.from('products').select('*').order('id', { ascending: false }))).map(imgs));
      if (m === 'DELETE') {
        await ok(db.from('products').delete().eq('id', +parts[2]));
        return send({ ok: 1 });
      }
      if (!String(b.name || '').trim()) return send({ error: 'Name required' }, 400);
      const f = {
        name: b.name, price: +b.price || 0, description: b.description || '',
        sizes: b.sizes || '', colors: b.colors || '',
        images: JSON.stringify((b.images || []).slice(0, 5)), active: b.active ? 1 : 0,
      };
      if (b.id) await ok(db.from('products').update(f).eq('id', +b.id));
      else await ok(db.from('products').insert(f));
      return send({ ok: 1 });
    }

    if (p === 'admin/orders' && m === 'GET')
      return send(await ok(db.from('orders').select('*').order('id', { ascending: false }).limit(500)));

    if (parts[1] === 'orders' && m === 'PATCH') {
      if (!STATUSES.includes(b.status)) return send({ error: 'Invalid status' }, 400);
      await ok(db.from('orders').update({ status: b.status }).eq('id', +parts[2]));
      return send({ ok: 1 });
    }

    if (p === 'admin/stats') return send(await ok(db.rpc('admin_stats')));

    if (p === 'admin/settings') {
      if (m === 'GET') return send(await ss());
      const rows = PUB.filter((k) => k in b).map((k) => ({ k, v: String(b[k]).trim().slice(0, 120) }));
      if (rows.length) await ok(db.from('settings').upsert(rows, { onConflict: 'k' }));
      return send({ ok: 1 });
    }

    if (parts[1] === 'team') {
      if (m === 'GET') return send(await ok(db.from('users').select('id,email,name').order('id')));
      if (m === 'DELETE') {
        if (+parts[2] !== me.id) await ok(db.from('users').delete().eq('id', +parts[2]));
        return send({ ok: 1 });
      }
      if (!b.email || (b.password || '').length < 8) return send({ error: 'Email and 8+ char password required' }, 400);
      const s = rnd();
      await ok(db.from('users').insert({ email: b.email.toLowerCase(), name: b.name || '', salt: s, hash: await hash(b.password, s) }));
      return send({ ok: 1 });
    }

    return send({ error: 'Not found' }, 404);
  } catch (e) {
    console.error(e);
    return send({ error: e && e.code === '23505' ? 'Already exists' : 'Server error' }, e && e.code === '23505' ? 409 : 500);
  }
};
