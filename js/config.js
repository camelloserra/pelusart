/*
 * config.js — conexión con la galería compartida (Supabase).
 *
 * Mientras estos dos datos estén vacíos, la galería funciona en modo LOCAL
 * (cada persona ve solo lo suyo). Para que todos vean todo, completalos
 * siguiendo el README ("Galería compartida").
 *
 * No hay problema en que estos datos sean visibles: la "anon key" está pensada
 * para ir en la página. Lo que protege la galería son las reglas del archivo
 * backend/supabase-setup.sql (cualquiera puede ver, subir y votar; solo vos podés borrar).
 */
window.PELUSART_CONFIG = {
  SUPABASE_URL: '',        // ej: 'https://abcdefgh.supabase.co'
  SUPABASE_ANON_KEY: '',   // la clave "anon public" (empieza con 'eyJ...' o 'sb_publishable_...')
};
