/* Campana de notificaciones — Deep Sea Intelligence
 * Un solo archivo para TODAS las páginas. Se agrega con esta línea, antes de </body>:
 *   <script src="campana.js"></script>
 * Calcula y muestra: recepciones con problemas o pendientes, productos y
 * proveedores inactivos, stock bajo o agotado, y controles de calidad
 * (rechazados para el establecimiento, pendientes para el auditor) y normas de
 * producto (rechazadas o por vencer para el establecimiento, por revisar para el auditor).
 * Las notificaciones leídas se guardan en este dispositivo y se respetan
 * al cambiar de módulo.
 */
(function(){
  'use strict';

  if (!window.DSI) return;   // requiere supabase-config.js (ya cargado por cada página)

  const cont = document.getElementById('notificationContent');
  const badge = document.getElementById('notificationBadge');
  const btn = document.getElementById('notificationBtn');
  const marcarTodas = document.getElementById('markAllRead');
  if (!cont || !badge || !btn) return;

  // Estilos propios (no dependen de la página)
  const estilo = document.createElement('style');
  estilo.textContent =
    '.nt-item{display:flex;align-items:center;gap:12px;padding:10px;border-radius:14px;color:inherit;text-decoration:none}' +
    '.nt-item:hover{background:#F3F8FF}' +
    '.nt-ic{width:36px;height:36px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex:none}' +
    '.nt-ic.t-warn{background:#FFE3E0;color:#D93A35}' +
    '.nt-ic.t-pend{background:#FFF1D1;color:#B27300}' +
    '.nt-ic.t-info{background:#DCEBFF;color:#1E66F5}' +
    '.nt-body{flex:1;min-width:0}' +
    '.nt-body strong{display:block;font-size:14px}' +
    '.nt-body span{display:block;font-size:12.5px;color:#5B7089;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.nt-body em{font-style:normal;font-size:11.5px;color:#8DA0B8}' +
    '.nt-go{color:#9AB0C9;font-size:20px}';
  document.head.appendChild(estilo);

  const ICONO = {
    warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3v12" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>',
    pend: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3v12" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v5" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="8" r=".9" fill="currentColor"/></svg>'
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

  let uid = null;
  let items = [];
  let cliente = null;

  // --- Pintado instantáneo: la última lista completa se guarda en el dispositivo y se
  // dibuja al cargar la página, sin esperar a Supabase. Luego se actualiza en segundo plano.
  const REF_PROYECTO = String(window.DSI.SUPABASE_URL).replace('https://', '').split('.')[0];
  const CLAVE_CACHE = 'dsi_notif_cache_v1';
  function uidSincrono(){
    try {
      const s = JSON.parse(localStorage.getItem('sb-' + REF_PROYECTO + '-auth-token') || 'null');
      if (!s) return null;
      return (s.user && s.user.id) || (s.currentSession && s.currentSession.user && s.currentSession.user.id) || null;
    } catch (e) { return null; }
  }
  function leerCache(u){
    try {
      const c = JSON.parse(localStorage.getItem(CLAVE_CACHE) || 'null');
      return c && c.uid === u && Array.isArray(c.items) ? c.items : null;
    } catch (e) { return null; }
  }
  function guardarCache(){
    try { localStorage.setItem(CLAVE_CACHE, JSON.stringify({ uid: uid, items: items, t: Date.now() })); } catch (e) {}
  }

  function leidas(){
    if (!uid) return new Set();
    try { return new Set(JSON.parse(localStorage.getItem('dsi_notif_leidas_' + uid) || '[]')); }
    catch (e) { return new Set(); }
  }
  function guardarLeidas(set){
    if (!uid) return;
    try { localStorage.setItem('dsi_notif_leidas_' + uid, JSON.stringify(Array.from(set).slice(-300))); } catch (e) {}
  }

  // Dibuja la lista y el número de la campana. El observador se apaga mientras
  // escribe para no entrar en un bucle.
  function pintar(){
    observador.disconnect();
    observadorGlobo.disconnect();
    const leer = leidas();
    const visibles = items.filter(function(i){ return !leer.has(i.key); }).slice(0, 30);

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
    observadorGlobo.observe(badge, { childList: true, characterData: true, subtree: true, attributes: true });
  }

  const observador = new MutationObserver(function(){ pintar(); });
  observador.observe(cont, { childList: true });
  const observadorGlobo = new MutationObserver(function(){ if (items.length || uid) pintar(); });
  observadorGlobo.observe(badge, { childList: true, characterData: true, subtree: true, attributes: true });

  // Pintado inmediato desde la caché (solo si hay sesión y es del mismo usuario)
  (function(){
    const u = uidSincrono();
    if (!u) return;
    uid = u;
    const c = leerCache(u);
    if (c) { items = c; pintar(); }
  })();

  // Al tocar una notificación se marca como leída y se abre su módulo
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
    try {
      if (!cliente) cliente = window.DSI.cliente();
      if (!cliente) return;
      const sesion = await cliente.auth.getSession();
      const sess = sesion.data && sesion.data.session;
      if (!sess) { items = []; uid = null; try { localStorage.removeItem(CLAVE_CACHE); } catch (e) {} pintar(); return; }
      uid = sess.user.id;

      const perfil = await cliente.from('perfiles').select('rol').eq('id', uid).maybeSingle();
      const esAuditor = !!(perfil.data && perfil.data.rol === 'auditor');

      const [rec, prod, prov, inv, ctrl, nor] = await Promise.all([
        cliente.from('recepciones').select('id,estado_producto,peso,fecha_recepcion,productos(nombre)')
          .order('fecha_recepcion', { ascending: false, nullsFirst: false }).limit(100),
        cliente.from('productos').select('id,nombre,estado'),
        cliente.from('proveedores').select('id,nombre,estado'),
        cliente.from('inventario_productos').select('producto_id,nombre,disponible,estado_stock'),
        cliente.from('controles_calidad').select('id,estado_revision,comentario_revision,fecha_control,productos(nombre)')
          .order('fecha_control', { ascending: false, nullsFirst: false }).limit(100),
        cliente.from('producto_normas').select('id,estado,certificado,comentario_revision,fecha_revision,fecha_vencimiento,productos(nombre),normas_catalogo(nombre)')
          .in('estado', ['Declarada', 'Rechazada', 'Verificada']).limit(200)
      ]);

      const lista = [];

      (rec.data || []).forEach(function(r){
        const estado = r.estado_producto || 'Fresco';
        const clase = clasificar(estado);
        if (clase === 'ok') return;
        lista.push({
          key: 'rec:' + r.id + ':' + norm(estado),
          tipo: clase,
          titulo: 'Recepción ' + estado.toLowerCase(),
          texto: (nombreRel(r.productos) || 'Producto') + ' — ' + kg(r.peso),
          fecha: fecha(r.fecha_recepcion),
          href: 'recepciones.html'
        });
      });

      (prod.data || []).forEach(function(p){
        if (norm(p.estado) !== 'inactivo') return;
        lista.push({ key: 'prod:' + p.id, tipo: 'info', titulo: 'Producto inactivo',
          texto: p.nombre || 'Producto', fecha: '', href: 'productos.html' });
      });

      (prov.data || []).forEach(function(p){
        if (norm(p.estado) !== 'inactivo') return;
        lista.push({ key: 'prov:' + p.id, tipo: 'info', titulo: 'Proveedor inactivo',
          texto: p.nombre || 'Proveedor', fecha: '', href: 'proveedores.html' });
      });

      (inv.data || []).forEach(function(i){
        if (i.estado_stock === 'OK' || !i.estado_stock) return;
        const agotado = i.estado_stock === 'Agotado';
        lista.push({ key: 'stock:' + i.producto_id + ':' + i.estado_stock,
          tipo: agotado ? 'warn' : 'pend',
          titulo: agotado ? 'Producto agotado' : 'Stock bajo',
          texto: i.nombre + ' — disponible ' + kg(i.disponible),
          fecha: '', href: 'almacenamiento.html' });
      });

      (ctrl.data || []).forEach(function(c){
        const nombre = nombreRel(c.productos) || 'Producto';
        if (esAuditor && c.estado_revision === 'Pendiente') {
          lista.push({ key: 'ctrlp:' + c.id, tipo: 'pend', titulo: 'Control por revisar',
            texto: nombre, fecha: fecha(c.fecha_control), href: 'normas.html#controles' });
        } else if (!esAuditor && c.estado_revision === 'Rechazado') {
          lista.push({ key: 'ctrlr:' + c.id, tipo: 'warn', titulo: 'Control rechazado por el auditor',
            texto: nombre + (c.comentario_revision ? ' — ' + c.comentario_revision : ''),
            fecha: fecha(c.fecha_control), href: 'normas.html#controles' });
        }
      });

      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const en30 = new Date(hoy.getTime() + 30 * 86400000);
      (nor.data || []).forEach(function(n){
        const prodN = nombreRel(n.productos) || 'Producto';
        const normaN = nombreRel(n.normas_catalogo) || 'Norma';
        if (esAuditor) {
          if (n.estado === 'Declarada') {
            lista.push({ key: 'normap:' + n.id + ':' + (n.certificado || '') + ':' + (n.fecha_vencimiento || ''), tipo: 'pend',
              titulo: 'Norma por revisar', texto: normaN + ' — ' + prodN, fecha: '', href: 'normas.html#productos' });
          }
          return;
        }
        if (n.estado === 'Rechazada') {
          lista.push({ key: 'normar:' + n.id + ':' + (n.fecha_revision || ''), tipo: 'warn',
            titulo: 'Norma rechazada por el auditor',
            texto: normaN + ' — ' + prodN + (n.comentario_revision ? ' — ' + n.comentario_revision : ''),
            fecha: fecha(n.fecha_revision), href: 'normas.html#productos' });
        } else if (n.estado === 'Verificada' && n.fecha_vencimiento) {
          const vence = new Date(n.fecha_vencimiento + 'T00:00:00');
          if (vence <= en30) {
            const vencida = vence < hoy;
            lista.push({ key: 'normav:' + n.id + ':' + n.fecha_vencimiento, tipo: vencida ? 'warn' : 'pend',
              titulo: vencida ? 'Certificado vencido' : 'Certificado por vencer',
              texto: normaN + ' — ' + prodN, fecha: fecha(n.fecha_vencimiento), href: 'normas.html#productos' });
          }
        }
      });

      items = lista;
      guardarCache();

      // Limpia del registro de "leídas" las que ya no existen. Solo se hace aquí, donde
      // se conoce la lista COMPLETA, y solo si ninguna consulta falló (si una falla, la
      // lista queda incompleta y se borrarían leídas válidas).
      const sinErrores = !rec.error && !prod.error && !prov.error && !inv.error && !ctrl.error && !nor.error;
      if (sinErrores) {
        const vigentes = new Set(lista.map(function(i){ return i.key; }));
        const leer = leidas();
        const depuradas = new Set(Array.from(leer).filter(function(k){ return vigentes.has(k); }));
        if (depuradas.size !== leer.size) guardarLeidas(depuradas);
      }
      pintar();
    } catch (e) { /* sin conexión: se vuelve a intentar */ }
  }

  // Arranca en cuanto el SDK de Supabase esté listo (antes esperaba 1,5 s fijos)
  let intentos = 0;
  (function arrancar(){
    if (window.supabase) { cargar(); return; }
    if (intentos++ < 100) setTimeout(arrancar, 50);
  })();
  setInterval(cargar, 120000);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) cargar(); });
})();