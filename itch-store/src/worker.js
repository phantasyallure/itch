// Worker entry: routes requests to the same handlers that used to be Pages Functions.
import * as api from '../functions/api/[[path]].js';
import * as uploads from '../functions/uploads/[name].js';
import * as product from '../functions/p/[id].js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const waitUntil = ctx.waitUntil.bind(ctx);

    if (path === '/api' || path.startsWith('/api/')) {
      const parts = path.slice(5).split('/').filter(Boolean).map(decodeURIComponent);
      return api.onRequest({ request, env, params: { path: parts }, waitUntil });
    }
    if (path.startsWith('/uploads/') && request.method === 'GET') {
      const name = decodeURIComponent(path.slice(9));
      if (name) return uploads.onRequestGet({ request, env, params: { name }, waitUntil });
    }
    if (path.startsWith('/p/') && request.method === 'GET') {
      const id = decodeURIComponent(path.slice(3));
      if (id) return product.onRequestGet({ request, env, params: { id }, waitUntil });
    }
    if (path === '/') return env.ASSETS.fetch(new URL('/index.html', request.url));
    if (path === '/admin' || path === '/admin/') {
      return env.ASSETS.fetch(new URL('/admin.html', request.url));
    }
    return env.ASSETS.fetch(request);
  }
};
