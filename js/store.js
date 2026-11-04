/*
 * store.js — dónde se guardan las obras de la galería.
 *
 * Tiene DOS modos, y elige solo según js/config.js:
 *
 *  - LOCAL  (config.js vacío): las obras quedan en el navegador de cada persona (localStorage).
 *           Sirve para probar. Cada visitante ve solamente lo que hizo él.
 *
 *  - COMPARTIDO (config.js con los datos de Supabase): las obras se guardan en internet y
 *           todos ven la misma galería. Además habilita el modo moderador (abrí tu-sitio/#admin)
 *           para poder borrar obras.
 *
 * El resto de la app solo usa: list, add, vote, y para moderar: isAdmin, login, logout, remove.
 */
window.PelusartStore = (() => {
  const cfg = window.PELUSART_CONFIG || {};
  const BASE = String(cfg.SUPABASE_URL || '').replace(/\/+$/, '');
  const KEY = cfg.SUPABASE_ANON_KEY || '';
  const REMOTE = !!(BASE && KEY);

  const BUCKET = 'pelusarts';
  const GALLERY_LIMIT = 100;                     // cuántas obras trae la galería (las más nuevas)
  const KEY_ITEMS = 'pelusart.galeria.v1';       // solo modo local
  const KEY_VOTES = 'pelusart.votos.v1';         // en ambos modos: qué obras votó ESTE navegador
  const KEY_ADMIN = 'pelusart.admin.v1';         // sesión de moderador (se borra al cerrar la pestaña)
  const MAX_LOCAL_ITEMS = 60;

  /* ---------- utilidades ---------- */
  const readLS = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fallback; } catch { return fallback; } };
  const writeLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const readSS = k => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const votedSet = () => new Set(readLS(KEY_VOTES, []));
  const saveVoted = set => { try { writeLS(KEY_VOTES, [...set]); } catch { /* sin espacio: no pasa nada */ } };

  function dataUrlToBlob(dataUrl) {
    const [head, b64] = dataUrl.split(',');
    const mime = (head.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  /* ---------- llamadas a Supabase (REST, sin librerías) ---------- */
  const session = () => {
    const s = readSS(KEY_ADMIN);
    return s && s.token && s.exp > Date.now() ? s : null;
  };

  // Las claves nuevas de Supabase ("sb_publishable_...") no son JWT y van solo en `apikey`;
  // las viejas ("eyJ...") también se mandan como Authorization.
  function headers(extra, token) {
    const h = { apikey: KEY, ...extra };
    if (token) h.Authorization = 'Bearer ' + token;
    else if (KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + KEY;
    return h;
  }

  async function api(path, opts = {}) {
    const res = await fetch(BASE + path, opts);
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  const imgUrl = path => `${BASE}/storage/v1/object/public/${BUCKET}/${path}`;

  /* =========================================================
   * MODO COMPARTIDO (Supabase)
   * ========================================================= */
  const remote = {
    async list({ top } = {}) {
      const order = top ? 'votes.desc,created_at.desc' : 'created_at.desc';
      const limit = top || GALLERY_LIMIT;
      const rows = await api(
        `/rest/v1/pelusarts?select=id,created_at,votes,img_path&order=${order}&limit=${limit}`,
        { headers: headers() }
      );
      const voted = votedSet();
      return rows.map(r => ({
        id: r.id, created: Date.parse(r.created_at), votes: r.votes,
        img: imgUrl(r.img_path), path: r.img_path, voted: voted.has(r.id),
      }));
    },

    async add(dataUrl) {
      const blob = dataUrlToBlob(dataUrl);
      const path = `${uid()}.jpg`;
      await api(`/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }),
        body: blob,
      });
      const rows = await api('/rest/v1/pelusarts', {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ img_path: path }),
      });
      const r = rows && rows[0];
      return { id: r ? r.id : path, created: Date.now(), votes: 0, img: imgUrl(path), path };
    },

    async vote(id) {
      const voted = votedSet();
      const delta = voted.has(id) ? -1 : 1;
      const votes = await api('/rest/v1/rpc/vote_pelusart', {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ p_id: id, p_delta: delta }),
      });
      if (delta > 0) voted.add(id); else voted.delete(id);
      saveVoted(voted);
      return { votes: Number(votes), voted: delta > 0 };
    },

    /* ---- moderador ---- */
    isAdmin: () => !!session(),

    async login(email, password) {
      const r = await api('/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email, password }),
      });
      sessionStorage.setItem(KEY_ADMIN, JSON.stringify({
        token: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 - 30000,
      }));
    },

    logout() { try { sessionStorage.removeItem(KEY_ADMIN); } catch { /* nada */ } },

    async remove(item) {
      const s = session();
      if (!s) { const e = new Error('sin sesión'); e.status = 401; throw e; }
      const rows = await api(`/rest/v1/pelusarts?id=eq.${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
        headers: headers({ Prefer: 'return=representation' }, s.token),
      });
      if (Array.isArray(rows) && rows.length === 0) {     // la base lo rechazó en silencio: no sos el moderador
        const e = new Error('sin permiso'); e.status = 403; throw e;
      }
      if (item.path) {                                      // y borramos también el archivo de la imagen
        try { await api(`/storage/v1/object/${BUCKET}/${item.path}`, { method: 'DELETE', headers: headers({}, s.token) }); }
        catch (err) { console.warn('La obra se borró, pero no se pudo borrar su imagen:', err); }
      }
    },
  };

  /* =========================================================
   * MODO LOCAL (solo este navegador)
   * ========================================================= */
  const local = {
    async list({ top } = {}) {
      const items = readLS(KEY_ITEMS, []);
      const voted = votedSet();
      let out = items.map(it => ({ ...it, voted: voted.has(it.id) }));
      if (top) out = out.sort((a, b) => b.votes - a.votes || b.created - a.created).slice(0, top);
      return out;
    },

    async add(img) {
      const items = readLS(KEY_ITEMS, []);
      items.unshift({ id: uid(), created: Date.now(), votes: 0, img });
      while (items.length > MAX_LOCAL_ITEMS) items.pop();
      for (;;) {   // si el navegador se queda sin espacio, soltamos las más viejas
        try { writeLS(KEY_ITEMS, items); break; }
        catch (e) { if (items.length <= 1) throw e; items.pop(); }
      }
      return items[0];
    },

    async vote(id) {
      const items = readLS(KEY_ITEMS, []);
      const voted = votedSet();
      const it = items.find(x => x.id === id);
      if (!it) return null;
      if (voted.has(id)) { voted.delete(id); it.votes = Math.max(0, it.votes - 1); }
      else               { voted.add(id);    it.votes += 1; }
      writeLS(KEY_ITEMS, items);
      saveVoted(voted);
      return { votes: it.votes, voted: voted.has(id) };
    },

    isAdmin: () => false,
    async login() { throw new Error('El modo moderador requiere configurar Supabase (js/config.js)'); },
    logout() {},
    async remove() { throw new Error('solo modo compartido'); },
  };

  return { remote: REMOTE, ...(REMOTE ? remote : local) };
})();
