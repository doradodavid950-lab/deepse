/* ==========================================================
   Lógica del módulo: cuenta.html
   Extraída del HTML sin cambios: mismo código y mismo orden de ejecución.
   ========================================================== */
(function(){
  'use strict';

  const $ = id => document.getElementById(id);

  // Si el SDK de Supabase no cargó (sin internet), se avisa y se ofrece recargar
  if (typeof supabase === 'undefined') {
    $('avisoTexto').textContent = 'No se pudo cargar el sistema. Revisa tu conexión e intenta de nuevo.';
    $('aviso').classList.add('show');
    $('avisoBtn').addEventListener('click', () => window.location.reload());
    return;
  }

  const supabaseClient = DSI.cliente();

  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Preferencias (se guardan en este dispositivo)
  const PREF_NOTIF = 'deepsea_notificaciones';
  const PREF_AUTO  = 'deepsea_actualizacion';
  const TIPOS = ['Restaurante','Hotel','Supermercado','Pescadería','Distribuidor','Otro'];

  // ---------------------------------------------------------------
  // ESTADO DE LA PÁGINA
  // ---------------------------------------------------------------
  let usuarioActual = null;
  let perfil = null;              // datos guardados en la tabla "perfiles"
  let datos = { productos: [], proveedores: [], recepciones: [], totalRecepciones: 0 };
  let conteos = { ventas: null, almacenamientos: null };
  let datosListos = false;
  let errorCarga = false;
  let cargando = false;
  let ultimaActualizacion = 0;
  let notifsActuales = [];
  let firmaPintada = '';
  let toastTimer = null;
  let saliendo = false;

  // ---------------------------------------------------------------
  // UTILIDADES
  // ---------------------------------------------------------------

  // Evita que texto de la base de datos se interprete como HTML
  function escapeHTML(texto){
    return String(texto ?? '').replace(/[&<>"']/g, c => (
      { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
    ));
  }

  // Quita tildes y pasa a minúsculas para comparar textos sin errores
  function normalizar(texto){
    return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function capitalizar(texto){
    const t = String(texto || '').trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  const fmtNumero = n => Math.round(n).toLocaleString('es-CO');
  const fmtPeso   = n => (Math.round(n * 100) / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' kg';

  // Interpreta fechas. Si llega solo "2026-09-23" se toma como fecha LOCAL;
  // de lo contrario, en Colombia se mostraría un día antes.
  function parsearFecha(valor){
    if (!valor) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      const [a, m, d] = valor.split('-').map(Number);
      return new Date(a, m - 1, d);
    }
    const f = new Date(valor);
    return isNaN(f.getTime()) ? null : f;
  }
  function formatearFecha(valor){
    const f = parsearFecha(valor);
    return f ? f.toLocaleDateString('es-CO') : '-';
  }

  // ---------------------------------------------------------------
  // CLASIFICACIÓN DE ESTADOS (se usa en la tabla, alertas y notificaciones)
  //   'warn' = problema (rechazado, dañado...)
  //   'pend' = requiere revisión (pendiente, en evaluación...)
  //   'ok'   = normal (recibido, aceptado, fresco...)
  // Si tu base de datos usa otras palabras, agrégalas en estas listas.
  // ---------------------------------------------------------------
  const PALABRAS_PROBLEMA  = ['rechaz', 'dano', 'danad', 'deterior', 'vencid', 'cancelad', 'inactiv', 'no apto'];
  const PALABRAS_PENDIENTE = ['pendiente', 'evaluacion', 'revision', 'observ'];

  function clasificarEstado(estado){
    const e = normalizar(estado);
    if (PALABRAS_PROBLEMA.some(p => e.includes(p)))  return 'warn';
    if (PALABRAS_PENDIENTE.some(p => e.includes(p))) return 'pend';
    return 'ok';
  }

  // Número que sube suavemente hasta su valor final
  function animarNumero(el, destino, formato){
    el.classList.remove('loading-val');
    const inicio = Number(el.dataset.v ?? 0);
    el.dataset.v = destino;
    const id = (el._anim = (el._anim || 0) + 1);
    if (reducirMovimiento || inicio === destino) { el.textContent = formato(destino); return; }
    const duracion = 600, t0 = performance.now();
    (function paso(t){
      if (el._anim !== id) return;
      const p = Math.min((t - t0) / duracion, 1);
      const suave = 1 - Math.pow(1 - p, 3);
      el.textContent = formato(inicio + (destino - inicio) * suave);
      if (p < 1) requestAnimationFrame(paso);
    })(t0);
  }


  function pintarUsuario(){
    const u = usuarioActual;
    const nombre = (perfil?.nombre || u.user_metadata?.full_name || u.user_metadata?.name || (u.email || '').split('@')[0] || 'Usuario').trim() || 'Usuario';
    $('topUserName').textContent = nombre;
    $('topAvatar').textContent   = nombre.charAt(0).toUpperCase();
  }

  function showToast(mensaje, tipo){
    const t = $('toast');
    t.textContent = mensaje;
    t.className = 'toast show' + (tipo ? ' ' + tipo : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
  }

  function conTiempo(promesa, ms){
    let t;
    const limite = new Promise((_, rechazar) => { t = setTimeout(() => rechazar(new Error('Tiempo de espera agotado')), ms || 15000); });
    return Promise.race([promesa, limite]).finally(() => clearTimeout(t));
  }

  // ---------------------------------------------------------------
  // PREFERENCIAS
  // ---------------------------------------------------------------
  function leerPref(clave, porDefecto){
    try { const v = localStorage.getItem(clave); return v === null ? porDefecto : v; }
    catch (e) { return porDefecto; }
  }
  function guardarPref(clave, valor){
    try { localStorage.setItem(clave, valor); } catch (e) { /* bloqueado: no pasa nada */ }
  }
  function aplicarPrefs(){
    const notif = leerPref(PREF_NOTIF, 'on') !== 'off';
    const auto  = leerPref(PREF_AUTO, 'on') !== 'off';
    $('swNotif').setAttribute('aria-checked', String(notif));
    $('swAuto').setAttribute('aria-checked', String(auto));
    $('notifWrap').hidden = !notif;
  }
  $('swNotif').addEventListener('click', function(){
    const nuevo = this.getAttribute('aria-checked') === 'true' ? 'off' : 'on';
    guardarPref(PREF_NOTIF, nuevo); aplicarPrefs();
    showToast(nuevo === 'on' ? 'Notificaciones activadas.' : 'Notificaciones desactivadas.', 'success');
  });
  $('swAuto').addEventListener('click', function(){
    const nuevo = this.getAttribute('aria-checked') === 'true' ? 'off' : 'on';
    guardarPref(PREF_AUTO, nuevo); aplicarPrefs();
    showToast(nuevo === 'on' ? 'Actualización automática activada.' : 'Actualización automática desactivada.', 'success');
  });

  // Borra las copias guardadas en este dispositivo (no toca tu cuenta ni las notificaciones leídas)
  function limpiarCaches(){
    try {
      const claves = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('dsi_') === 0 && k.indexOf('dsi_notif_leidas_') !== 0) claves.push(k);
      }
      claves.forEach(k => localStorage.removeItem(k));
    } catch (e) { /* almacenamiento bloqueado */ }
  }
  $('limpiarCacheBtn').addEventListener('click', function(){
    limpiarCaches();
    showToast('Datos guardados eliminados. La próxima carga puede tardar un poco más.', 'success');
  });

  // ---------------------------------------------------------------
  // CACHÉ LOCAL: al volver a la página se muestra al instante lo último
  // que se vio, y en segundo plano se piden los datos nuevos.
  // ---------------------------------------------------------------
  const claveCache = () => 'dsi_dash_' + usuarioActual.id;

  function leerCache(){
    try {
      const c = JSON.parse(localStorage.getItem(claveCache()) || 'null');
      if (c && Array.isArray(c.productos) && Array.isArray(c.proveedores) && Array.isArray(c.recepciones)) return c;
    } catch (e) { /* caché dañada: se ignora */ }
    return null;
  }
  function guardarCache(){
    try { localStorage.setItem(claveCache(), JSON.stringify(datos)); } catch (e) { /* sin espacio: no pasa nada */ }
  }

  // ---------------------------------------------------------------
  // AVISO DE ERROR
  // ---------------------------------------------------------------
  function mostrarAviso(texto){
    $('avisoTexto').textContent = texto;
    $('aviso').classList.add('show');
  }
  function ocultarAviso(){ $('aviso').classList.remove('show'); }


  // ---------------------------------------------------------------
  // CARGA DE DATOS
  // ---------------------------------------------------------------
  async function actualizarDatos(){
    if (cargando) return;
    cargando = true;
    let hayError = false;
    let temporizador;
    const tiempoAgotado = new Promise(function(_, rechazar){
      temporizador = setTimeout(function(){ rechazar(new Error('Tiempo de espera agotado')); }, 15000);
    });

    try {
      const [prod, prov, rec, ven, alm] = await Promise.race([Promise.all([
        supabaseClient.from('productos').select('id,nombre,nombre_cientifico,categoria,estado'),
        supabaseClient.from('proveedores').select('id,nombre,estado'),
        supabaseClient.from('recepciones')
          .select('id,producto_id,peso,estado_producto,fecha_recepcion,productos(nombre)', { count: 'exact' })
          .order('fecha_recepcion', { ascending: false, nullsFirst: false }),
        supabaseClient.from('ventas').select('id', { count: 'exact', head: true }),
        supabaseClient.from('almacenamientos').select('id', { count: 'exact', head: true })
      ]), tiempoAgotado]);

      if (prod.error) { hayError = true; console.error('Error productos:', prod.error); } else datos.productos = prod.data || [];
      if (prov.error) { hayError = true; console.error('Error proveedores:', prov.error); } else datos.proveedores = prov.data || [];
      if (rec.error)  { hayError = true; console.error('Error recepciones:', rec.error); }
      else { datos.recepciones = rec.data || []; datos.totalRecepciones = rec.count ?? datos.recepciones.length; }
      if (!ven.error) conteos.ventas = ven.count ?? 0; else console.error('Error ventas:', ven.error);
      if (!alm.error) conteos.almacenamientos = alm.count ?? 0; else console.error('Error almacenamientos:', alm.error);
    } catch (err) {
      hayError = true;
      console.error('Error cargando datos:', err);
    } finally {
      clearTimeout(temporizador);
    }

    cargando = false;
    errorCarga = hayError;
    datosListos = true;

    if (hayError) mostrarAviso('No se pudieron actualizar algunos datos. Revisa tu conexión.');
    else { ocultarAviso(); podarLeidas(); guardarCache(); ultimaActualizacion = Date.now(); }

    pintarActividad();
  }

  function pintarActividad(){
    if (!datosListos) return;
    const firma = JSON.stringify(datos) + '|' + JSON.stringify(conteos);
    if (firma !== firmaPintada) {
      firmaPintada = firma;
    }
    renderNotificaciones();
  }

  // ---------------------------------------------------------------
  // BUSCADOR (productos y proveedores, con los datos ya cargados)
  // ---------------------------------------------------------------
  const buscador = $('buscador');
  const cajaResultados = $('resultadosBusqueda');

  function cerrarBusqueda(){ cajaResultados.classList.remove('show'); cajaResultados.innerHTML = ''; }

  function buscar(){
    const q = normalizar(buscador.value);
    if (!q) { cerrarBusqueda(); return; }

    const prods = datos.productos
      .filter(p => normalizar(p.nombre).includes(q) || normalizar(p.nombre_cientifico).includes(q))
      .slice(0, 5);
    const provs = datos.proveedores
      .filter(p => normalizar(p.nombre).includes(q))
      .slice(0, 4);

    let html = '';
    if (prods.length) {
      html += '<div class="sr-grupo">Productos</div>' + prods.map(p => `
        <a class="sr-item" href="productos.html?id=${encodeURIComponent(p.id)}" role="option">
          <span class="sr-ic" style="background:var(--g-azul)"><svg class="i" style="width:17px;height:17px"><use href="#i-box"/></svg></span>
          <span><b>${escapeHTML(p.nombre)}</b><span class="sub">${escapeHTML(p.nombre_cientifico || p.categoria || '')}</span></span>
        </a>`).join('');
    }
    if (provs.length) {
      html += '<div class="sr-grupo">Proveedores</div>' + provs.map(p => `
        <a class="sr-item" href="proveedores.html?id=${encodeURIComponent(p.id)}" role="option">
          <span class="sr-ic" style="background:var(--g-morado)"><svg class="i" style="width:17px;height:17px"><use href="#i-users"/></svg></span>
          <span><b>${escapeHTML(p.nombre)}</b><span class="sub">${escapeHTML(p.estado || '')}</span></span>
        </a>`).join('');
    }
    if (!html) html = '<div class="sr-vacio">No encontramos resultados para "' + escapeHTML(buscador.value.trim()) + '".</div>';

    cajaResultados.innerHTML = html;
    cajaResultados.classList.add('show');
  }

  buscador.addEventListener('input', buscar);
  buscador.addEventListener('focus', buscar);
  buscador.addEventListener('keydown', function(e){
    const items = [...cajaResultados.querySelectorAll('.sr-item')];
    if (e.key === 'Enter') {
      if (items[0]) { e.preventDefault(); window.location.href = items[0].getAttribute('href'); }
    } else if (e.key === 'ArrowDown' && items[0]) {
      e.preventDefault(); items[0].focus();
    }
  });
  cajaResultados.addEventListener('keydown', function(e){
    const items = [...cajaResultados.querySelectorAll('.sr-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < items.length - 1) { e.preventDefault(); items[i + 1].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? items[i - 1] : buscador).focus(); }
  });
  document.addEventListener('click', function(e){
    if (!$('search').contains(e.target)) cerrarBusqueda();
  });

  // ---------------------------------------------------------------
  // NOTIFICACIONES
  // Se calculan con los datos que ya están cargados (se abren al instante).
  // Al hacer clic en una: se marca como leída (desaparece, y se recuerda
  // en este navegador) y se abre el módulo de donde viene.
  // ---------------------------------------------------------------
  const claveLeidas = () => 'dsi_notif_leidas_' + usuarioActual.id;

  function leerLeidas(){
    try { return new Set(JSON.parse(localStorage.getItem(claveLeidas()) || '[]')); }
    catch (e) { return new Set(); }
  }
  function guardarLeidas(set){
    try { localStorage.setItem(claveLeidas(), JSON.stringify([...set].slice(-300))); } catch (e) {}
  }

  function construirNotificaciones(){
    const lista = [];

    datos.recepciones.forEach(r => {
      const estado = r.estado_producto || 'Recibido';
      const clase = clasificarEstado(estado);
      if (clase === 'ok') return;                       // solo lo que requiere atención
      const prod = Array.isArray(r.productos) ? r.productos[0] : r.productos;
      lista.push({
        key: `rec:${r.id}:${normalizar(estado)}`,
        tipo: clase,
        titulo: `Recepción ${estado.toLowerCase()}`,
        texto: `${prod?.nombre || 'Producto'} — ${fmtPeso(Number(r.peso) || 0)}`,
        fecha: formatearFecha(r.fecha_recepcion),
        href: 'recepciones.html?id=' + encodeURIComponent(r.id)
      });
    });

    datos.productos.forEach(p => {
      if (normalizar(p.estado) !== 'inactivo') return;
      lista.push({
        key: `prod:${p.id}`,
        tipo: 'info',
        titulo: 'Producto inactivo',
        texto: p.nombre || 'Producto',
        fecha: '',
        href: 'productos.html?id=' + encodeURIComponent(p.id)
      });
    });

    return lista;
  }

  // Elimina de la lista de "leídas" las que ya no existen (mantiene el registro corto)
  function podarLeidas(){
    // Desactivado: cada página solo conoce una parte de las notificaciones y, al podar,
    // borraba como "leídas" las que no conocía (p. ej. controles rechazados), por eso reaparecían.
    // La limpieza ahora la hace campana.js, que conoce la lista completa.
    return;
  }

  function actualizarGlobo(){
    const leidas = leerLeidas();
    const total = notifsActuales.filter(n => !leidas.has(n.key)).length;
    const globo = $('notificationBadge');
    globo.textContent = total > 9 ? '9+' : String(total);
    globo.classList.toggle('show', total > 0);
    $('notificationBtn').setAttribute('aria-label', total ? `Notificaciones (${total} sin leer)` : 'Notificaciones');
    $('markAllRead').style.display = total ? '' : 'none';
  }

  function iconoNotif(tipo){
    return tipo === 'info'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v5" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="8" r=".9" fill="currentColor"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3v12" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>';
  }

  function renderNotificaciones(){
    if (!usuarioActual) return;
    const leidas = leerLeidas();
    notifsActuales = construirNotificaciones().filter(n => !leidas.has(n.key)).slice(0, 30);
    actualizarGlobo();

    const cont = $('notificationContent');
    if (!notifsActuales.length) {
      cont.innerHTML = '<div class="notification-empty">No tienes notificaciones nuevas.</div>';
      return;
    }

    cont.innerHTML = notifsActuales.map((n, i) => `
      <a class="notification-item" href="${escapeHTML(n.href)}" data-i="${i}">
        <div class="ni-icon t-${n.tipo}">${iconoNotif(n.tipo)}</div>
        <div class="ni-body">
          <strong>${escapeHTML(n.titulo)}</strong>
          <span>${escapeHTML(n.texto)}</span>
          ${n.fecha && n.fecha !== '-' ? `<em>${escapeHTML(n.fecha)}</em>` : ''}
        </div>
        <span class="ni-go">›</span>
      </a>`).join('');
  }

  // Clic en una notificación: se marca como leída, desaparece y se abre el módulo
  $('notificationContent').addEventListener('click', function(e){
    const item = e.target.closest('.notification-item');
    if (!item) return;
    e.preventDefault();

    const n = notifsActuales[Number(item.dataset.i)];
    if (!n) return;

    const leidas = leerLeidas();
    leidas.add(n.key);
    guardarLeidas(leidas);
    actualizarGlobo();

    item.classList.add('removing');
    setTimeout(function(){
      item.remove();
      if (!$('notificationContent').querySelector('.notification-item')) renderNotificaciones();
      window.location.href = n.href;
    }, 170);
  });

  $('markAllRead').addEventListener('click', function(){
    const leidas = leerLeidas();
    construirNotificaciones().forEach(n => leidas.add(n.key));
    guardarLeidas(leidas);
    renderNotificaciones();
  });

  // Abrir / cerrar el panel
  const panel = $('notificationPanel');
  const btnNotif = $('notificationBtn');

  function cerrarPanel(){
    panel.classList.remove('show');
    btnNotif.setAttribute('aria-expanded', 'false');
  }

  btnNotif.addEventListener('click', function(e){
    e.stopPropagation();
    const abierto = panel.classList.toggle('show');
    btnNotif.setAttribute('aria-expanded', String(abierto));
  });
  $('closeNotifications').addEventListener('click', cerrarPanel);
  document.addEventListener('click', function(e){
    if (!panel.contains(e.target) && !btnNotif.contains(e.target)) cerrarPanel();
  });


  // ---------------------------------------------------------------
  // MENÚ "MÁS" EN CELULAR: iconos flotantes en vertical
  // ---------------------------------------------------------------
  const fan = $('fan');
  const fanBtn = $('fanBtn');

  function abrirFan(){
    fan.classList.add('open');
    fanBtn.classList.add('open');
    fanBtn.setAttribute('aria-expanded', 'true');
    $('fanBtnLabel').textContent = 'Cerrar';
    document.body.style.overflow = 'hidden';
  }
  function cerrarFan(){
    fan.classList.remove('open');
    fanBtn.classList.remove('open');
    fanBtn.setAttribute('aria-expanded', 'false');
    $('fanBtnLabel').textContent = 'Más';
    document.body.style.overflow = '';
  }

  fanBtn.addEventListener('click', () => fan.classList.contains('open') ? cerrarFan() : abrirFan());
  $('fanOverlay').addEventListener('click', cerrarFan);
  window.addEventListener('resize', () => { if (window.innerWidth > 1000) cerrarFan(); });

  // Tecla Escape: cierra el panel de notificaciones, la búsqueda y el menú móvil
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') { cerrarPanel(); cerrarFan(); cerrarBusqueda(); }
  });


  // ---------------------------------------------------------------
  // MI ESTABLECIMIENTO (tabla "perfiles")
  // ---------------------------------------------------------------
  function isValidName(v){ return /^\p{L}[\p{L}\s'.-]+$/u.test(v); }
  function isValidBusiness(v){ return /^[\p{L}\p{N}][\p{L}\p{N}\s'&.,#-]{1,79}$/u.test(v); }
  function isValidPhone(v){
    if (!/^\+?[\d\s()-]+$/.test(v)) return false;
    const d = v.replace(/\D/g, '');
    return d.length >= 7 && d.length <= 15;
  }
  function setInvalid(id, msg){
    const f = $(id); f.classList.add('invalid');
    if (msg) f.querySelector('.field-error').textContent = msg;
  }
  function limpiarErrores(form){ form.querySelectorAll('.field.invalid').forEach(f => f.classList.remove('invalid')); }

  function rellenarFormulario(){
    const u = usuarioActual, p = perfil || {};
    $('negocio').value     = p.nombre_establecimiento || '';
    $('tipo').value        = TIPOS.indexOf(p.tipo_establecimiento) > -1 ? p.tipo_establecimiento : '';
    $('responsable').value = p.nombre || u.user_metadata?.full_name || u.user_metadata?.name || '';
    $('telefono').value    = p.telefono || '';
    $('correo').value      = p.email || u.email || '';
    limpiarErrores($('formDatos'));
  }

  function etiquetaRol(r){
    const t = String(r || '').trim();
    return t ? capitalizar(t) : 'Usuario';
  }
  function haceCuanto(valor){
    const f = valor ? new Date(valor) : null;
    if (!f || isNaN(f)) return '—';
    const dias = Math.floor((Date.now() - f.getTime()) / 86400000);
    if (dias < 1) return 'hoy';
    if (dias < 30) return 'hace ' + dias + (dias === 1 ? ' día' : ' días');
    const meses = Math.floor(dias / 30);
    if (meses < 12) return 'hace ' + meses + (meses === 1 ? ' mes' : ' meses');
    const anios = Math.floor(meses / 12);
    return 'hace ' + anios + (anios === 1 ? ' año' : ' años');
  }

  function pintarEncabezadoCuenta(){
    const u = usuarioActual, p = perfil || {};
    const nombre = (p.nombre || u.user_metadata?.full_name || u.user_metadata?.name || (u.email || '').split('@')[0] || 'Usuario').trim() || 'Usuario';
    const correo = p.email || u.email || '—';
    const est = [p.nombre_establecimiento, p.tipo_establecimiento].filter(Boolean).join(' · ') || 'Sin completar';
    $('pfAvatar').textContent = nombre.charAt(0).toUpperCase();
    $('pfNombre').textContent = nombre;
    $('pfCorreo').textContent = correo;
    $('pfRol').textContent = etiquetaRol(p.rol);
    $('dNombre').textContent = nombre;
    $('dCorreo').textContent = correo;
    $('dTel').textContent = p.telefono || '—';
    $('dEst').textContent = est;
    $('dRol').textContent = etiquetaRol(p.rol);
    $('passInfo').textContent = 'Última vez: ' + haceCuanto(u.updated_at || u.created_at);
  }

  async function cargarPerfil(){
    try {
      const { data, error } = await conTiempo(
        supabaseClient.from('perfiles')
          .select('nombre,email,telefono,tipo_establecimiento,nombre_establecimiento,rol')
          .eq('id', usuarioActual.id).maybeSingle()
      );
      if (error) throw error;
      perfil = data || null;
    } catch (err) {
      console.error('No se pudo leer el perfil:', err);
      showToast('No se pudieron cargar los datos de tu perfil.', 'error');
    }
    rellenarFormulario();
    pintarEncabezadoCuenta();
    pintarUsuario();
  }

  $('cancelarDatos').addEventListener('click', function(){ rellenarFormulario(); cerrarVentana(); });
  ['negocio','tipo','responsable','telefono'].forEach(id => {
    $(id).addEventListener('input', () => $(id).closest('.field').classList.remove('invalid'));
    $(id).addEventListener('change', () => $(id).closest('.field').classList.remove('invalid'));
  });

  $('formDatos').addEventListener('submit', async function(e){
    e.preventDefault();
    limpiarErrores(this);
    const negocio = $('negocio').value.trim().replace(/\s+/g, ' ');
    const tipo    = $('tipo').value;
    const nombre  = $('responsable').value.trim().replace(/\s+/g, ' ');
    const tel     = $('telefono').value.trim();

    let ok = true;
    if (!isValidBusiness(negocio)) { setInvalid('fNegocio'); ok = false; }
    if (TIPOS.indexOf(tipo) === -1) { setInvalid('fTipo'); ok = false; }
    if (!isValidName(nombre))       { setInvalid('fNombre'); ok = false; }
    if (tel && !isValidPhone(tel))  { setInvalid('fTel'); ok = false; }
    if (!ok) { showToast('Revisa los campos marcados en rojo.', 'error'); return; }

    const btn = $('guardarDatos');
    btn.disabled = true; $('guardarDatosTxt').textContent = 'Guardando...';
    try {
      const nuevo = {
        id: usuarioActual.id,
        nombre: nombre,
        email: usuarioActual.email,
        telefono: tel || null,
        tipo_establecimiento: tipo,
        nombre_establecimiento: negocio
      };
      const { error } = await conTiempo(supabaseClient.from('perfiles').upsert(nuevo, { onConflict: 'id' }));
      if (error) throw error;
      perfil = Object.assign({}, perfil, nuevo);
      // El nombre también se guarda en la sesión para que el saludo de Inicio lo use
      try { await supabaseClient.auth.updateUser({ data: { full_name: nombre } }); } catch (e) { /* no es crítico */ }
      pintarEncabezadoCuenta();
      pintarUsuario();
      showToast('Datos guardados correctamente.', 'success');
      cerrarVentana();
    } catch (err) {
      console.error('Error guardando perfil:', err);
      showToast('No se pudieron guardar los cambios. Intenta de nuevo.', 'error');
    } finally {
      btn.disabled = false; $('guardarDatosTxt').textContent = 'Guardar cambios';
    }
  });

  // ---------------------------------------------------------------
  // CAMBIAR CONTRASEÑA
  // ---------------------------------------------------------------
  function tienePalabraOsecuenciaDebil(p){
    const v = p.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const comunes = ['password','contrasena','admin','usuario','deepsea','deepseaintelligence','marino','pescado','hola','welcome','letmein','qwerty','iloveyou','abc123','123456','000000'];
    if (comunes.some(w => v.includes(w))) return true;
    if (/(.)\1{3,}/i.test(p)) return true;
    if (/(?:0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|abcd|bcde|cdef|qwer|asdf)/i.test(p)) return true;
    return false;
  }
  function reglaContrasena(p){
    if (p.length < 8) return 'La contraseña debe tener mínimo 8 caracteres.';
    if (p !== p.trim()) return 'La contraseña no puede empezar ni terminar con espacios.';
    if (p.length > 72) return 'La contraseña no puede superar los 72 caracteres.';
    if (!/[A-Z]/.test(p)) return 'Incluye al menos una letra mayúscula.';
    if (!/\d/.test(p)) return 'Incluye al menos un número.';
    if (!/[^A-Za-z0-9]/.test(p)) return 'Incluye al menos un carácter especial, como !, @ o #.';
    if (tienePalabraOsecuenciaDebil(p)) return 'Evita palabras comunes, repeticiones o secuencias simples.';
    return '';
  }
  function strengthScore(p){
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p) && !tienePalabraOsecuenciaDebil(p)) s++;
    return s;
  }
  function actualizarFuerza(){
    const p = $('passNueva').value;
    const sc = p ? strengthScore(p) : 0;
    const colores = ['#E53935','#F5A524','#17A673','#17A673'];
    const textos = ['', 'Débil', 'Media', 'Segura', 'Muy segura'];
    document.querySelectorAll('#strength i').forEach((b, i) => { b.style.background = i < sc ? colores[sc - 1] : ''; });
    $('strengthLabel').textContent = p ? textos[sc] : '';
    $('strengthLabel').style.color = p ? colores[sc - 1] : '';
  }
  $('passNueva').addEventListener('input', actualizarFuerza);
  ['passActual','passNueva','passConfirma'].forEach(id => $(id).addEventListener('input', () => $(id).closest('.field').classList.remove('invalid')));

  $('verPass').addEventListener('click', function(){
    const oculto = $('passNueva').type === 'password';
    ['passActual','passNueva','passConfirma'].forEach(id => { $(id).type = oculto ? 'text' : 'password'; });
    this.setAttribute('aria-label', oculto ? 'Ocultar contraseñas' : 'Mostrar contraseñas');
  });

  $('formPass').addEventListener('submit', async function(e){
    e.preventDefault();
    limpiarErrores(this);
    const actual = $('passActual').value, nueva = $('passNueva').value, conf = $('passConfirma').value;

    let ok = true;
    if (!actual) { setInvalid('fActual'); ok = false; }
    const errorNueva = reglaContrasena(nueva);
    if (errorNueva) { setInvalid('fNueva', errorNueva); ok = false; }
    else if (actual && nueva === actual) { setInvalid('fNueva', 'La nueva contraseña debe ser distinta a la actual.'); ok = false; }
    if (conf !== nueva) { setInvalid('fConfirma'); ok = false; }
    if (!ok) { showToast('Revisa los campos marcados en rojo.', 'error'); return; }

    const btn = $('guardarPass');
    btn.disabled = true; $('guardarPassTxt').textContent = 'Actualizando...';
    try {
      // Primero se comprueba la contraseña actual (así nadie con la sesión abierta puede cambiarla sin saberla)
      const check = await conTiempo(supabaseClient.auth.signInWithPassword({ email: usuarioActual.email, password: actual }));
      if (check.error) { setInvalid('fActual', 'La contraseña actual no es correcta.'); showToast('La contraseña actual no es correcta.', 'error'); return; }

      const res = await conTiempo(supabaseClient.auth.updateUser({ password: nueva }));
      if (res.error) {
        const m = (res.error.message || '').toLowerCase();
        if (m.includes('same')) { setInvalid('fNueva', 'La nueva contraseña debe ser distinta a la actual.'); }
        else if (m.includes('weak') || m.includes('password')) { setInvalid('fNueva', 'Esa contraseña no es segura. Prueba con otra.'); }
        showToast('No se pudo cambiar la contraseña. Intenta de nuevo.', 'error');
        return;
      }
      this.reset(); actualizarFuerza();
      $('passInfo').textContent = 'Última vez: hoy';
      cerrarVentana();
      showToast('Contraseña actualizada correctamente.', 'success');
    } catch (err) {
      console.error('Error cambiando contraseña:', err);
      showToast('No se pudo conectar. Revisa tu internet e intenta de nuevo.', 'error');
    } finally {
      btn.disabled = false; $('guardarPassTxt').textContent = 'Cambiar contraseña';
    }
  });

  // ---------------------------------------------------------------
  // ACORDEONES: en celular se abren y cierran; en computador siempre están abiertos
  // ---------------------------------------------------------------
  function ajustarAcordeones(){
    const movil = window.innerWidth <= 1000;
    document.querySelectorAll('.acc').forEach(function(d){
      if (movil) { if (!d.dataset.init) { d.open = false; d.dataset.init = '1'; } }
      else { d.open = true; delete d.dataset.init; }
    });
  }
  window.addEventListener('resize', ajustarAcordeones);

  // ---------------------------------------------------------------
  // VENTANAS (editar datos, contraseña, avisos)
  // ---------------------------------------------------------------
  let ventanaAbierta = null, focoPrevio = null;
  function abrirVentana(id){
    const v = $(id); if (!v) return;
    if (id === 'mdlDatos') rellenarFormulario();
    focoPrevio = document.activeElement;
    ventanaAbierta = v; v.hidden = false;
    document.body.style.overflow = 'hidden';
    const primero = v.querySelector('input:not([disabled]),select,button.bp');
    if (primero && window.matchMedia('(pointer:fine)').matches) setTimeout(function(){ primero.focus(); }, 30);
  }
  function cerrarVentana(){
    if (!ventanaAbierta) return;
    ventanaAbierta.hidden = true; ventanaAbierta = null;
    document.body.style.overflow = '';
    if (focoPrevio && focoPrevio.focus) focoPrevio.focus({ preventScroll: true });
  }
  document.addEventListener('click', function(e){
    const ab = e.target.closest('[data-abrir]');
    if (ab) { abrirVentana(ab.dataset.abrir); return; }
    if (e.target.closest('[data-cerrar]') || e.target.classList.contains('mdl')) cerrarVentana();
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && ventanaAbierta) cerrarVentana(); });

  // ---------------------------------------------------------------
  // CERRAR SESIÓN
  // ---------------------------------------------------------------
  const overlay = $('confirmOverlay');
  function abrirConfirmacion(){ overlay.classList.add('show'); $('confirmCancel').focus(); }
  function cerrarConfirmacion(){ overlay.classList.remove('show'); }
  $('confirmCancel').addEventListener('click', cerrarConfirmacion);
  overlay.addEventListener('click', e => { if (e.target === overlay) cerrarConfirmacion(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarConfirmacion(); });

  $('confirmOk').addEventListener('click', async function(){
    if (saliendo) return;
    saliendo = true;
    this.disabled = true; this.textContent = 'Cerrando sesión...';
    try {
      const r = await conTiempo(supabaseClient.auth.signOut());
      if (r && r.error) throw r.error;
      limpiarCaches();
      window.location.replace('login.html');
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
      saliendo = false;
      this.disabled = false; this.textContent = 'Cerrar sesión';
      cerrarConfirmacion();
      showToast('No se pudo cerrar la sesión. Intenta de nuevo.', 'error');
    }
  });

  // ---------------------------------------------------------------
  // SESIÓN Y REFRESCO
  // ---------------------------------------------------------------
  supabaseClient.auth.onAuthStateChange(function(evento){
    if (evento === 'SIGNED_OUT') window.location.replace('login.html');
  });
  $('avisoBtn').addEventListener('click', actualizarDatos);

  window.addEventListener('pageshow', function(e){
    if (e.persisted && usuarioActual) { renderNotificaciones(); actualizarDatos(); }
  });
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden && usuarioActual && leerPref(PREF_AUTO, 'on') !== 'off' && Date.now() - ultimaActualizacion > 30000) actualizarDatos();
  });
  window.addEventListener('online', function(){ if (usuarioActual) actualizarDatos(); });

  // ---------------------------------------------------------------
  // INICIO
  // ---------------------------------------------------------------
  async function iniciar(){
    ajustarAcordeones();
    aplicarPrefs();

    let session = null;
    try {
      const res = await supabaseClient.auth.getSession();
      session = res.data.session;
    } catch (err) {
      console.error('No se pudo leer la sesión:', err);
    }
    if (!session) { window.location.replace('login.html'); return; }

    usuarioActual = session.user;
    pintarUsuario();
    pintarEncabezadoCuenta();

    const cache = leerCache();
    if (cache) { datos = cache; datosListos = true; pintarActividad(); }

    // El perfil y los datos se piden al mismo tiempo
    await Promise.all([cargarPerfil(), actualizarDatos()]);
  }

  iniciar();

})();
