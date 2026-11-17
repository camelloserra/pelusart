/*
 * app.js — Pelusart
 * Lienzo, herramientas, galería y compartir. JavaScript puro, sin librerías.
 */
(() => {
  'use strict';

  /* =========================================================
   * CONFIGURACIÓN (tocá acá para ajustar cosas)
   * ========================================================= */
  const WORLD_W = 2200;            // tamaño del "mundo" donde se puede dibujar (px)
  const WORLD_H = 1400;            // la mano solo te deja mover hasta estos bordes
  const INK = '#1f1f4d';           // color de la tinta (azul oscuro)
  const ERASER_W = 28;             // grosor de la goma
  const BRUSHES = {                // los 3 trazos del panel "trazo"
    marcador: { width: 7 },
    fino:     { width: 2.2 },
    grueso:   { width: 16 },       // trazo grueso, pleno (sin texturas)
  };
  const PELUSA_SRC = 'img/pelusa.png';   // <- reemplazá ese archivo por tu pelusa (PNG con transparencia)
  const PELUSA_WIDTH = 420;        // ancho de la pelusa en pantalla (px). El alto se calcula solo.
                                   // Usá un PNG bien grande (2 a 3 veces este ancho) para que se vea nítida.
  const MOBILE_FILL = 0.74;        // en pantallas chicas, la pelusa ocupa como máximo esta fracción del ancho/alto
  const EXPORT_SCALE = 2;          // calidad de la imagen que se descarga (2 = el doble de resolución)
  // Instagram no permite publicar por link: en el celular se abre el menú de compartir con la imagen,
  // y en la compu se descarga la imagen y se abre esta página para que la subas.
  const INSTAGRAM_URL = 'https://www.instagram.com/';

  /* =========================================================
   * ESTADO
   * ========================================================= */
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const LS  = 2;                   // resolución de la capa de dibujo (trazos nítidos al guardar)

  const stage = document.getElementById('stage');
  const ctx   = stage.getContext('2d');

  // Capa donde vive el dibujo (separada de la pelusa, así la goma no se la come)
  const layer = document.createElement('canvas');
  layer.width  = Math.round(WORLD_W * LS);
  layer.height = Math.round(WORLD_H * LS);
  const lctx = layer.getContext('2d');
  lctx.scale(LS, LS);

  const pelusa = new Image();
  pelusa.onload = () => resize();
  pelusa.src = PELUSA_SRC;

  // Tamaño de la pelusa en el "mundo" (px de pantalla), respetando la proporción del PNG
  function pelusaSize() {
    const w = PELUSA_WIDTH;
    const ratio = pelusa.naturalWidth ? pelusa.naturalHeight / pelusa.naturalWidth : 1;
    return [w, w * ratio];
  }

  // Versión de la pelusa ya achicada al tamaño exacto en que se va a mostrar.
  // Achicar de a mitades (en vez de un salto enorme) evita que se vea borrosa o con dientes.
  const bitmapCache = new Map();
  function pelusaBitmap(targetW) {
    targetW = Math.max(1, Math.round(targetW));
    if (bitmapCache.has(targetW)) return bitmapCache.get(targetW);

    let src = pelusa;
    let w = pelusa.naturalWidth, h = pelusa.naturalHeight;
    const targetH = Math.max(1, Math.round(targetW * h / w));
    while (w / 2 > targetW) {
      w = Math.max(targetW, Math.round(w / 2));
      h = Math.max(targetH, Math.round(h / 2));
      const step = document.createElement('canvas');
      step.width = w; step.height = h;
      const g = step.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, w, h);
      src = step;
    }
    const out = document.createElement('canvas');
    out.width = targetW; out.height = targetH;
    const g = out.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, targetW, targetH);
    bitmapCache.set(targetW, out);
    return out;
  }

  let vw = 0, vh = 0;              // tamaño de la ventana
  let viewScale = 1;               // zoom con el que se ve el "mundo": 1 en la compu, menos en pantallas chicas
  let camX = 0, camY = 0;          // esquina superior izquierda de lo que se ve, en coordenadas del mundo
  let drawing = false;             // ¿modo "crear" activado?
  let tool  = 'lapiz';             // 'mano' | 'lapiz' | 'goma'
  let brush = 'marcador';
  let strokes = [];                // todos los trazos hechos
  let redo = [];
  let current = null;              // trazo en curso
  let pan = null;                  // arrastre de la mano
  let activePointer = null;
  let needsRender = true;

  /* =========================================================
   * UTILIDADES
   * ========================================================= */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function dirty() {
    if (needsRender) return;
    needsRender = true;
    requestAnimationFrame(render);
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* =========================================================
   * CÁMARA / TAMAÑO
   * ========================================================= */
  // Cuánto "mundo" se ve en pantalla (en unidades del mundo)
  const viewW = () => vw / viewScale;
  const viewH = () => vh / viewScale;

  function clampCam() {
    const W = viewW(), H = viewH();
    camX = W >= WORLD_W ? (WORLD_W - W) / 2 : Math.min(Math.max(camX, 0), WORLD_W - W);
    camY = H >= WORLD_H ? (WORLD_H - H) / 2 : Math.min(Math.max(camY, 0), WORLD_H - H);
    const k = viewScale * dpr;   // alineado a píxeles reales: la pelusa no se "desenfoca" por medios píxeles
    camX = Math.round(camX * k) / k;
    camY = Math.round(camY * k) / k;
  }

  // En pantallas chicas (celular) todo el mundo se ve más chico, para que la pelusa
  // entre completa en el medio con el mismo "espíritu" que en la compu.
  // Como se achica el mundo entero (y no solo la pelusa), tu dibujo mantiene siempre
  // su relación con la pelusa, aunque gires el celular.
  function computeScale() {
    const [pw, ph] = pelusaSize();
    return Math.min(1, (vw * MOBILE_FILL) / pw, (vh * MOBILE_FILL) / ph);
  }

  function resize() {
    // mantener el centro de lo que se ve al cambiar el tamaño de la ventana
    const cx = vw ? camX + viewW() / 2 : WORLD_W / 2;
    const cy = vh ? camY + viewH() / 2 : WORLD_H / 2;
    vw = window.innerWidth;
    vh = window.innerHeight;
    viewScale = computeScale();
    stage.width  = Math.round(vw * dpr);
    stage.height = Math.round(vh * dpr);
    camX = cx - viewW() / 2;
    camY = cy - viewH() / 2;
    clampCam();
    needsRender = false; dirty();
  }

  /* =========================================================
   * DIBUJO
   * ========================================================= */
  function line(c, x0, y0, x1, y1) {
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  }

  // Dibuja el segmento i de un trazo (de punto i-1 a punto i).
  // Es determinista: dibujarlo al vuelo o al rehacer todo da el mismo resultado.
  function segment(c, s, i) {
    const p = s.pts;
    const x1 = p[i * 2], y1 = p[i * 2 + 1];
    const x0 = i ? p[i * 2 - 2] : x1;
    const y0 = i ? p[i * 2 - 1] : y1;

    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';

    if (s.kind === 'erase') {
      c.globalCompositeOperation = 'destination-out';
      c.lineWidth = ERASER_W;
      c.strokeStyle = '#000';
      line(c, x0, y0, x1, y1);
    } else {
      c.strokeStyle = INK;
      c.lineWidth = BRUSHES[s.brush].width;
      line(c, x0, y0, x1, y1);
    }
    c.restore();
  }

  function redrawLayer() {
    lctx.clearRect(0, 0, WORLD_W, WORLD_H);
    for (const s of strokes) {
      for (let i = 0; i < s.pts.length / 2; i++) segment(lctx, s, i);
    }
    dirty();
  }

  function render() {
    needsRender = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, stage.width, stage.height);
    ctx.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, 0, 0);
    ctx.save();
    ctx.translate(-camX, -camY);

    // borde finito del mundo (para que se note hasta dónde se puede mover)
    if (drawing) {
      ctx.strokeStyle = 'rgba(0,0,0,.08)';
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, WORLD_W - 1, WORLD_H - 1);
      ctx.setLineDash([]);
    }

    // 1) tu dibujo, por detrás
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(layer, 0, 0, WORLD_W, WORLD_H);
    // 2) la pelusa, siempre en el centro del mundo y por encima del dibujo
    if (pelusa.complete && pelusa.naturalWidth) {
      const [w, h] = pelusaSize();
      const bmp = pelusaBitmap(w * viewScale * dpr);   // tamaño real en píxeles de pantalla
      ctx.drawImage(bmp, Math.round(WORLD_W / 2 - w / 2), Math.round(WORLD_H / 2 - h / 2), w, h);
    }
    ctx.restore();
  }

  function toWorld(e) {
    return [camX + e.clientX / viewScale, camY + e.clientY / viewScale];
  }

  /* =========================================================
   * PUNTERO (mouse + dedo + lápiz táctil)
   * ========================================================= */
  stage.addEventListener('pointerdown', e => {
    if (!drawing || activePointer !== null) return;
    activePointer = e.pointerId;
    stage.setPointerCapture(e.pointerId);

    if (tool === 'mano') {
      pan = { x: e.clientX, y: e.clientY, cx: camX, cy: camY };
      document.body.classList.add('panning');
      return;
    }
    const [wx, wy] = toWorld(e);
    current = { kind: tool === 'goma' ? 'erase' : 'draw', brush, pts: [wx, wy] };
    segment(lctx, current, 0);
    dirty();
  });

  stage.addEventListener('pointermove', e => {
    if (e.pointerId !== activePointer) return;

    if (pan) {
      camX = pan.cx - (e.clientX - pan.x) / viewScale;
      camY = pan.cy - (e.clientY - pan.y) / viewScale;
      clampCam();
      dirty();
      return;
    }
    if (!current) return;

    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (events.length ? events : [e])) {
      const [wx, wy] = toWorld(ev);
      const n = current.pts.length / 2;
      const lx = current.pts[n * 2 - 2], ly = current.pts[n * 2 - 1];
      if (Math.hypot(wx - lx, wy - ly) < 0.6) continue;   // ignorar micro-movimientos
      current.pts.push(wx, wy);
      segment(lctx, current, n);
    }
    dirty();
  });

  function endPointer(e) {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    if (pan) { pan = null; document.body.classList.remove('panning'); }
    if (current) {
      strokes.push(current);
      redo = [];
      current = null;
      updateButtons();
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  /* =========================================================
   * HERRAMIENTAS Y ACCIONES
   * ========================================================= */
  function setTool(t) {
    tool = t;
    document.body.dataset.tool = t;
    $$('#toolbar .tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  }

  function setBrush(b) {
    brush = b;
    $$('#toolbar .brush').forEach(el => el.classList.toggle('active', el.dataset.brush === b));
    if (tool !== 'lapiz') setTool('lapiz');   // elegir un trazo vuelve al lápiz
  }

  function updateButtons() {
    $('[data-action="deshacer"]').disabled = strokes.length === 0;
    $('[data-action="publicar"]').disabled = strokes.length === 0;
  }

  function startCreating() {
    closeViews();
    drawing = true;
    document.body.classList.add('drawing');
    setTool('lapiz');
    setBrush(brush);
    updateButtons();
    dirty();
  }

  function stopCreating() {
    drawing = false;
    document.body.classList.remove('drawing');
    dirty();
  }

  function undo() {
    if (!strokes.length) return;
    redo.push(strokes.pop());
    redrawLayer();
    updateButtons();
  }
  function redoStroke() {
    if (!redo.length) return;
    strokes.push(redo.pop());
    redrawLayer();
    updateButtons();
  }

  function clearAll() {
    if (!strokes.length) return;
    if (!confirm('¿Borrar todo el dibujo?')) return;
    strokes = []; redo = [];
    redrawLayer();
    updateButtons();
  }

  /* ---------- Exportar a imagen ---------- */
  // Devuelve un canvas con fondo blanco, la pelusa y el dibujo, recortado al contenido.
  function exportCanvas(maxSide = 2400) {
    const [pw, ph] = pelusaSize();
    let x0 = WORLD_W / 2 - pw / 2, y0 = WORLD_H / 2 - ph / 2;
    let x1 = x0 + pw,             y1 = y0 + ph;

    for (const s of strokes) {
      if (s.kind !== 'draw') continue;
      for (let i = 0; i < s.pts.length; i += 2) {
        x0 = Math.min(x0, s.pts[i] - 10);     x1 = Math.max(x1, s.pts[i] + 10);
        y0 = Math.min(y0, s.pts[i + 1] - 10); y1 = Math.max(y1, s.pts[i + 1] + 10);
      }
    }
    const pad = 40;
    x0 = Math.max(0, x0 - pad);       y0 = Math.max(0, y0 - pad);
    x1 = Math.min(WORLD_W, x1 + pad); y1 = Math.min(WORLD_H, y1 + pad);

    const w = x1 - x0, h = y1 - y0;
    const sc = Math.min(EXPORT_SCALE, maxSide / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * sc);
    c.height = Math.round(h * sc);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(layer, x0 * LS, y0 * LS, w * LS, h * LS, 0, 0, c.width, c.height);   // dibujo atrás
    const bmp = pelusaBitmap(pw * sc);                                                 // pelusa adelante, a su resolución exacta
    g.drawImage(bmp, (WORLD_W / 2 - pw / 2 - x0) * sc, (WORLD_H / 2 - ph / 2 - y0) * sc, pw * sc, ph * sc);
    return c;
  }

  function thumbnailDataURL(maxSide = 640) {
    const src = exportCanvas(2400);
    const k = Math.min(1, maxSide / Math.max(src.width, src.height));
    const t = document.createElement('canvas');
    t.width = Math.round(src.width * k);
    t.height = Math.round(src.height * k);
    const g = t.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, t.width, t.height);
    g.drawImage(src, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.85);
  }

  const FILE_MSG = 'Para guardar/publicar abrí la página con un servidor local (mirá el README)';

  // Genera el PNG final (fondo blanco + dibujo + pelusa) como archivo.
  function exportBlob() {
    return new Promise((resolve, reject) => {
      try {
        const c = exportCanvas();
        c.getContext('2d').getImageData(0, 0, 1, 1);   // lanza SecurityError si el navegador bloqueó la imagen
        c.toBlob(b => b ? resolve(b) : reject(new Error('sin imagen')), 'image/png');
      } catch (err) { reject(err); }
    });
  }

  const isTouch = () => matchMedia('(pointer: coarse)').matches;

  function downloadBlob(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mi-pelusart.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // En celulares abre el menú de compartir del sistema con la imagen. Devuelve true si se usó.
  async function shareFile(blob) {
    const file = new File([blob], 'mi-pelusart.png', { type: 'image/png' });
    if (!isTouch() || !navigator.canShare || !navigator.canShare({ files: [file] })) return false;
    try { await navigator.share({ files: [file], title: 'Mi Pelusart' }); return true; }
    catch (err) { return err.name === 'AbortError'; }   // si lo cancelan, no descargamos nada
  }

  async function saveToDevice() {
    let blob;
    try { blob = await exportBlob(); }
    catch (err) { console.error(err); toast(err.name === 'SecurityError' ? FILE_MSG : 'No se pudo generar la imagen'); return; }
    if (await shareFile(blob)) return;      // celular: menú de compartir ("Guardar imagen" va al carrete)
    downloadBlob(blob);
    toast('Guardado en tu dispositivo');
  }

  async function shareInstagram() {
    if (!strokes.length) { toast('Primero dibujá tu Pelusart y después compartilo'); return; }
    // En la compu abrimos la pestaña ya mismo (si esperamos, el navegador bloquea el popup)
    const tab = isTouch() ? null : window.open('', '_blank');
    let blob;
    try { blob = await exportBlob(); }
    catch (err) {
      console.error(err);
      if (tab) tab.close();
      toast(err.name === 'SecurityError' ? FILE_MSG : 'No se pudo generar la imagen');
      return;
    }
    if (await shareFile(blob)) return;      // celular: elegís Instagram en el menú
    downloadBlob(blob);
    if (tab) tab.location.href = INSTAGRAM_URL;
    toast('Descargamos tu imagen: subila a Instagram');
  }

  async function publish() {
    if (!strokes.length) { toast('Dibujá algo alrededor de la pelusa primero'); return; }
    try {
      await PelusartStore.add(thumbnailDataURL());
    } catch (err) {
      console.error(err);
      toast(err.name === 'SecurityError' ? FILE_MSG
          : PelusartStore.remote ? 'No se pudo publicar. Revisá tu conexión e intentá de nuevo'
          : 'No se pudo publicar (sin espacio en el navegador)');
      return;
    }
    strokes = []; redo = [];
    redrawLayer();
    stopCreating();
    await openView('galeria');
    toast('¡Tu Pelusart ya está en la galería!');
  }

  /* =========================================================
   * VISTAS: GALERÍA Y TOP 10
   * ========================================================= */
  const views = { galeria: $('#view-galeria'), top10: $('#view-top10') };

  function closeViews() {
    Object.values(views).forEach(v => v.hidden = true);
  }

  function card(item, rank) {
    const fig = document.createElement('figure');
    fig.className = 'card';
    fig.innerHTML = `
      <div class="frame"><img alt="Pelusart" loading="lazy"></div>
      <figcaption>
        ${rank ? `<span class="rank">${rank}</span>` : '<span></span>'}
        <span class="side">
          ${PelusartStore.isAdmin() ? '<button type="button" class="pill del" title="Borrar para todos">borrar</button>' : ''}
          <button type="button" class="heart ${item.voted ? 'voted' : ''}" aria-label="Votar">
            <span class="h">♥</span><span class="n">${item.votes}</span>
          </button>
        </span>
      </figcaption>`;
    $('img', fig).src = item.img;

    $('.heart', fig).addEventListener('click', async ev => {
      const btn = ev.currentTarget;
      try {
        const res = await PelusartStore.vote(item.id);
        if (!res) return;
        btn.classList.toggle('voted', res.voted);
        $('.n', btn).textContent = res.votes;
        item.votes = res.votes; item.voted = res.voted;
      } catch (err) { console.error(err); toast('No se pudo registrar el voto'); }
    });

    const del = $('.del', fig);
    if (del) del.addEventListener('click', async () => {
      if (!confirm('¿Borrar esta obra para todos? No se puede deshacer.')) return;
      del.disabled = true;
      try {
        await PelusartStore.remove(item);
        fig.remove();
        toast('Obra borrada');
      } catch (err) {
        console.error(err);
        del.disabled = false;
        if (err.status === 401 || err.status === 403) { PelusartStore.logout(); updateAdminBar(); toast('Tu sesión de moderador venció. Ingresá de nuevo'); openLogin(); }
        else toast('No se pudo borrar. Intentá de nuevo');
      }
    });
    return fig;
  }

  let viewToken = 0;   // evita que una respuesta lenta pise a una más nueva
  async function openView(name) {
    const token = ++viewToken;
    closeViews();
    if (drawing) stopCreating();
    const grid = $('.grid', views[name]);
    grid.innerHTML = '<p class="empty">cargando…</p>';
    views[name].hidden = false;
    views[name].scrollTop = 0;

    let list;
    try {
      list = await PelusartStore.list(name === 'top10' ? { top: 10 } : {});
    } catch (err) {
      console.error(err);
      if (token === viewToken) grid.innerHTML = '<p class="empty">No se pudo cargar. Revisá tu conexión y probá de nuevo.</p>';
      return;
    }
    if (token !== viewToken) return;
    grid.innerHTML = '';
    if (!list.length) {
      grid.innerHTML = '<p class="empty">Todavía no hay Pelusarts. ¡Creá el primero!</p>';
    } else {
      list.forEach((it, i) => grid.appendChild(card(it, name === 'top10' ? i + 1 : null)));
    }
  }

  /* =========================================================
   * MODO MODERADOR  (abrí  tu-sitio/#admin )
   * ========================================================= */
  const adminBar = $('#admin-bar'), loginBox = $('#admin-login'), loginForm = $('form', loginBox);

  function updateAdminBar() { adminBar.hidden = !PelusartStore.isAdmin(); }

  function openLogin() {
    if (!PelusartStore.remote) { toast('El modo moderador necesita configurar Supabase (mirá el README)'); return; }
    loginForm.reset();
    $('.err', loginBox).textContent = '';
    loginBox.hidden = false;
    $('[name=email]', loginBox).focus();
  }
  const closeLogin = () => { loginBox.hidden = true; };

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('[type=submit]', loginForm), err = $('.err', loginBox);
    btn.disabled = true; err.textContent = '';
    try {
      await PelusartStore.login(loginForm.email.value.trim(), loginForm.password.value);
      closeLogin(); updateAdminBar();
      toast('Modo moderador activado');
      if (!views.galeria.hidden) openView('galeria'); else if (!views.top10.hidden) openView('top10');
    } catch (ex) {
      console.error(ex);
      err.textContent = 'Email o contraseña incorrectos';
    } finally { btn.disabled = false; }
  });

  function checkAdminHash() {
    if (location.hash === '#admin' && !PelusartStore.isAdmin()) openLogin();
    updateAdminBar();
  }
  window.addEventListener('hashchange', checkAdminHash);

  /* =========================================================
   * CONEXIÓN DE BOTONES
   * ========================================================= */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-tool], [data-brush], [data-action]');
    if (!t) return;

    if (t.dataset.tool)  return setTool(t.dataset.tool);
    if (t.dataset.brush) return setBrush(t.dataset.brush);

    switch (t.dataset.action) {
      case 'galeria':     return openView('galeria');
      case 'top10':       return openView('top10');
      case 'cerrar':      closeViews(); return startCreating();
      case 'admin-cancel':  return closeLogin();
      case 'admin-logout':  PelusartStore.logout(); updateAdminBar(); toast('Saliste del modo moderador');
                            if (!views.galeria.hidden) return openView('galeria');
                            if (!views.top10.hidden) return openView('top10');
                            return;
      case 'borrar-todo': return clearAll();
      case 'guardar':     return saveToDevice();
      case 'instagram':   return shareInstagram();
      case 'deshacer':    return undo();
      case 'publicar':    return publish();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { const wasOpen = Object.values(views).some(v => !v.hidden); closeViews(); closeLogin(); if (wasOpen) startCreating(); }
    const mod = e.ctrlKey || e.metaKey;
    if (drawing && mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? redoStroke() : undo();
    }
  });

  // Deshacer / Listo: abajo al centro, a la altura de "top 10" (aunque cambies esa imagen por otra de otro tamaño).
  // Si no entran entre el menú y el botón de Instagram (celular vertical), suben justo encima del menú.
  function alignActions() {
    const bar = $('#actions'), ref = $('#menu [data-action="top10"]'), menu = $('#menu'), social = $('#social');
    if (!bar || !ref) return;
    const r = ref.getBoundingClientRect();
    if (!r.height) return;
    const w = bar.offsetWidth, W = window.innerWidth;
    const fits = (W - w) / 2 > menu.getBoundingClientRect().right + 12 &&
                 (W + w) / 2 < social.getBoundingClientRect().left - 12;
    if (fits) {
      bar.style.height = r.height + 'px';
      bar.style.bottom = (window.innerHeight - r.bottom) + 'px';
    } else {
      bar.style.height = 'auto';
      bar.style.bottom = (window.innerHeight - menu.getBoundingClientRect().top + 14) + 'px';
    }
  }
  window.addEventListener('load', alignActions);          // cuando ya cargaron las imágenes del menú
  window.addEventListener('resize', alignActions);
  window.addEventListener('orientationchange', () => setTimeout(alignActions, 250));
  alignActions();

  window.addEventListener('resize', resize);
  // Evitar el gesto de "volver" / zoom con el dedo mientras se dibuja
  document.addEventListener('touchmove', e => { if (drawing) e.preventDefault(); }, { passive: false });

  resize();
  updateButtons();
  checkAdminHash();
  startCreating();   // al abrir, ya se puede dibujar (no hace falta un botón "crear")

  // Celular abierto desde un link (WhatsApp, Instagram…): el navegador informa mal el alto de la
  // pantalla al principio y la página queda cortada arriba. Se vuelve a medir varias veces y,
  // si todavía no dibujaste nada, se recarga una sola vez al segundo (lo mismo que hacer "refrescar").
  const remeasure = () => { window.scrollTo(0, 0); resize(); alignActions(); };
  [150, 500, 1000, 2000].forEach(t => setTimeout(remeasure, t));
  if (window.visualViewport) visualViewport.addEventListener('resize', remeasure);
  window.addEventListener('pageshow', remeasure);
  try {
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (coarse && !sessionStorage.getItem('pelusart_refrescado')) {
      sessionStorage.setItem('pelusart_refrescado', '1');
      setTimeout(() => { if (!strokes.length && !current) location.reload(); }, 1000);
    }
  } catch (e) { /* sin sessionStorage: no se recarga */ }
})();
