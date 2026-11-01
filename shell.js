/* Deep Sea — barra lateral, encabezado y transiciones (todas las pantallas con menú).
 * No cambia la lógica de cada módulo: reutiliza la campana, el buscador y el menú del avatar que ya existen. */
(function(){
  'use strict';
  if (window.__dsiShell) return;
  window.__dsiShell = true;
  const root = document.documentElement;
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;

  const ICONOS = {
    home:   '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    box:    '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    users:  '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .6 3.5 2.3 3.5 5.2"/>',
    truck:  '<rect x="2" y="6" width="12" height="10" rx="1"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    wh:     '<path d="M3 9.5 12 4l9 5.5V20H3z"/><path d="M8 20v-6h8v6"/>',
    cart:   '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7H6"/>',
    route:  '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h8"/>',
    chart:  '<path d="M4 20V10M12 20V4M20 20v-7"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    user:   '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
    gear:   '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
    qr:     '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4"/>',
    menu:   '<path d="M4 7h16M4 12h16M4 17h16"/>',
    help:   '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.7.4-1.1.9-1.1 1.8"/><circle cx="12" cy="17" r=".6"/>'
  };
  const MODS = [
    { id: 'inicio',         t: 'Inicio',          i: 'home',   g: 'Panel', m: 'Panel de control' },
    { id: 'productos',      t: 'Productos',       i: 'box',    g: 'Cadena de custodia', sep: 1 },
    { id: 'proveedores',    t: 'Proveedores',     i: 'users',  g: 'Cadena de custodia' },
    { id: 'recepciones',    t: 'Recepciones',     i: 'truck',  g: 'Cadena de custodia' },
    { id: 'almacenamiento', t: 'Almacenamiento',  i: 'wh',     g: 'Cadena de custodia' },
    { id: 'ventas',         t: 'Ventas',          i: 'cart',   g: 'Cadena de custodia' },
    { id: 'trazabilidad',   t: 'Trazabilidad',    i: 'route',  g: 'Calidad y cumplimiento', sep: 1 },
    { id: 'reportes',       t: 'Reportes',        i: 'chart',  g: 'Calidad y cumplimiento' },
    { id: 'normas',         t: 'Normas y Calidad', i: 'shield', g: 'Calidad y cumplimiento' }
  ];
  const EXTRA = {
    cuenta:        { t: 'Mi cuenta',     i: 'user', g: 'Cuenta' },
    configuracion: { t: 'Configuración', i: 'gear', g: 'Cuenta' },
    ayuda:         { t: 'Ayuda',         i: 'help', g: 'Cuenta' }
  };
  const svg = function(k, cls){ return '<svg viewBox="0 0 24 24" aria-hidden="true"' + (cls ? ' class="' + cls + '"' : '') + '>' + ICONOS[k] + '</svg>'; };
  const dot = function(id){ return '<i class="sh-dot" data-m="' + id + '" hidden></i>'; };
  const esc = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  const pagina = (location.pathname.split('/').pop() || 'inicio.html').replace(/\.html$/, '') || 'inicio';
  const actual = MODS.find(function(m){ return m.id === pagina; }) || EXTRA[pagina] ||
    { t: (document.title.split('—')[0] || 'Deep Sea').trim(), i: 'home', g: '' };

  // ---------- barra lateral ----------
  const side = document.createElement('aside');
  side.className = 'sh-side';
  side.setAttribute('aria-label', 'Navegación principal');
  let h = '<a class="sh-logo" href="inicio.html" aria-label="Deep Sea, ir al inicio"><img src="logo-emblema.png" alt=""></a><nav class="sh-nav">';
  MODS.forEach(function(m){
    if (m.sep) h += '<div class="sh-sep" role="separator"></div>';
    h += '<a class="sh-a" href="' + m.id + '.html"' + (m.id === pagina ? ' aria-current="page"' : '') + ' aria-label="' + esc(m.t) + '">' + svg(m.i) + dot(m.id) + '</a>';
  });
  h += '</nav><div class="sh-foot" id="shFoot"></div>';
  side.innerHTML = h;
  document.body.appendChild(side);

  const navLateral = side.querySelector('.sh-nav');
  try { navLateral.scrollTop = Number(sessionStorage.getItem('dsi_navscroll')) || 0; } catch (e) {}
  (function(){
    const act = navLateral.querySelector('[aria-current]');
    if (!act) return;
    const r = act.getBoundingClientRect(), n = navLateral.getBoundingClientRect();
    if (r.top < n.top || r.bottom > n.bottom) act.scrollIntoView({ block: 'nearest' });
  })();
  navLateral.addEventListener('scroll', function(){ try { sessionStorage.setItem('dsi_navscroll', navLateral.scrollTop); } catch (e) {} });

  // El avatar de siempre pasa abajo en la barra; su menú (Mi cuenta, Configuración, Ayuda, Cerrar sesión) sigue siendo el mismo
  const chip = document.getElementById('userChip');
  if (chip) { chip.dataset.lado = 'derecha'; document.getElementById('shFoot').appendChild(chip); }

  // ---------- encabezado ----------
  const crumb = document.createElement('nav');
  crumb.className = 'sh-crumb';
  crumb.setAttribute('aria-label', 'Ruta');
  crumb.innerHTML = '<span>Deep Sea</span>' + (actual.g ? '<span class="s">›</span><span>' + esc(actual.g) + '</span>' : '') + '<span class="s">›</span><b>' + esc(actual.t) + '</b>';
  topbar.insertBefore(crumb, topbar.firstChild);

  // Celular: logo + sección + nombre del módulo (como el diseño móvil); el avatar queda arriba a la derecha
  const mhead = document.createElement('a');
  mhead.className = 'sh-mhead';
  mhead.href = 'inicio.html';
  mhead.setAttribute('aria-label', 'Deep Sea, ir al inicio');
  mhead.innerHTML = '<span class="lg"><img src="logo-emblema.png" alt=""></span><span class="tx"><small>' + esc(actual.g || 'Deep Sea') + '</small><b>' + esc(actual.m || actual.t) + '</b></span>';
  topbar.insertBefore(mhead, crumb.nextSibling);

  // ---------- nombre del módulo al pasar el cursor (escritorio) ----------
  const tip = document.createElement('div');
  tip.className = 'sh-tipf';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  function verTip(a){
    const r = a.getBoundingClientRect();
    tip.textContent = (a.dataset.base || a.getAttribute('aria-label') || '') + (a.dataset.n ? '  ·  ' + a.dataset.n + (a.dataset.n === '1' ? ' pendiente' : ' pendientes') : '');
    tip.style.top = Math.round(r.top + r.height / 2) + 'px';
    tip.style.left = Math.round(r.right + 16) + 'px';
    tip.classList.add('on');
  }
  function ocultarTip(){ tip.classList.remove('on'); }
  side.addEventListener('mouseover', function(e){ const a = e.target.closest('.sh-a'); a ? verTip(a) : ocultarTip(); });
  side.addEventListener('mouseleave', ocultarTip);
  side.addEventListener('focusin', function(e){ const a = e.target.closest('.sh-a'); a ? verTip(a) : ocultarTip(); });
  side.addEventListener('focusout', ocultarTip);
  side.querySelector('.sh-nav').addEventListener('scroll', ocultarTip);

  // ---------- celular: barra inferior y cajón con el resto de módulos ----------
  const PRINCIPALES = ['inicio', 'recepciones', 'trazabilidad', 'normas'];
  const porId = function(id){ return MODS.find(function(m){ return m.id === id; }); };
  const nombreCorto = { normas: 'Normas', trazabilidad: 'Rastreo' };
  const enBarra = function(id, extra){
    const m = porId(id);
    const centro = id === 'trazabilidad';
    return '<a class="sh-bn' + (centro ? ' mid' : '') + '" href="' + m.id + '.html"' + (m.id === pagina ? ' aria-current="page"' : '') + ' aria-label="' + esc(m.t) + '">' +
      svg(centro ? 'qr' : m.i) + '<span>' + esc(nombreCorto[id] || m.t) + '</span>' + dot(id) + '</a>';
  };
  const resto = MODS.filter(function(m){ return PRINCIPALES.indexOf(m.id) === -1; });
  const bnav = document.createElement('nav');
  bnav.className = 'sh-bnav';
  bnav.setAttribute('aria-label', 'Módulos');
  bnav.innerHTML = enBarra('inicio') + enBarra('recepciones') + enBarra('trazabilidad') + enBarra('normas') +
    '<button type="button" class="sh-bn' + (resto.some(function(m){ return m.id === pagina; }) ? ' on' : '') + '" id="shMas" aria-haspopup="true" aria-expanded="false" aria-controls="shCajon">' + svg('menu') + '<span>Más</span>' + dot('*mas') + '</button>';
  const fondoC = document.createElement('div');
  fondoC.className = 'sh-dbg';
  const cajon = document.createElement('div');
  cajon.className = 'sh-drawer';
  cajon.id = 'shCajon';
  cajon.setAttribute('role', 'dialog');
  cajon.setAttribute('aria-label', 'Más módulos');
  cajon.innerHTML = '<div class="gr"></div><h2>Más módulos</h2><div class="sh-dgrid">' + resto.map(function(m){
    return '<a class="sh-tile" href="' + m.id + '.html"' + (m.id === pagina ? ' aria-current="page"' : '') + '>' + svg(m.i) + '<span>' + esc(m.t) + '</span>' + dot(m.id) + '</a>';
  }).join('') + '</div>';
  document.body.appendChild(fondoC);
  document.body.appendChild(cajon);
  document.body.appendChild(bnav);

  const btnMas = document.getElementById('shMas');
  function cerrarCajon(){ root.classList.remove('sh-cajon'); btnMas.setAttribute('aria-expanded', 'false'); }
  btnMas.addEventListener('click', function(){
    const abre = !root.classList.contains('sh-cajon');
    root.classList.toggle('sh-cajon', abre);
    btnMas.setAttribute('aria-expanded', String(abre));
  });
  fondoC.addEventListener('click', cerrarCajon);
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') cerrarCajon(); });
  window.addEventListener('resize', function(){ if (window.innerWidth > 1000) cerrarCajon(); });


  // ---------- celular: la barra inferior se encoge al bajar y deja solo el módulo abierto ----------
  (function(){
    const keep = bnav.querySelector('[aria-current="page"]') || bnav.querySelector('.sh-bn.on') || btnMas;
    keep.classList.add('sh-keep');
    const movil = window.matchMedia('(max-width:1000px)');
    let ult = window.scrollY || 0, pendiente = false;
    const esCompacta = function(){ return root.classList.contains('sh-compacta'); };
    const expandir = function(){ root.classList.remove('sh-compacta'); };
    function evaluar(){
      pendiente = false;
      if (!movil.matches || root.classList.contains('sh-cajon')) { expandir(); ult = window.scrollY || 0; return; }
      const y = Math.max(0, window.scrollY || 0), d = y - ult;
      const alFondo = window.innerHeight + y >= document.documentElement.scrollHeight - 8;
      if (y <= 40 || d < -8 || alFondo) { if (esCompacta() && (y <= 40 || d < -8)) expandir(); else if (alFondo && d <= 0) expandir(); }
      else if (d > 8 && y > 90) root.classList.add('sh-compacta');
      if (Math.abs(d) > 8 || y <= 40) ult = y;
    }
    window.addEventListener('scroll', function(){ if (!pendiente) { pendiente = true; requestAnimationFrame(evaluar); } }, { passive: true });
    // Con la barra encogida, el primer toque solo la expande (evita abrir un módulo sin querer)
    bnav.addEventListener('click', function(e){
      if (!esCompacta()) return;
      e.preventDefault(); e.stopPropagation(); expandir();
    }, true);
    window.addEventListener('resize', expandir);
  })();

  // ---------- punto rojo: algo pendiente en un módulo ----------
  // Es independiente de las notificaciones leídas: se apaga solo cuando ya no queda nada por hacer.
  const CLAVE_PEND = 'dsi_pendientes_v1';
  let pend = {};
  try { pend = JSON.parse(localStorage.getItem(CLAVE_PEND) || '{}') || {}; } catch (e) { pend = {}; }
  function pintarPend(){
    document.querySelectorAll('.sh-dot').forEach(function(d){
      const id = d.dataset.m;
      const n = id === '*mas' ? resto.reduce(function(t, m){ return t + (Number(pend[m.id]) || 0); }, 0) : (Number(pend[id]) || 0);
      d.hidden = !(n > 0);
      const host = d.parentElement;
      if (host && host.hasAttribute('aria-label')) {
        if (!host.dataset.base) host.dataset.base = host.getAttribute('aria-label');
        host.setAttribute('aria-label', host.dataset.base + (n > 0 ? ' — ' + n + (n === 1 ? ' pendiente' : ' pendientes') : ''));
        host.dataset.n = n > 0 ? String(n) : '';
      }
    });
  }
  function guardarPend(){ try { localStorage.setItem(CLAVE_PEND, JSON.stringify(pend)); } catch (e) {} }
  window.dsiShell = {
    setPendientes: function(obj){ pend = Object.assign({}, pend, obj); guardarPend(); pintarPend(); }
  };
  pintarPend();

  // Lo pendiente se pide con UNA sola consulta liviana (RPC pendientes_resumen) y no cada pocos segundos:
  // al abrir el módulo, al volver a la pestaña (máx. 1 vez por minuto) y cada ~4 min con retraso aleatorio,
  // para que muchos usuarios conectados no consulten todos en el mismo instante.
  let ultimaPend = 0, pidiendo = false;
  async function pedirPend(){
    if (pidiendo || typeof DSI === 'undefined' || typeof supabase === 'undefined') return;
    pidiendo = true;
    try {
      const cli = DSI.cliente();
      if (!cli) return;
      const ses = (await cli.auth.getSession()).data.session;
      if (!ses) return;
      if (pend._uid && pend._uid !== ses.user.id) { pend = {}; pintarPend(); }
      pend._uid = ses.user.id;
      const r = await cli.rpc('pendientes_resumen');
      if (r.error || !r.data) return;
      const nuevo = {};
      ['recepciones', 'almacenamiento', 'trazabilidad'].forEach(function(k){ nuevo[k] = Number(r.data[k]) || 0; });
      if (pagina !== 'normas') nuevo.normas = Number(r.data.normas) || 0;   // Normas actualiza su propio punto al abrirse
      window.dsiShell.setPendientes(nuevo);
      ultimaPend = Date.now();
    } catch (e) { /* el punto es opcional */ }
    finally { pidiendo = false; }
  }
  function proximaPend(){ setTimeout(function(){ if (!document.hidden) pedirPend(); proximaPend(); }, 210000 + Math.random() * 60000); }
  setTimeout(pedirPend, 300 + Math.random() * 700);
  proximaPend();
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && Date.now() - ultimaPend > 60000) pedirPend(); });
  window.dsiShell.refrescar = function(){ if (Date.now() - ultimaPend > 20000) pedirPend(); };

  // ---------- transición al cambiar de módulo ----------
  document.addEventListener('click', function(e){
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    let u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.origin !== location.origin || !/\.html$/.test(u.pathname)) return;
    if (u.pathname === location.pathname && u.search === location.search) return;
    e.preventDefault();
    cerrarCajon();
    root.classList.add('sh-leaving');
    setTimeout(function(){ location.href = a.href; }, 170);
  });
  window.addEventListener('pageshow', function(e){ if (e.persisted) root.classList.remove('sh-leaving'); });
})();
