# Pelusart

Dibujá alrededor de la pelusa. HTML + CSS + JavaScript puro (sin Flash, sin librerías).

## Estructura

```
pelusart/
├── index.html        ← la página
├── css/style.css     ← estilos
├── js/
│   ├── app.js        ← lienzo, herramientas, galería, compartir
│   └── store.js      ← dónde se guardan las obras (hoy: el navegador)
└── img/
    ├── pelusa.png    ← ¡LA PELUSA! Reemplazá este archivo por el tuyo
    ├── logo.png
    ├── menu-*.png    ← las palabritas del menú
    ├── tool-*.png    ← iconos de la toolbar
    └── social-ig.png ← icono de Instagram
```

## Cambiar la pelusa

Reemplazá `img/pelusa.png` por otro PNG con transparencia (conservá el nombre).
Se centra sola y se muestra al ancho de `PELUSA_WIDTH` (en `js/app.js`, por defecto 420 px);
el alto se calcula respetando la proporción.

**Para que se vea nítida:** usá un PNG de 2 a 3 veces ese ancho (por ejemplo 1000 a 1500 px)
y exportalo con fondo transparente real. El código la achica con calidad para cada pantalla.

## Probarla en tu computadora

Los botones guardar y publicar necesitan que la página se sirva desde un servidor
(abrir el archivo con doble clic hace que el navegador bloquee la exportación).
Lo más fácil, con Python instalado:

```
cd pelusart
python3 -m http.server 8000
```

y abrí http://localhost:8000. Alternativa: la extensión **Live Server** de VS Code.

## Publicarla en internet

Cualquier hosting estático sirve: Netlify (arrastrás la carpeta), GitHub Pages, Cloudflare Pages.

## Compartir en Instagram

Instagram no permite publicar por link. En el celular, el botón abre el menú de compartir con la
imagen (elegís Instagram ahí). En la compu descarga la imagen y abre instagram.com para que la subas.

## Pendiente: galería compartida

Hoy la galería y el Top 10 se guardan en el navegador de cada persona (`localStorage`),
así que cada visitante ve solo lo suyo. Para una galería común hace falta un backend
(Supabase o Firebase son lo más simple). Solo hay que reescribir las 3 funciones de
`js/store.js` (`list`, `add`, `vote`); el resto de la app no cambia.
