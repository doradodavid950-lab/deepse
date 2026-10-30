/* Campana de notificaciones — Deep Sea Intelligence
 * Un solo archivo para TODAS las páginas. Se agrega con esta línea, antes de </body>:
 *   <script src="campana.js"></script>
 *
 * Administrador: productos y recepciones nuevos de los establecimientos (7 días),
 *                controles de calidad pendientes de revisión y normas por verificar.
 * Auditor:       controles de calidad pendientes de revisión.
 * Establecimiento: el resultado de sus controles y normas revisados (30 días),
 *                  con el motivo de la decisión.
 * Las notificaciones leídas se guardan en este dispositivo.
 */
(function(){
  'use strict';

  const SUPABASE_URL = 'https://lohxgdeuohhczejyxwgr.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_QpRophkYS0o554DGxKBWmQ_P1fs8NPW';

  const cont = document.getElementById('notificationContent');
  const badge = document.getElementById('notificationBadge');
  const btn = document.getElementById('notificationBtn');
  const marcarTodas = document.getElementById('markAllRead');
  if (!cont || !badge || !btn) return;

  const estilo = document.createElement('style');
  estilo.textContent =
    '.nt-item{display:flex;align-items:center;gap:12px;padding:10px;border-radius:14px;color:inherit;text-decoration:none}' +
    '.nt-item:hover{background:#F3F8FF}' +
    '.nt-ic{width:36px;height:36px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex:none}' +
    '.nt-ic.t-warn{background:#FFE3E0;color:#D93A35}' +
    '.nt-ic.t-pend{background:#FFF1D1;color:#B27300}' +
    '.nt-ic.t-info{background:#DCEBFF;color:#1E66F5}' +
    '.nt-ic.t-ok{background:#D6F7E2;color:#12804F}' +
    '.nt-body{flex:1;min-width:0}' +
    '.nt-body strong{display:block;font-size:14px}' +
    '.nt-body span{display:block;font-size:12.5px;color:#5B7089;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.nt-body em{font-style:normal;font-size:11.5px;color:#8DA0B8}' +
    '.nt-go{color:#9AB0C9;font-size:20px}';
  document.head.appendChild(estilo);

  const ICONO = {
    warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3v12" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>',
    pend: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3v12" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v5" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="8" r=".9" fill="currentColor"/></svg>',
    ok: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5 9-10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  const PALABRAS_PROBLEMA = ['rechaz', 'dano', 'danad', 'deterior', 'vencid', 'cancelad', 'inactiv', 'no apto'];
  const PALABRAS_PENDIENTE = ['pendiente', 'evaluacion', 'revision', 'observ'];

  function norm(t){
    return String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  function clasificar(estado){
    const e = norm(estado);
    if (PALABRAS_PROBLEMA.some(function(p){ return e.indexOf(p) !== -1; })) return 'warn';
    if (PALABRAS_PENDIENTE.some(function(p){ return e.indexOf(p) !== -1; })) return 'pend';
    return 'ok';
  }
  function esc(t){
    return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function kg(n){
    return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' kg';
  }
  function fecha(v){
    if (!v) return '';
    const f = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00') : new Date(v);
    return isNaN(f.getTime()) ? '' : f.toLocaleDateString('es-CO');
  }
  function nombreRel(rel){
    const r = Array.isArray(rel) ? rel[0] : rel;
    return (r && r.nombre) || '';
  }
  function hace(dias){
    return Date.now() - dias * 86400000;
  }
  function recientes(valor, dias){
    if (!valor) return false;
    const t = new Date(valor).getTime();
    return !isNaN(t) && t >= hace(dias);
  }

  let uid = null;
  let items = [];
  let cliente = null;
  let canalTiempoReal = null;
  let timerRecarga = null;
  let cargando = false;
  let recargaPendiente = false;
  let ultimaCarga = 0;
  let vistasAlInicio = new Set();
  let vistasUid = null;

  function programarRecarga(){
    if (timerRecarga) clearTimeout(timerRecarga);
    timerRecarga = setTimeout(function(){ cargar(); }, 120);
  }

  function conectarTiempoReal(idUsuario, esAdmin, esAuditor){
    if (!cliente || !cliente.channel || !idUsuario) return;
    if (canalTiempoReal) { try { cliente.removeChannel(canalTiempoReal); } catch (e) {} }
    let canal = cliente.channel('dsi-notificaciones-' + idUsuario);
    // Las vistas no emiten eventos Realtime: escuchar también sus tablas base.
    ['productos','recepciones','ventas','proveedores','almacenamientos','ajustes_inventario'].forEach(function(tabla){
      canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, programarRecarga);
    });
    if (esAdmin || esAuditor) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'controles_calidad' }, programarRecarga);
    canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'producto_normas' }, programarRecarga);
    canalTiempoReal = canal.subscribe();
  }

  function leidas(){
    if (!uid) return new Set();
    try { return new Set(JSON.parse(localStorage.getItem('dsi_notif_leidas_' + uid) || '[]')); }
    catch (e) { return new Set(); }
  }
  function guardarLeidas(set){
    if (!uid) return;
    try { localStorage.setItem('dsi_notif_leidas_' + uid, JSON.stringify(Array.from(set).slice(-400))); } catch (e) {}
  }

  // Opciones de Configuración (se guardan en este dispositivo)
  function prefs(){
    const base = { campana:true, stock:true, resultados:true, nuevos:true, revisar:true };
    let p = base;
    try { p = Object.assign(base, JSON.parse(localStorage.getItem('dsi_prefs_v1') || '{}')); } catch (e) { p = base; }
    // "Mi cuenta" guarda el interruptor de la campana por separado: lo último elegido ahí también cuenta
    try {
      const n = localStorage.getItem('deepsea_notificaciones');
      if (n === 'off') p.campana = false; else if (n === 'on') p.campana = true;
    } catch (e) {}
    return p;
  }
  function prefOk(i, p){
    const k = i.key || '';
    if (k.indexOf('stock:') === 0) return p.stock;
    if (k.indexOf('ctrlr:') === 0 || k.indexOf('pnr:') === 0) return p.resultados;
    if (k.indexOf('np:') === 0 || k.indexOf('nr:') === 0) return p.nuevos;
    if (k.indexOf('ctrlp:') === 0 || k.indexOf('npv:') === 0) return p.revisar;
    return true;
  }

  function pintar(){
    observador.disconnect();
    const leer = leidas();
    const p = prefs();
    const wrap = document.getElementById('notifWrap');
    if (wrap) wrap.hidden = !p.campana;
    const visibles = items.filter(function(i){ return !leer.has(i.key) && !vistasAlInicio.has(i.key) && prefOk(i, p); }).slice(0, 40);

    cont.innerHTML = visibles.length
      ? visibles.map(function(i){
          return '<a class="nt-item" href="' + esc(i.href) + '" data-key="' + esc(i.key) + '">' +
            '<div class="nt-ic t-' + i.tipo + '">' + ICONO[i.tipo] + '</div>' +
            '<div class="nt-body"><strong>' + esc(i.titulo) + '</strong><span>' + esc(i.texto) + '</span>' +
            (i.fecha ? '<em>' + esc(i.fecha) + '</em>' : '') + '</div>' +
            '<span class="nt-go">›</span></a>';
        }).join('')
      : '<div class="notification-empty">No tienes notificaciones nuevas.</div>';

    badge.textContent = visibles.length > 9 ? '9+' : String(visibles.length);
    badge.classList.toggle('show', visibles.length > 0);
    if (marcarTodas) marcarTodas.style.display = visibles.length ? '' : 'none';
    btn.setAttribute('aria-label', visibles.length ? 'Notificaciones (' + visibles.length + ' sin leer)' : 'Notificaciones');
    observador.observe(cont, { childList: true });
  }

  const observador = new MutationObserver(function(){ pintar(); });
  observador.observe(cont, { childList: true });

  // Al abrir la campana se recuerdan las notificaciones vistas para no repetirlas
  // al cambiar de módulo o cerrar y volver a iniciar sesión. Siguen visibles en esta vista.
  btn.addEventListener('click', function(){
    if (!uid) return;
    try {
      const key = 'dsi_notif_vistas_' + uid;
      const guardadas = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
      items.forEach(function(i){ guardadas.add(i.key); });
      localStorage.setItem(key, JSON.stringify(Array.from(guardadas).slice(-800)));
    } catch (e) {}
  });

  cont.addEventListener('click', function(e){
    const a = e.target.closest('.nt-item');
    if (!a) return;
    const set = leidas();
    set.add(a.dataset.key);
    guardarLeidas(set);
  });

  if (marcarTodas) {
    marcarTodas.addEventListener('click', function(){
      const set = leidas();
      items.forEach(function(i){ set.add(i.key); });
      guardarLeidas(set);
      pintar();
    });
  }

  async function cargar(){
    if (!window.supabase) return;
    if (cargando) { recargaPendiente = true; return; }
    cargando = true;
    try {
      if (!cliente) cliente = (window.DSI && window.DSI.cliente) ? window.DSI.cliente() : window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const sesion = await cliente.auth.getSession();
      const sess = sesion.data && sesion.data.session;
      if (!sess) { items = []; uid = null; if (canalTiempoReal) { try { cliente.removeChannel(canalTiempoReal); } catch (e) {} canalTiempoReal = null; } pintar(); return; }
      const uidAnterior = uid;
      uid = sess.user.id;
      if (vistasUid !== uid) {
        vistasUid = uid;
        try { vistasAlInicio = new Set(JSON.parse(localStorage.getItem('dsi_notif_vistas_' + uid) || '[]')); }
        catch (e) { vistasAlInicio = new Set(); }
      }

      // Pintar una copia de la última carga mientras se consultan los datos actuales.
      // Así el usuario ve la campana inmediatamente al cambiar de módulo.
      try {
        const cache = JSON.parse(sessionStorage.getItem('dsi_notif_cache_' + uid) || 'null');
        if (cache && Array.isArray(cache.items)) {
          items = cache.items;
          pintar();
        }
      } catch (e) {}

      const perfil = await cliente.from('perfiles').select('rol').eq('id', uid).maybeSingle();
      const rol = perfil.data && perfil.data.rol;
      const esAdmin = rol === 'administrador';
      const esAuditor = rol === 'auditor';
      if (uidAnterior !== uid || !canalTiempoReal) conectarTiempoReal(uid, esAdmin, esAuditor);

      const [prod, rec, prov, inv, ctrl, pnorm, perfiles] = await Promise.all([
        cliente.from('productos').select('id,nombre,estado,creado_por,created_at')
          .order('created_at', { ascending: false, nullsFirst: false }).limit(200),
        cliente.from('recepciones').select('id,peso,estado_producto,fecha_recepcion,creado_por,created_at,productos(nombre)')
          .order('fecha_recepcion', { ascending: false, nullsFirst: false }).limit(200),
        cliente.from('proveedores').select('id,nombre,estado'),
        cliente.from('inventario_productos').select('producto_id,nombre,disponible,estado_stock'),
        cliente.from('controles_calidad').select('id,estado_revision,comentario_revision,fecha_control,fecha_revision,creado_por,productos(nombre)')
          .order('fecha_control', { ascending: false, nullsFirst: false }).limit(200),
        cliente.from('producto_normas').select('id,producto_id,estado,comentario_revision,fecha_revision,creado_por,productos(nombre),normas_catalogo(codigo,nombre)').limit(300),
        esAdmin ? cliente.from('perfiles').select('id,nombre,nombre_establecimiento') : Promise.resolve({ data: [] })
      ]);

      const nombres = new Map();
      ((perfiles && perfiles.data) || []).forEach(function(p){
        nombres.set(p.id, p.nombre_establecimiento || p.nombre || 'Establecimiento');
      });
      const quien = function(id){ return nombres.get(id) || 'un establecimiento'; };

      const lista = [];

      // ---------- Administrador: lo nuevo y lo que falta revisar ----------
      if (esAdmin) {
        ((prod.data) || []).forEach(function(p){
          if (p.creado_por === uid || !recientes(p.created_at, 7)) return;
          lista.push({ key: 'np:' + p.id, tipo: 'info', titulo: 'Nuevo producto',
            texto: p.nombre + ' — ' + quien(p.creado_por), fecha: fecha(p.created_at), href: 'productos.html?id=' + encodeURIComponent(p.id) });
        });
        ((rec.data) || []).forEach(function(r){
          if (r.creado_por === uid || !recientes(r.created_at, 7)) return;
          lista.push({ key: 'nr:' + r.id, tipo: 'info', titulo: 'Nueva recepción',
            texto: nombreRel(r.productos) + ' — ' + kg(r.peso) + ' · ' + quien(r.creado_por),
            fecha: fecha(r.fecha_recepcion), href: 'recepciones.html?id=' + encodeURIComponent(r.id) });
        });
      }

      // ---------- Revisores (administrador y auditor): controles pendientes ----------
      if (esAdmin || esAuditor) {
        ((ctrl.data) || []).forEach(function(c){
          if (c.estado_revision !== 'Pendiente' || c.creado_por === uid) return;
          lista.push({ key: 'ctrlp:' + c.id, tipo: 'pend', titulo: 'Control por revisar',
            texto: nombreRel(c.productos) + ' — ' + quien(c.creado_por), fecha: fecha(c.fecha_control), href: 'normas.html?control=' + encodeURIComponent(c.id) + '#controles' });
        });
      }
      if (esAdmin) {
        ((pnorm.data) || []).forEach(function(n){
          if (n.estado !== 'Declarada' || n.creado_por === uid) return;
          const norma = n.normas_catalogo || {};
          lista.push({ key: 'npv:' + n.id, tipo: 'pend', titulo: 'Norma por verificar',
            texto: nombreRel(n.productos) + ' — ' + (norma.codigo || '') + ' ' + (norma.nombre || '') + ' · ' + quien(n.creado_por),
            fecha: '', href: 'normas.html?producto=' + encodeURIComponent(n.producto_id) + '#productos' });
        });
      }

      // ---------- Establecimiento: resultado de la revisión ----------
      ((ctrl.data) || []).forEach(function(c){
        if (c.creado_por !== uid || (c.estado_revision !== 'Aprobado' && c.estado_revision !== 'Rechazado')) return;
        if (!recientes(c.fecha_revision, 30)) return;
        const aprobado = c.estado_revision === 'Aprobado';
        lista.push({ key: 'ctrlr:' + c.id + ':' + c.estado_revision,
          tipo: aprobado ? 'ok' : 'warn',
          titulo: 'Control ' + (aprobado ? 'aprobado' : 'rechazado') + ' por el revisor',
          texto: nombreRel(c.productos) + (c.comentario_revision ? ' — Motivo: ' + c.comentario_revision : ''),
          fecha: fecha(c.fecha_revision), href: 'normas.html?control=' + encodeURIComponent(c.id) + '#controles' });
      });
      ((pnorm.data) || []).forEach(function(n){
        if (n.creado_por !== uid || (n.estado !== 'Verificada' && n.estado !== 'Rechazada')) return;
        if (!recientes(n.fecha_revision, 30)) return;
        const ok = n.estado === 'Verificada';
        const norma = n.normas_catalogo || {};
        lista.push({ key: 'pnr:' + n.id + ':' + n.estado,
          tipo: ok ? 'ok' : 'warn',
          titulo: 'Norma ' + (ok ? 'verificada' : 'rechazada'),
          texto: nombreRel(n.productos) + ' — ' + (norma.codigo || '') + (!ok && n.comentario_revision ? ' · Motivo: ' + n.comentario_revision : ''),
          fecha: fecha(n.fecha_revision), href: 'normas.html?producto=' + encodeURIComponent(n.producto_id) + '#productos' });
      });

      // ---------- Todos: alertas de inventario y de proveedores ----------
      ((inv.data) || []).forEach(function(i){
        if (i.estado_stock === 'OK' || !i.estado_stock) return;
        const agotado = i.estado_stock === 'Agotado';
        lista.push({ key: 'stock:' + i.producto_id + ':' + i.estado_stock,
          tipo: agotado ? 'warn' : 'pend',
          titulo: agotado ? 'Producto agotado' : 'Stock bajo',
          texto: i.nombre + ' — disponible ' + kg(i.disponible),
          fecha: '', href: 'almacenamiento.html?producto=' + encodeURIComponent(i.producto_id) + '#invSec' });
      });
      ((rec.data) || []).forEach(function(r){
        const estado = r.estado_producto || 'Fresco';
        const clase = clasificar(estado);
        if (clase === 'ok' || (esAdmin && r.creado_por !== uid)) return;
        lista.push({ key: 'rec:' + r.id + ':' + norm(estado), tipo: clase,
          titulo: 'Recepción ' + estado.toLowerCase(),
          texto: nombreRel(r.productos) + ' — ' + kg(r.peso),
          fecha: fecha(r.fecha_recepcion), href: 'recepciones.html?id=' + encodeURIComponent(r.id) });
      });
      ((prov.data) || []).forEach(function(p){
        if (norm(p.estado) !== 'inactivo') return;
        lista.push({ key: 'prov:' + p.id, tipo: 'info', titulo: 'Proveedor inactivo',
          texto: p.nombre || 'Proveedor', fecha: '', href: 'proveedores.html?id=' + encodeURIComponent(p.id) });
      });

      items = lista;
      try { sessionStorage.setItem('dsi_notif_cache_' + uid, JSON.stringify({ savedAt: Date.now(), items: lista })); } catch (e) {}
      pintar();
      ultimaCarga = Date.now();
    } catch (e) { /* sin conexión: se vuelve a intentar */ }
    finally {
      cargando = false;
      if (recargaPendiente) { recargaPendiente = false; programarRecarga(); }
    }
  }

  // Cargar en cuanto el SDK esté disponible; no esperar 1,5 segundos en cada módulo.
  if (window.supabase) cargar();
  else {
    const sdk = document.getElementById('sdk');
    if (sdk) {
      sdk.addEventListener('load', cargar, { once: true });
      sdk.addEventListener('error', function(){ setTimeout(cargar, 800); }, { once: true });
    } else {
      window.addEventListener('load', cargar, { once: true });
    }
  }
  setInterval(function(){ if (!document.hidden && Date.now() - ultimaCarga > 45000) cargar(); }, 45000);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) cargar(); });
})();
