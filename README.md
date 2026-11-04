# Pelusart

Dibujá alrededor de la pelusa. HTML + CSS + JavaScript puro (sin Flash, sin librerías).

## Estructura

```
pelusart/
├── index.html
├── css/style.css
├── js/
│   ├── config.js     ← datos de la galería compartida (Supabase)
│   ├── store.js      ← galería: modo local o compartido
│   └── app.js        ← lienzo, herramientas, vistas, moderador
├── backend/
│   └── supabase-setup.sql   ← se pega una vez en Supabase
└── img/              ← pelusa, logo, menú, toolbar, instagram
```

## Cambiar la pelusa

Reemplazá `img/pelusa.png` (PNG con transparencia, de 1000 a 1500 px de ancho). Se centra sola y
se muestra al ancho de `PELUSA_WIDTH` en `js/app.js` (420 px por defecto). En pantallas chicas se
achica sola (`MOBILE_FILL`).

## Probarla en tu computadora

Guardar y publicar necesitan un servidor (abrir con doble clic hace que el navegador bloquee la
exportación). Con Python: `cd pelusart` y `python3 -m http.server 8000`, y abrí http://localhost:8000.

## Galería compartida (que todos vean todo) — Supabase, gratis

Mientras `js/config.js` esté vacío, la galería es **local**: cada navegador ve solo lo suyo.
Para compartirla:

1. Creá una cuenta en https://supabase.com y un proyecto nuevo (**New project**; región South America).
2. **Authentication → Users → Add user → Create new user**: poné tu email y una contraseña
   (tildá "Auto Confirm User"). Esa es tu cuenta de moderador.
3. **Authentication → Sign In / Providers → Email**: desactivá **"Allow new users to sign up"**.
4. **SQL Editor → New query**: pegá el contenido de `backend/supabase-setup.sql`, reemplazá
   `TU_EMAIL@EJEMPLO.COM` por tu email (el del paso 2) y tocá **Run**.
5. **Project Settings → API Keys** (o el botón **Connect**): copiá la **Project URL** y la clave
   **anon / publishable**, y pegalas en `js/config.js`.
6. Subí los archivos a GitHub (reemplazando los anteriores) y esperá un minuto.

Lo que pueden hacer los visitantes: ver, subir y votar. Borrar, solo vos.

### Moderar (borrar obras)

Entrá a `tu-sitio/#admin`, ingresá con tu email y contraseña: aparece la barra "modo moderador" y un
botón **borrar** en cada obra (galería y top 10). Con **salir** cerrás la sesión (también se cierra
al cerrar la pestaña). Alternativa: Supabase → Table Editor → tabla `pelusarts` → borrar la fila.

### Cosas a saber

- Los votos se recuerdan por navegador: no hay cuentas, así que alguien decidido puede votar de más
  desde otro navegador.
- Como cualquiera puede subir, la moderación es *después* de publicado. Si ves abuso, avisame y
  agregamos aprobación previa.
- El plan gratis de Supabase pausa el proyecto tras ~1 semana sin uso (se reactiva con un clic en el panel).
- Al cambiar `index.html`, `css`, o `js`, subí el número `?v=` de los links para evitar la caché.

## Compartir en Instagram

Instagram no permite publicar por link. En el celular abre el menú de compartir con la imagen; en la
compu descarga la imagen y abre instagram.com para que la subas.
