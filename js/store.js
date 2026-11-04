/*
 * store.js — dónde se guardan las obras de la galería.
 *
 * AHORA: todo se guarda en el navegador de cada persona (localStorage).
 *        Sirve para probar y para uso personal, pero la galería NO es compartida:
 *        cada visitante ve solamente lo que hizo él.
 *
 * DESPUÉS: para una galería real y compartida hay que reemplazar el interior de
 *          estas 3 funciones (list / add / vote) por llamadas a un backend
 *          (Supabase, Firebase, tu propio servidor...). El resto de la app no cambia
 *          porque ya las usa como funciones asincrónicas (async).
 */
window.PelusartStore = (() => {
  const KEY_ITEMS = 'pelusart.galeria.v1';
  const KEY_VOTES = 'pelusart.votos.v1';
  const MAX_ITEMS = 60;

  const read = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
    catch { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  return {
    /** Devuelve todas las obras: [{id, created, votes, img, voted}] */
    async list() {
      const items = read(KEY_ITEMS, []);
      const voted = new Set(read(KEY_VOTES, []));
      return items.map(it => ({ ...it, voted: voted.has(it.id) }));
    },

    /** Guarda una obra nueva. `img` es un dataURL (jpeg). */
    async add(img) {
      const items = read(KEY_ITEMS, []);
      items.unshift({ id: uid(), created: Date.now(), votes: 0, img });
      while (items.length > MAX_ITEMS) items.pop();
      // si el navegador se queda sin espacio, vamos soltando las más viejas
      for (;;) {
        try { write(KEY_ITEMS, items); break; }
        catch (e) { if (items.length <= 1) throw e; items.pop(); }
      }
      return items[0];
    },

    /** Vota / quita el voto. Devuelve {votes, voted}. */
    async vote(id) {
      const items = read(KEY_ITEMS, []);
      const voted = new Set(read(KEY_VOTES, []));
      const it = items.find(x => x.id === id);
      if (!it) return null;
      if (voted.has(id)) { voted.delete(id); it.votes = Math.max(0, it.votes - 1); }
      else               { voted.add(id);    it.votes += 1; }
      write(KEY_ITEMS, items);
      write(KEY_VOTES, [...voted]);
      return { votes: it.votes, voted: voted.has(id) };
    },
  };
})();
