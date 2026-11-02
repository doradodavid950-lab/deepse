/* ==========================================================
   Lógica del módulo: productos.html
   Extraída del HTML sin cambios: mismo código y mismo orden de ejecución.
   ========================================================== */
(function(){
  'use strict';

  const $ = function(id){ return document.getElementById(id); };

  // Si el SDK no cargó (sin internet) se avisa y se ofrece recargar
  if (typeof supabase === 'undefined') {
    $('avisoTexto').textContent = 'No se pudo cargar el sistema. Revisa tu conexión e intenta de nuevo.';
    $('avisoBtn').textContent = 'Recargar';
    $('aviso').classList.add('show');
    $('avisoBtn').addEventListener('click', function(){ window.location.reload(); });
    $('loadingState').hidden = true;
    return;
  }

  const supabaseClient = DSI.cliente();

  const COLUMNAS   = 'id,nombre,nombre_cientifico,categoria,proveedor,proveedor_id,fecha_captura,origen,estado,descripcion,observaciones,created_at';
  const CATEGORIAS = ['Peces', 'Mariscos', 'Moluscos', 'Otros'];
  const TAM_PAGINA = 25;        // filas que se dibujan por tanda (mantiene la página ligera)
  const LIMITE_MS  = 15000;     // tiempo máximo de espera por una consulta

  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Preferencias que se cambian en "Mi cuenta" (se guardan en este dispositivo)
  const PREF_NOTIF = 'deepsea_notificaciones';
  const PREF_AUTO  = 'deepsea_actualizacion';
  function leerPref(clave, porDefecto){
    try { const v = localStorage.getItem(clave); return v === null ? porDefecto : v; }
    catch (e) { return porDefecto; }
  }
  function aplicarPrefs(){
    $('notifWrap').hidden = leerPref(PREF_NOTIF, 'on') === 'off';
  }

  // ---------------------------------------------------------------
  // ESTADO DE LA PÁGINA
  // ---------------------------------------------------------------
  let usuarioActual = null;
  let productos = [];            // todos los productos
  let filtrados = [];            // los que cumplen los filtros
  let recepcionesNotif = [];     // últimas recepciones (solo para las notificaciones)
  let limiteMostrar = TAM_PAGINA;
  let datosListos = false;
  let errorCarga = false;
  let cargando = false;
  let guardando = false;
  let eliminando = false;
  let formSucio = false;
  let idPorEliminar = null;
  let idPendiente = null;        // producto a resaltar (viene de una notificación)
  let firmaDatos = '';
  let ultimaActualizacion = 0;
  let notifsActuales = [];
  let proveedoresBusqueda = [];  // solo para el buscador de la barra superior
  let toastTimer = null;
  let debounceTimer = null;
  const indice = new WeakMap();  // texto normalizado de cada producto para buscar rápido

  // ---------------------------------------------------------------
  // UTILIDADES
  // ---------------------------------------------------------------
  function escapeHTML(texto){
    return String(texto == null ? '' : texto).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  // Quita tildes y pasa a minúsculas (buscar "pelagico" encuentra "Pelágico")
  function normalizar(texto){
    return String(texto == null ? '' : texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  // Quita espacios de más: "  Pargo   Rojo " -> "Pargo Rojo"
  function colapsar(texto){
    return String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
  }

  const fmtPeso = function(n){ return (Math.round(n * 100) / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' kg'; };

  // Si llega solo "2026-09-23" se toma como fecha LOCAL (si no, en Colombia se vería un día antes)
  function parsearFecha(valor){
    if (!valor) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      const p = valor.split('-').map(Number);
      return new Date(p[0], p[1] - 1, p[2]);
    }
    const f = new Date(valor);
    return isNaN(f.getTime()) ? null : f;
  }
  function formatearFecha(valor){
    const f = parsearFecha(valor);
    return f ? f.toLocaleDateString('es-CO') : '-';
  }

  function hoyISO(){
    const d = new Date();
    const p = function(n){ return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // Cancela la espera si la conexión se cuelga
  function conTiempo(promesa){
    let t;
    const limite = new Promise(function(_, rechazar){
      t = setTimeout(function(){ rechazar(new Error('Tiempo de espera agotado')); }, LIMITE_MS);
    });
    return Promise.race([promesa, limite]).finally(function(){ clearTimeout(t); });
  }

  // Convierte los errores técnicos de Supabase en mensajes claros
  function mensajeError(error, accion){
    const msg = String((error && error.message) || '').toLowerCase();
    const code = error && error.code;
    if (accion === 'eliminar' && (code === '23503' || msg.indexOf('foreign key') !== -1)) {
      return 'No se puede eliminar: el producto está asociado a otros registros (por ejemplo, recepciones). Puedes marcarlo como Inactivo.';
    }
    if (code === '42501' || msg.indexOf('row-level security') !== -1 || msg.indexOf('permission') !== -1) {
      return 'No tienes permiso para realizar esta acción.';
    }
    if (code === '23505' || msg.indexOf('duplicate') !== -1) return 'Ya existe un registro con esos datos.';
    if (code === '23502') return 'Falta un dato obligatorio.';
    if (msg.indexOf('failed to fetch') !== -1 || msg.indexOf('network') !== -1 || msg.indexOf('tiempo de espera') !== -1) {
      return 'No se pudo conectar. Revisa tu internet e intenta de nuevo.';
    }
    console.warn('Error al ' + accion + ':', error);
    return 'No se pudo ' + accion + ' el producto. Intenta de nuevo.';
  }

  function showToast(mensaje, tipo){
    const t = $('toast');
    t.textContent = mensaje;
    t.className = 'toast show' + (tipo ? ' ' + tipo : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.className = 'toast'; }, 3400);
  }

  function mostrarAviso(texto){ $('avisoTexto').textContent = texto; $('aviso').classList.add('show'); }
  function ocultarAviso(){ $('aviso').classList.remove('show'); }

  // Bloquea el scroll de la página cuando hay una ventana o el menú abierto
  function actualizarScroll(){
    const bloquear = $('modalOverlay').classList.contains('show') ||
      $('confirmOverlay').classList.contains('show');
    document.body.classList.toggle('sin-scroll', bloquear);
  }

  // ---------------------------------------------------------------
  // CLASIFICACIÓN DE ESTADOS DE RECEPCIÓN (igual que en Inicio)
  // ---------------------------------------------------------------
  const PALABRAS_PROBLEMA  = ['rechaz', 'dano', 'danad', 'deterior', 'vencid', 'cancelad', 'inactiv', 'no apto'];
  const PALABRAS_PENDIENTE = ['pendiente', 'evaluacion', 'revision', 'observ'];

  function clasificarEstado(estado){
    const e = normalizar(estado);
    if (PALABRAS_PROBLEMA.some(function(p){ return e.indexOf(p) !== -1; }))  return 'warn';
    if (PALABRAS_PENDIENTE.some(function(p){ return e.indexOf(p) !== -1; })) return 'pend';
    return 'ok';
  }

  // ---------------------------------------------------------------
  // USUARIO
  // ---------------------------------------------------------------
  function pintarUsuario(){
    const u = usuarioActual;
    const meta = u.user_metadata || {};
    const nombre = (meta.full_name || meta.name || (u.email || '').split('@')[0] || 'Usuario').trim() || 'Usuario';
    const inicial = nombre.charAt(0).toUpperCase();
    $('topUserName').textContent = nombre;
    $('topAvatar').textContent   = inicial;
  }

  // ---------------------------------------------------------------
  // CACHÉ LOCAL: al volver a la página se ve al instante lo último
  // guardado y en segundo plano se piden los datos nuevos.
  // ---------------------------------------------------------------
  const claveCache = function(){ return 'dsi_prod_' + usuarioActual.id; };

  function leerCache(){
    try {
      const c = JSON.parse(localStorage.getItem(claveCache()) || 'null');
      if (Array.isArray(c)) return c;
    } catch (e) { /* caché dañada: se ignora */ }
    return null;
  }
  function guardarCache(){
    try { localStorage.setItem(claveCache(), JSON.stringify(productos)); } catch (e) { /* sin espacio */ }
  }

  // ---------------------------------------------------------------
  // BÚSQUEDA Y FILTROS
  // ---------------------------------------------------------------
  function indexar(){
    productos.forEach(function(p){
      indice.set(p, normalizar([p.nombre, p.nombre_cientifico, p.proveedor].join(' ')));
    });
  }

  // Lista de proveedores registrados (activos) + opción para registrar uno nuevo.
  // Si el producto tiene un proveedor antiguo escrito a mano, se conserva como opción.
  const NUEVO_PROV = '__nuevo__';
  function actualizarProveedores(seleccion){
    const sel = $('pProveedor');
    const actual = seleccion !== undefined ? seleccion : sel.value;
    const nombres = [];
    const vistos = {};
    proveedoresBusqueda.forEach(function(p){
      const v = colapsar(p.nombre);
      if (!v || vistos[normalizar(v)]) return;
      if (p.estado && normalizar(p.estado) !== 'activo' && normalizar(v) !== normalizar(actual)) return;
      vistos[normalizar(v)] = true; nombres.push(v);
    });
    if (actual && actual !== NUEVO_PROV && !vistos[normalizar(actual)]) nombres.push(actual);
    nombres.sort(function(a, b){ return a.localeCompare(b, 'es'); });
    sel.innerHTML = '<option value="">Sin proveedor</option>' +
      nombres.map(function(v){ return '<option value="' + escapeHTML(v) + '">' + escapeHTML(v) + '</option>'; }).join('') +
      '<option value="' + NUEVO_PROV + '">+ Registrar nuevo proveedor…</option>';
    sel.value = (actual && actual !== NUEVO_PROV) ? actual : '';
  }

  // Completa únicamente los campos existentes que dependen del proveedor.
  function proveedorSeleccionado(valor){
    const nombre = valor !== undefined ? valor : $('pProveedor').value;
    return proveedoresBusqueda.find(function(p){ return normalizar(p.nombre) === normalizar(nombre); }) || null;
  }
  // El lugar de origen se llena con la ubicación del proveedor, salvo que ya hayas escrito otro a mano.
  let origenAuto = false;
  function marcarOrigenAuto(on){ origenAuto = on; $('pOrigenHint').hidden = !on; }
  function autocompletarDatosProveedor(proveedor){
    const o = $('pOrigen');
    if (proveedor && proveedor.ubicacion && (!o.value.trim() || origenAuto)) {
      o.value = String(proveedor.ubicacion).slice(0, 100);
      marcarOrigenAuto(true);
    } else if (!proveedor && origenAuto) {
      o.value = '';
      marcarOrigenAuto(false);
    }
  }
  $('pProveedor').addEventListener('change', function(){
    if ($('pProveedor').value === NUEVO_PROV) return;
    autocompletarDatosProveedor(proveedorSeleccionado());
  });
  $('pOrigen').addEventListener('input', function(){ if (origenAuto) marcarOrigenAuto(false); });

  // Al elegir "Registrar nuevo proveedor" se guarda lo escrito, se abre Proveedores y,
  // al guardar allí, se vuelve aquí con el proveedor ya elegido.
  const CLAVE_BORRADOR = 'dsi_borrador_producto';
  $('pProveedor').addEventListener('change', function(){
    if ($('pProveedor').value !== NUEVO_PROV) return;
    try {
      sessionStorage.setItem(CLAVE_BORRADOR, JSON.stringify({
        id: $('productoId').value, nombre: $('pNombre').value, cientifico: $('pCientifico').value,
        categoria: $('pCategoria').value, fecha: $('pFecha').value, origen: $('pOrigen').value,
        estado: $('pEstado').value, descripcion: $('pDescripcion').value, observaciones: $('pObservaciones').value,
        quitar: Array.from(nbQuitadas), extras: Array.from(nbExtras)
      }));
    } catch (e) { /* sin almacenamiento: se abre igual, pero sin recordar lo escrito */ }
    window.location.href = 'proveedores.html?nuevo=1&volver=productos';
  });

  // ---------------------------------------------------------------
  // AUTOCOMPLETAR: al escribir el nombre se sugieren los productos ya registrados;
  // al elegir uno se llena el nombre científico. Si es nuevo, se sigue escribiendo normal.
  // ---------------------------------------------------------------
  const acLista = $('acNombre');
  let acItems = [], acActivo = -1;

  function productosUnicos(){
    const mapa = new Map();
    productos.forEach(function(p){
      const n = colapsar(p.nombre);
      if (!n) return;
      const k = normalizar(n);
      const g = mapa.get(k);
      const c = colapsar(p.nombre_cientifico);
      if (!g) mapa.set(k, { nombre: n, cientifico: c });
      else if (!g.cientifico && c) g.cientifico = c;
    });
    return Array.from(mapa.values());
  }
  function acCerrar(){
    acLista.hidden = true; acLista.innerHTML = '';
    acItems = []; acActivo = -1;
    $('pNombre').setAttribute('aria-expanded', 'false');
  }
  function acMarcar(i){
    acActivo = i;
    Array.prototype.forEach.call(acLista.children, function(el, j){
      el.classList.toggle('activo', j === i);
      if (j === i) el.scrollIntoView({ block: 'nearest' });
    });
  }
  function acElegir(i){
    const it = acItems[i];
    if (!it) return;
    $('pNombre').value = it.nombre;
    if (it.cientifico) $('pCientifico').value = it.cientifico;
    $('fieldNombre').classList.remove('invalid');
    $('fieldCientifico').classList.remove('invalid');
    formSucio = true;
    acCerrar();
  }
  function acMostrar(){
    // Solo al crear: al editar un producto no se sugiere ni se pisan sus datos
    if ($('productoId').value) { acCerrar(); return; }
    const q = normalizar(colapsar($('pNombre').value));
    if (!q) { acCerrar(); return; }
    const hallados = productosUnicos().filter(function(g){
      return normalizar(g.nombre).indexOf(q) > -1 || normalizar(g.cientifico).indexOf(q) > -1;
    }).sort(function(a, b){
      const ea = normalizar(a.nombre).indexOf(q) === 0 ? 0 : 1, eb = normalizar(b.nombre).indexOf(q) === 0 ? 0 : 1;
      return ea - eb || a.nombre.localeCompare(b.nombre, 'es');
    }).slice(0, 6);
    if (!hallados.length) { acCerrar(); return; }
    acItems = hallados; acActivo = -1;
    acLista.innerHTML = hallados.map(function(g, i){
      return '<button type="button" class="ac-op" role="option" tabindex="-1" data-i="' + i + '"><b>' + escapeHTML(g.nombre) + '</b>' +
        (g.cientifico ? '<span>' + escapeHTML(g.cientifico) + '</span>' : '') + '</button>';
    }).join('');
    acLista.hidden = false;
    $('pNombre').setAttribute('aria-expanded', 'true');
  }
  $('pNombre').addEventListener('input', acMostrar);
  $('pNombre').addEventListener('keydown', function(e){
    if (acLista.hidden) return;
    if (e.key === 'ArrowDown') { acMarcar(acActivo + 1 >= acItems.length ? 0 : acActivo + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { acMarcar(acActivo <= 0 ? acItems.length - 1 : acActivo - 1); e.preventDefault(); }
    else if (e.key === 'Enter' && acActivo > -1) { acElegir(acActivo); e.preventDefault(); }
    else if (e.key === 'Escape') { acCerrar(); e.stopPropagation(); }
  });
  // mousedown evita que el campo pierda el foco antes de registrar el toque
  acLista.addEventListener('mousedown', function(e){ e.preventDefault(); });
  acLista.addEventListener('click', function(e){
    const b = e.target.closest('.ac-op');
    if (b) acElegir(Number(b.dataset.i));
  });
  $('pNombre').addEventListener('blur', function(){
    setTimeout(function(){
      acCerrar();
      // Si escribió el nombre completo de un producto existente y dejó el científico vacío, se completa solo
      if ($('productoId').value || colapsar($('pCientifico').value)) return;
      const k = normalizar(colapsar($('pNombre').value));
      const g = k && productosUnicos().find(function(x){ return normalizar(x.nombre) === k && x.cientifico; });
      if (g) $('pCientifico').value = g.cientifico;
    }, 160);
  });
  $('formProducto').addEventListener('reset', acCerrar);

  // Al volver de registrar el proveedor: se reabre la ventana del producto con todo lo que había
  function restaurarBorrador(){
    let b = null, nuevo = null;
    try {
      b = JSON.parse(sessionStorage.getItem(CLAVE_BORRADOR) || 'null');
      nuevo = sessionStorage.getItem('dsi_prov_nuevo');
      sessionStorage.removeItem(CLAVE_BORRADOR);
      sessionStorage.removeItem('dsi_prov_nuevo');
    } catch (e) { /* se ignora */ }
    if (!b) return;
    const existente = b.id ? productos.find(function(p){ return String(p.id) === String(b.id); }) : null;
    abrirModal(existente ? 'editar' : 'nuevo', existente || null);
    $('pNombre').value = b.nombre || '';
    $('pCientifico').value = b.cientifico || '';
    $('pCategoria').value = b.categoria || '';
    $('pFecha').value = b.fecha || '';
    $('pOrigen').value = b.origen || '';
    $('pEstado').value = b.estado || 'Activo';
    $('pDescripcion').value = b.descripcion || '';
    $('pObservaciones').value = b.observaciones || ''; $('pConObs').checked = !!$('pObservaciones').value; $('pConDesc').checked = !!$('pDescripcion').value; $('pDescripcion').hidden = !$('pConDesc').checked; $('pObservaciones').hidden = !$('pConObs').checked;
    let proveedorNuevo = nuevo;
    if (typeof nuevo === 'string' && nuevo) {
      try { proveedorNuevo = JSON.parse(nuevo); } catch (e) { proveedorNuevo = { nombre: nuevo }; }
    }
    const nombreProveedor = (proveedorNuevo && proveedorNuevo.nombre) || (existente && existente.proveedor) || '';
    actualizarProveedores(nombreProveedor);
    const proveedorRestaurado = (proveedorNuevo && proveedorNuevo.id && proveedoresBusqueda.find(function(p){ return String(p.id) === String(proveedorNuevo.id); })) || proveedorSeleccionado(nombreProveedor);
    if (proveedorRestaurado) autocompletarDatosProveedor(proveedorSeleccionado(proveedorRestaurado.nombre) || proveedorRestaurado);
    nbQuitadas = new Set(b.quitar || []);
    nbExtras = new Set(b.extras || []);
    nbPintar();
    formSucio = true;
    if (nuevo) showToast('Proveedor registrado. Continúa con el producto.', 'success');
  }

  function hayFiltros(){
    return !!(colapsar($('fSearch').value) || $('fCategoria').value || $('fEstado').value);
  }

  function aplicarFiltros(reiniciar){
    const q   = normalizar($('fSearch').value);
    const cat = $('fCategoria').value;
    const est = normalizar($('fEstado').value);

    filtrados = productos.filter(function(p){
      if (q && (indice.get(p) || '').indexOf(q) === -1) return false;
      if (cat && (p.categoria || 'Otros') !== cat) return false;
      if (est && normalizar(p.estado || 'Activo') !== est) return false;
      return true;
    });

    if (reiniciar) limiteMostrar = TAM_PAGINA;
    renderTabla();
    if (typeof sincronizarChips === 'function') sincronizarChips();
  }

  // ---------------------------------------------------------------
  // TABLA
  // ---------------------------------------------------------------
  // Cada categoría tiene su icono y su color
  const ICONO_CAT = { peces: 'i-fish', mariscos: 'i-crab', moluscos: 'i-shell', otros: 'i-anchor' };

  function filaHTML(p){
    const id = escapeHTML(p.id);
    const nombre = escapeHTML(p.nombre);
    const estadoClase = normalizar(p.estado) === 'inactivo' ? 'inactivo' : 'activo';
    const cient = p.nombre_cientifico ? escapeHTML(p.nombre_cientifico) : '—';
    const prov  = p.proveedor ? escapeHTML(p.proveedor) : '—';
    const fecha = formatearFecha(p.fecha_captura);
    const cat   = escapeHTML(p.categoria || 'Otros');
    const catKey = normalizar(p.categoria || 'Otros');
    const catClase = 'cat-' + catKey;

    return '<tr data-id="' + id + '">' +
      '<td><div class="nom"><span class="chip ch-' + catKey + '" title="' + cat + '"><svg class="i" aria-hidden="true"><use href="#' + (ICONO_CAT[catKey] || 'i-anchor') + '"/></svg></span><strong>' + nombre + '</strong></div></td>' +
      '<td class="cient ' + (p.nombre_cientifico ? '' : 'sin-dato') + '">' + cient + '</td>' +
      '<td><span class="cat-tag ' + catClase + '">' + cat + '</span></td>' +
      '<td class="' + (p.proveedor ? '' : 'sin-dato') + '">' + prov + '</td>' +
      '<td class="' + (fecha === '-' ? 'sin-dato' : '') + '">' + (fecha === '-' ? '—' : fecha) + '</td>' +
      '<td><span class="pill ' + estadoClase + '">' + escapeHTML(p.estado || 'Activo') + '</span></td>' +
      '<td><div class="row-actions">' +
        '<button class="action-btn" type="button" data-action="editar" data-id="' + id + '" title="Editar" aria-label="Editar ' + nombre + '"><svg class="i" aria-hidden="true"><use href="#i-edit"/></svg></button>' +
        '<button class="action-btn danger" type="button" data-action="eliminar" data-id="' + id + '" title="Eliminar" aria-label="Eliminar ' + nombre + '"><svg class="i" aria-hidden="true"><use href="#i-trash"/></svg></button>' +
      '</div></td>' +
      // Solo se ve en celular (la tarjeta resume categoría, proveedor y fecha)
      '<td class="c-meta"><span class="cat-tag ' + catClase + '">' + cat + '</span>' +
        (p.proveedor ? '<span>' + prov + '</span>' : '') +
        (fecha !== '-' ? '<span>' + fecha + '</span>' : '') + '</td>' +
    '</tr>';
  }

  function renderTabla(){
    const total = productos.length;
    const tabla = $('tablaProductos');
    const vacio = $('emptyState');

    $('countBadge').textContent = (filtrados.length === total) ? String(total) : (filtrados.length + ' de ' + total);

    if (!total) {
      tabla.hidden = true;
      $('masWrap').hidden = true;
      vacio.hidden = false;
      vacio.innerHTML = errorCarga
        ? '<div class="ico"><svg class="i" aria-hidden="true"><use href="#i-filter"/></svg></div>No se pudo cargar la información.'
        : '<div class="ico"><svg class="i" aria-hidden="true"><use href="#i-fish"/></svg></div>No hay productos registrados todavía.<br>Crea el primero con "Nuevo producto".';
      return;
    }

    if (!filtrados.length) {
      tabla.hidden = true;
      $('masWrap').hidden = true;
      vacio.hidden = false;
      vacio.innerHTML = '<div class="ico"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg></div>No se encontraron productos con esos filtros.' +
        '<br><button class="bg" type="button" data-action="limpiar">Limpiar filtros</button>';
      return;
    }

    vacio.hidden = true;
    tabla.hidden = false;

    $('tbodyProductos').innerHTML = filtrados.slice(0, limiteMostrar).map(filaHTML).join('');

    const restantes = filtrados.length - limiteMostrar;
    $('masWrap').hidden = restantes <= 0;
    if (restantes > 0) $('btnMas').textContent = 'Mostrar más (' + restantes + ' restantes)';
  }

  // Resalta una fila (al llegar desde una notificación o al guardar)
  function resaltarProducto(id){
    const sid = String(id);
    let idx = filtrados.findIndex(function(p){ return String(p.id) === sid; });

    if (idx === -1) {
      if (!productos.some(function(p){ return String(p.id) === sid; })) {
        showToast('Ese producto ya no existe.', 'error');
        return;
      }
      // Estaba oculto por los filtros: se limpian para mostrarlo
      $('fSearch').value = ''; $('fCategoria').value = ''; $('fEstado').value = '';
      aplicarFiltros(true);
      idx = filtrados.findIndex(function(p){ return String(p.id) === sid; });
    }

    if (idx >= limiteMostrar) { limiteMostrar = idx + 1; renderTabla(); }

    const fila = Array.prototype.find.call($('tbodyProductos').children, function(tr){ return tr.dataset.id === sid; });
    if (!fila) return;

    fila.scrollIntoView({ behavior: reducirMovimiento ? 'auto' : 'smooth', block: 'center' });
    fila.classList.remove('resaltado');
    void fila.offsetWidth;                       // reinicia la animación
    fila.classList.add('resaltado');
    setTimeout(function(){ fila.classList.remove('resaltado'); }, 3600);
  }

  // ---------------------------------------------------------------
  // CARGA DE DATOS
  // Productos y recepciones (solo para notificaciones) se piden en
  // paralelo. Si los datos no cambiaron, no se vuelve a dibujar nada.
  // ---------------------------------------------------------------
  async function cargarProductos(){
    if (cargando) return;
    cargando = true;
    if (!datosListos) $('loadingState').hidden = false;

    let hayError = false;
    try {
      const res = await conTiempo(Promise.all([
        supabaseClient.from('productos').select(COLUMNAS).order('created_at', { ascending: false }),
        supabaseClient
          .from('recepciones')
          .select('id,peso,estado_producto,fecha_recepcion,productos(nombre)')
          .order('fecha_recepcion', { ascending: false, nullsFirst: false })
          .limit(200),
        supabaseClient.from('proveedores').select('id,nombre,estado,ubicacion')
      ]));

      if (res[0].error) { hayError = true; console.error('Error productos:', res[0].error); }
      else productos = res[0].data || [];

      // Si fallan las recepciones solo se pierden esas notificaciones; no bloquea la página
      if (!res[1].error) recepcionesNotif = res[1].data || [];
      else console.warn('Error recepciones (notificaciones):', res[1].error);

      if (!res[2].error) { proveedoresBusqueda = res[2].data || []; actualizarProveedores(); }
    } catch (err) {
      hayError = true;
      console.error('Error cargando productos:', err);
    }

    cargando = false;
    $('loadingState').hidden = true;
    errorCarga = hayError;

    if (hayError) {
      mostrarAviso('No se pudieron actualizar los productos. Revisa tu conexión.');
      if (!datosListos) { datosListos = true; renderTabla(); }
      return;
    }

    ocultarAviso();
    datosListos = true;
    ultimaActualizacion = Date.now();

    const firma = JSON.stringify([productos, recepcionesNotif]);
    if (firma !== firmaDatos) {
      firmaDatos = firma;
      guardarCache();
      indexar();
      actualizarProveedores();
      aplicarFiltros(false);
      renderNotificaciones();
    }

    if (idPendiente) { const id = idPendiente; idPendiente = null; resaltarProducto(id); }
  }

  // Después de crear/editar/eliminar: se actualiza la lista al instante
  // sin volver a pedirlo todo al servidor.
  function despuesDeCambio(){
    firmaDatos = JSON.stringify([productos, recepcionesNotif]);
    indexar();
    actualizarProveedores();
    guardarCache();
    aplicarFiltros(false);
    renderNotificaciones();
  }

  // ---------------------------------------------------------------
  // NOTIFICACIONES (mismo comportamiento que en Inicio)
  // Al hacer clic: se marca como leída (desaparece, y se recuerda en este
  // navegador) y se abre el módulo de donde viene.
  // ---------------------------------------------------------------
  const claveLeidas = function(){ return 'dsi_notif_leidas_' + usuarioActual.id; };

  function leerLeidas(){
    try { return new Set(JSON.parse(localStorage.getItem(claveLeidas()) || '[]')); }
    catch (e) { return new Set(); }
  }
  function guardarLeidas(set){
    try { localStorage.setItem(claveLeidas(), JSON.stringify(Array.from(set).slice(-300))); } catch (e) {}
  }

  function construirNotificaciones(){
    const lista = [];

    recepcionesNotif.forEach(function(r){
      const estado = r.estado_producto || 'Recibido';
      const clase = clasificarEstado(estado);
      if (clase === 'ok') return;                         // solo lo que requiere atención
      const prod = Array.isArray(r.productos) ? r.productos[0] : r.productos;
      lista.push({
        key: 'rec:' + r.id + ':' + normalizar(estado),
        tipo: clase,
        titulo: 'Recepción ' + estado.toLowerCase(),
        texto: ((prod && prod.nombre) || 'Producto') + ' — ' + fmtPeso(Number(r.peso) || 0),
        fecha: formatearFecha(r.fecha_recepcion),
        href: 'recepciones.html?id=' + encodeURIComponent(r.id),
        refId: null
      });
    });

    productos.forEach(function(p){
      if (normalizar(p.estado) !== 'inactivo') return;
      lista.push({
        key: 'prod:' + p.id,
        tipo: 'info',
        titulo: 'Producto inactivo',
        texto: p.nombre || 'Producto',
        fecha: '',
        href: 'productos.html?id=' + encodeURIComponent(p.id),
        refId: p.id
      });
    });

    return lista;
  }

  function actualizarGlobo(){
    const leidas = leerLeidas();
    const total = notifsActuales.filter(function(n){ return !leidas.has(n.key); }).length;
    const globo = $('notificationBadge');
    globo.textContent = total > 9 ? '9+' : String(total);
    globo.classList.toggle('show', total > 0);
    $('notificationBtn').setAttribute('aria-label', total ? 'Notificaciones (' + total + ' sin leer)' : 'Notificaciones');
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
    notifsActuales = construirNotificaciones().filter(function(n){ return !leidas.has(n.key); }).slice(0, 30);
    actualizarGlobo();

    const cont = $('notificationContent');
    if (!notifsActuales.length) {
      cont.innerHTML = '<div class="notification-empty">No tienes notificaciones nuevas.</div>';
      return;
    }

    cont.innerHTML = notifsActuales.map(function(n, i){
      return '<a class="notification-item" href="' + escapeHTML(n.href) + '" data-i="' + i + '">' +
        '<div class="ni-icon t-' + n.tipo + '">' + iconoNotif(n.tipo) + '</div>' +
        '<div class="ni-body">' +
          '<strong>' + escapeHTML(n.titulo) + '</strong>' +
          '<span>' + escapeHTML(n.texto) + '</span>' +
          ((n.fecha && n.fecha !== '-') ? '<em>' + escapeHTML(n.fecha) + '</em>' : '') +
        '</div>' +
        '<span class="ni-go">›</span>' +
      '</a>';
    }).join('');
  }

  const panelNotif = $('notificationPanel');
  const btnNotif = $('notificationBtn');

  function cerrarPanel(){
    panelNotif.classList.remove('show');
    btnNotif.setAttribute('aria-expanded', 'false');
  }

  btnNotif.addEventListener('click', function(e){
    e.stopPropagation();
    const abierto = panelNotif.classList.toggle('show');
    btnNotif.setAttribute('aria-expanded', String(abierto));
  });
  $('closeNotifications').addEventListener('click', cerrarPanel);
  document.addEventListener('click', function(e){
    if (!panelNotif.contains(e.target) && !btnNotif.contains(e.target)) cerrarPanel();
  });

  // Clic en una notificación
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

      // Si la notificación es de un producto, ya estamos en su módulo:
      // se resalta en la lista sin recargar la página.
      if (n.refId !== null && n.refId !== undefined) {
        cerrarPanel();
        resaltarProducto(n.refId);
      } else {
        window.location.href = n.href;
      }
    }, 170);
  });

  $('markAllRead').addEventListener('click', function(){
    const leidas = leerLeidas();
    construirNotificaciones().forEach(function(n){ leidas.add(n.key); });
    guardarLeidas(leidas);
    renderNotificaciones();
  });

  // ---------------------------------------------------------------
  // VENTANA NUEVO / EDITAR
  // ---------------------------------------------------------------
  const form = $('formProducto');
  const CAMPOS_ERROR = ['fieldNombre', 'fieldCientifico', 'fieldCategoria', 'fieldFecha'];

  function limpiarErrores(){
    CAMPOS_ERROR.forEach(function(id){ $(id).classList.remove('invalid'); });
  }

  function ponerError(idCampo, mensaje){
    const f = $(idCampo);
    f.classList.add('invalid');
    if (mensaje) f.querySelector('.field-error').textContent = mensaje;
  }

  // Al escribir en un campo se le quita el error
  CAMPOS_ERROR.forEach(function(id){
    const el = $(id).querySelector('input,select');
    el.addEventListener('input',  function(){ $(id).classList.remove('invalid'); });
    el.addEventListener('change', function(){ $(id).classList.remove('invalid'); });
  });
  form.addEventListener('input', function(){ formSucio = true; });

  // ---------------------------------------------------------------
  // NORMAS SEGÚN LA CATEGORÍA
  // Al crear el producto, la base de datos le asigna las normas de su categoría.
  // Aquí solo se muestran y se elige qué recomendadas quitar o qué otras agregar.
  // ---------------------------------------------------------------
  const NB_CLAVE_CAT = 'dsi_catalogo_normas_v1';
  const NB_CLAVE_REGLAS = 'dsi_reglas_normas_v1';
  let nbCatalogo = [];
  let nbReglas = [];
  let nbListo = false;
  let nbCargando = null;
  let nbQuitadas = new Set();
  let nbExtras = new Set();
  let nbModo = 'nuevo';
  let nbProducto = null;
  let nbExistentes = [];

  function nbLeer(clave){ try { const t = localStorage.getItem(clave); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  function nbGuardar(clave, v){ try { localStorage.setItem(clave, JSON.stringify(v)); } catch (e) { /* sin espacio */ }; }

  function nbCargarCatalogo(){
    if (nbCargando) return nbCargando;
    nbCargando = (async function(){
      if (!nbListo) {
        const c = nbLeer(NB_CLAVE_CAT);
        if (c && c.length) { nbCatalogo = c; nbReglas = nbLeer(NB_CLAVE_REGLAS) || []; nbListo = true; nbPintar(); }
      }
      try {
        const r = await Promise.all([
          supabaseClient.from('normas_catalogo').select('id,codigo,nombre,tipo,entidad,descripcion,estado,actualizado').order('codigo', { ascending: false }),
          supabaseClient.from('norma_categoria').select('norma_id,categoria,obligatoria')
        ]);
        if (r[0].error) throw r[0].error;
        nbCatalogo = r[0].data || [];
        if (!r[1].error) nbReglas = r[1].data || [];
        nbListo = true;
        nbGuardar(NB_CLAVE_CAT, nbCatalogo);
        nbGuardar(NB_CLAVE_REGLAS, nbReglas);
      } catch (e) { /* si falla se usa lo guardado */ }
      finally { nbCargando = null; }
    })();
    return nbCargando;
  }

  const NB_ICONO_LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const NB_ICONO_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const NB_ESTADO = { 'Sin declarar': ['pe', 'Sin declarar'], 'Declarada': ['o', 'En revisión'], 'Verificada': ['ok', 'Verificada'], 'Rechazada': ['bad', 'Rechazada'], 'No aplica': ['r', 'No aplica'] };

  function nbFila(n, pie, icono, derecha){
    return '<div class="nb-row"><div class="nb-ic">' + icono + '</div><div class="nb-tx"><b>' + escapeHTML(n.nombre) + '</b><small>' +
      escapeHTML((n.descripcion ? n.descripcion + ' · ' : '') + n.entidad) + '</small></div>' + derecha + '</div>';
  }

  function nbPintar(){
    const cont = $('nbLista');
    const info = $('nbInfo');
    const cat = $('pCategoria').value;
    const mapa = new Map(nbCatalogo.map(function(n){ return [n.id, n]; }));
    $('nbAdd').hidden = true;
    $('nbAviso').hidden = true;

    if (!nbListo) { info.textContent = 'Cargando normas…'; cont.innerHTML = ''; return; }

    // ----- editar: se muestran las normas que ya tiene el producto -----
    if (nbModo === 'editar') {
      let texto = 'Las normas de este producto. Declara cada una con su certificado en Normas y calidad.';
      if (nbProducto && cat && cat !== nbProducto.categoria) texto = 'Al guardar, se agregarán las normas obligatorias de la nueva categoría (' + cat + ').';
      info.innerHTML = escapeHTML(texto) + ' <a class="nb-lnk" href="normas.html#productos">Ir a Mis normas →</a>';
      cont.innerHTML = nbExistentes.length ? nbExistentes.map(function(e){
        const n = mapa.get(e.norma_id) || { nombre: 'Norma', descripcion: '', entidad: '' };
        const est = NB_ESTADO[e.estado] || ['r', e.estado];
        return nbFila(n, '', e.obligatoria ? NB_ICONO_LOCK : NB_ICONO_OK,
          '<span class="nb-pill ' + (e.obligatoria ? 'o' : 'r') + '">' + (e.obligatoria ? 'Obligatoria' : 'Recomendada') + '</span>' +
          '<span class="nb-pill ' + est[0] + '">' + est[1] + '</span>');
      }).join('') : '';
      return;
    }

    // ----- nuevo: se muestran según la categoría elegida -----
    if (!cat) { info.textContent = 'Selecciona una categoría para ver las normas que debe cumplir.'; cont.innerHTML = ''; return; }
    const deCat = nbReglas.filter(function(r){ return r.categoria === cat && mapa.has(r.norma_id) && mapa.get(r.norma_id).estado === 'Vigente'; });
    const oblig = deCat.filter(function(r){ return r.obligatoria; }).map(function(r){ return mapa.get(r.norma_id); });
    const recom = deCat.filter(function(r){ return !r.obligatoria; }).map(function(r){ return mapa.get(r.norma_id); });
    const recomActivas = recom.filter(function(n){ return !nbQuitadas.has(n.id); });
    const extras = Array.from(nbExtras).map(function(id){ return mapa.get(id); }).filter(Boolean);

    info.textContent = oblig.length
      ? 'Al guardar, las normas vigentes de ' + cat + ' se asignan automáticamente. ' + oblig.length + (oblig.length === 1 ? ' norma es obligatoria y no se puede quitar' : ' normas son obligatorias y no se pueden quitar') + '. Puedes agregar otras del catálogo.'
      : 'Al guardar, se asignarán las normas vigentes configuradas para ' + cat + '. Por ahora no hay normas obligatorias definidas. Puedes agregar otras del catálogo.';

    cont.innerHTML =
      oblig.map(function(n){ return nbFila(n, '', NB_ICONO_LOCK, '<span class="nb-pill o">Obligatoria</span>'); }).join('') +
      recomActivas.map(function(n){ return nbFila(n, '', NB_ICONO_OK, '<span class="nb-pill r">Recomendada</span><button type="button" class="nb-q" data-nb="' + escapeHTML(n.id) + '">Quitar</button>'); }).join('') +
      extras.map(function(n){ return nbFila(n, '', NB_ICONO_OK, '<span class="nb-pill r">Agregada</span><button type="button" class="nb-q" data-nbx="' + escapeHTML(n.id) + '">Quitar</button>'); }).join('');

    const enLista = new Set(oblig.concat(recomActivas, extras).map(function(n){ return n.id; }));
    const disponibles = nbCatalogo.filter(function(n){ return n.estado === 'Vigente' && !enLista.has(n.id); });
    $('nbSelect').innerHTML = '<option value="">Agregar otra norma del catálogo…</option>' +
      disponibles.map(function(n){ return '<option value="' + escapeHTML(n.id) + '">' + escapeHTML(n.codigo + ' · ' + n.nombre) + '</option>'; }).join('');
    $('nbAdd').hidden = !disponibles.length;
    $('nbAviso').hidden = !oblig.length;
  }

  function nbPrepararModal(modo, producto){
    nbQuitadas = new Set();
    nbExtras = new Set();
    nbModo = modo;
    nbProducto = producto || null;
    nbExistentes = [];
    nbPintar();
    nbCargarCatalogo().then(async function(){
      if (modo === 'editar' && producto) {
        try {
          const r = await supabaseClient.from('producto_normas').select('norma_id,obligatoria,estado').eq('producto_id', producto.id);
          if (!r.error) nbExistentes = (r.data || []).slice().sort(function(a, b){ return (a.obligatoria === b.obligatoria) ? 0 : (a.obligatoria ? -1 : 1); });
        } catch (e) { /* se muestra sin estados */ }
      }
      nbPintar();
    });
  }

  $('pCategoria').addEventListener('change', function(){
    nbQuitadas = new Set();
    nbExtras = new Set();
    nbPintar();
  });
  $('nbLista').addEventListener('click', function(e){
    const q = e.target.closest('[data-nb]');
    const x = e.target.closest('[data-nbx]');
    if (q) { nbQuitadas.add(q.dataset.nb); formSucio = true; nbPintar(); }
    else if (x) { nbExtras.delete(x.dataset.nbx); formSucio = true; nbPintar(); }
  });
  $('nbBtnAdd').addEventListener('click', function(){
    const id = $('nbSelect').value;
    if (!id) { showToast('Elige una norma del catálogo.', 'error'); return; }
    if (nbQuitadas.has(id)) nbQuitadas.delete(id); else nbExtras.add(id);
    formSucio = true;
    nbPintar();
  });

  function nbTomarSeleccion(){
    return { quitar: Array.from(nbQuitadas), extras: Array.from(nbExtras) };
  }

  async function nbAplicar(idProducto, sel){
    if (!sel || (!sel.quitar.length && !sel.extras.length)) return;
    try {
      if (sel.quitar.length) {
        const r = await supabaseClient.from('producto_normas').delete().eq('producto_id', idProducto).in('norma_id', sel.quitar).eq('obligatoria', false);
        if (r.error) throw r.error;
      }
      if (sel.extras.length) {
        const r = await supabaseClient.from('producto_normas').insert(sel.extras.map(function(id){
          return { producto_id: idProducto, norma_id: id, obligatoria: false, estado: 'Sin declarar' };
        }));
        if (r.error) throw r.error;
      }
    } catch (e) {
      showToast('El producto se guardó, pero no se pudieron ajustar algunas normas. Revísalas en Normas y calidad.', 'error');
    }
  }

  // Se precarga el catálogo en segundo plano para que la ventana abra con las normas listas
  setTimeout(nbCargarCatalogo, 1200);


  function abrirModal(modo, producto){
    form.reset();
    limpiarErrores();
    formSucio = false;
    $('pFecha').max = hoyISO();            // no se puede capturar en el futuro

    if (modo === 'editar' && producto) {
      $('modalTitle').textContent = 'Editar producto';
      $('btnGuardarLabel').textContent = 'Guardar cambios';
      $('productoId').value     = producto.id;
      $('pNombre').value        = producto.nombre || '';
      $('pCientifico').value    = producto.nombre_cientifico || '';
      $('pCategoria').value     = producto.categoria || '';
      actualizarProveedores(producto.proveedor || '');
      $('pFecha').value         = producto.fecha_captura ? String(producto.fecha_captura).slice(0, 10) : '';
      $('pOrigen').value        = producto.origen || '';
      $('pEstado').value        = producto.estado || 'Activo';
      $('pDescripcion').value   = producto.descripcion || '';
      $('pObservaciones').value = producto.observaciones || ''; $('pConObs').checked = !!$('pObservaciones').value; $('pConDesc').checked = !!$('pDescripcion').value; $('pDescripcion').hidden = !$('pConDesc').checked; $('pObservaciones').hidden = !$('pConObs').checked;
    } else {
      $('modalTitle').textContent = 'Nuevo producto';
      $('btnGuardarLabel').textContent = 'Guardar producto';
      $('productoId').value = '';
      $('pEstado').value = 'Activo';
      $('pConDesc').checked = false; $('pConObs').checked = false;
      $('pDescripcion').hidden = true; $('pObservaciones').hidden = true;
    }
    marcarOrigenAuto(false);

    nbPrepararModal(modo, producto);
    $('modalOverlay').classList.add('show');
    actualizarScroll();

    // En computador se enfoca el primer campo; en celular no (evita abrir el teclado solo)
    if (window.matchMedia('(pointer:fine)').matches) setTimeout(function(){ $('pNombre').focus(); }, 60);
  }

  function cerrarModal(){
    $('modalOverlay').classList.remove('show');
    actualizarScroll();
  }

  $('btnNuevo').addEventListener('click', function(){ abrirModal('nuevo'); });
  $('btnNuevoFab').addEventListener('click', function(){ abrirModal('nuevo'); });
  $('modalClose').addEventListener('click', cerrarModal);
  $('btnCancelar').addEventListener('click', cerrarModal);

  // Tocar fuera de la ventana la cierra, salvo que ya haya datos escritos
  // (así no se pierde lo digitado por un toque accidental).
  $('modalOverlay').addEventListener('click', function(e){
    if (e.target === $('modalOverlay') && !formSucio) cerrarModal();
  });

  // ---------------------------------------------------------------
  // VALIDACIÓN DEL FORMULARIO
  // ---------------------------------------------------------------
  function validarFormulario(){
    limpiarErrores();
    let ok = true;
    let primero = null;

    function fallo(idCampo, mensaje, input){
      ponerError(idCampo, mensaje);
      ok = false;
      if (!primero) primero = input;
    }

    const nombre = colapsar($('pNombre').value);
    if (nombre.length < 2) {
      fallo('fieldNombre', 'El nombre es obligatorio (mínimo 2 caracteres).', $('pNombre'));
    } else if (!/\p{L}/u.test(nombre)) {
      fallo('fieldNombre', 'El nombre debe contener letras.', $('pNombre'));
    }

    // El nombre científico solo lleva letras, espacios, puntos, guiones y paréntesis
    const cient = colapsar($('pCientifico').value);
    if (cient && !/^\p{L}[\p{L}\s.'()\-×]*$/u.test(cient)) {
      fallo('fieldCientifico', 'Usa solo letras y espacios (ej. Lutjanus campechanus).', $('pCientifico'));
    }

    if (CATEGORIAS.indexOf($('pCategoria').value) === -1) {
      fallo('fieldCategoria', 'Selecciona una categoría.', $('pCategoria'));
    }

    const fecha = $('pFecha').value;
    if (fecha) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < '1990-01-01') {
        fallo('fieldFecha', 'Ingresa una fecha válida.', $('pFecha'));
      } else if (fecha > hoyISO()) {
        fallo('fieldFecha', 'La fecha de captura no puede ser futura.', $('pFecha'));
      }
    }

    // Evita registros idénticos (mismo nombre + proveedor + fecha de captura),
    // por ejemplo al tocar "Guardar" dos veces. Productos con el mismo nombre
    // pero otro proveedor o fecha SÍ se permiten.
    if (ok) {
      const idEditando = $('productoId').value;
      const clave = normalizar(nombre) + '|' + normalizar(colapsar($('pProveedor').value)) + '|' + (fecha || '');
      const repetido = productos.some(function(p){
        return String(p.id) !== String(idEditando) &&
          (normalizar(colapsar(p.nombre)) + '|' + normalizar(colapsar(p.proveedor)) + '|' + String(p.fecha_captura || '').slice(0, 10)) === clave;
      });
      if (repetido) {
        fallo('fieldNombre', 'Ya existe un registro con el mismo nombre, proveedor y fecha de captura.', $('pNombre'));
      }
    }

    if (primero) primero.focus();
    return ok;
  }

  // ---------------------------------------------------------------
  // GUARDAR (crear / actualizar)
  // ---------------------------------------------------------------
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    if (guardando) return;

    if (!validarFormulario()) {
      showToast('Revisa los campos marcados en rojo.', 'error');
      return;
    }

    const idEditando = $('productoId').value;
    const payload = {
      nombre:            colapsar($('pNombre').value),
      nombre_cientifico: colapsar($('pCientifico').value) || null,
      categoria:         $('pCategoria').value,
      proveedor:         colapsar($('pProveedor').value) || null,
      proveedor_id:      (proveedorSeleccionado() && proveedorSeleccionado().id) || null,
      fecha_captura:     $('pFecha').value || null,
      origen:            colapsar($('pOrigen').value) || null,
      estado:            $('pEstado').value,
      descripcion:       $('pDescripcion').value.trim() || null,
      observaciones:     $('pObservaciones').value.trim() || null
    };

    const normasElegidas = idEditando ? null : nbTomarSeleccion();

    guardando = true;
    $('btnGuardar').disabled = true;
    $('btnGuardarLabel').textContent = 'Guardando...';

    let resultado;
    try {
      resultado = idEditando
        ? await conTiempo(supabaseClient.from('productos').update(payload).eq('id', idEditando).select(COLUMNAS))
        : await conTiempo(supabaseClient.from('productos').insert(payload).select(COLUMNAS));
    } catch (err) {
      resultado = { error: err };
    }

    guardando = false;
    $('btnGuardar').disabled = false;
    $('btnGuardarLabel').textContent = idEditando ? 'Guardar cambios' : 'Guardar producto';

    if (resultado.error) {
      showToast(mensajeError(resultado.error, 'guardar'), 'error');
      return;
    }

    const fila = resultado.data && resultado.data[0];

    if (idEditando && !fila) {
      // La actualización no afectó ninguna fila (fue eliminada o no hay permiso)
      showToast('No se pudo actualizar: el producto ya no existe o no tienes permiso.', 'error');
      cerrarModal();
      cargarProductos();
      return;
    }

    cerrarModal();
    showToast(idEditando ? 'Producto actualizado.' : 'Producto creado.', 'success');
    if (!idEditando && fila) nbAplicar(fila.id, normasElegidas);

    if (fila) {
      if (idEditando) {
        const i = productos.findIndex(function(p){ return String(p.id) === String(idEditando); });
        if (i > -1) productos[i] = fila; else productos.unshift(fila);
      } else {
        productos.unshift(fila);
      }
      despuesDeCambio();
      resaltarProducto(fila.id);
    } else {
      firmaDatos = '';
      cargarProductos();      // se insertó pero el servidor no devolvió la fila: se recarga la lista
    }
  });

  // ---------------------------------------------------------------
  // ELIMINAR (con ventana de confirmación)
  // ---------------------------------------------------------------
  function pedirEliminar(id){
    const p = productos.find(function(x){ return String(x.id) === String(id); });
    if (!p) return;
    idPorEliminar = p.id;
    $('confirmTexto').textContent = '¿Eliminar "' + p.nombre + '"? Esta acción no se puede deshacer.';
    $('confirmOverlay').classList.add('show');
    actualizarScroll();
  }

  function cerrarConfirmacion(){
    $('confirmOverlay').classList.remove('show');
    idPorEliminar = null;
    actualizarScroll();
  }

  $('confirmCancelar').addEventListener('click', cerrarConfirmacion);
  $('confirmOverlay').addEventListener('click', function(e){
    if (e.target === $('confirmOverlay')) cerrarConfirmacion();
  });

  $('confirmOk').addEventListener('click', async function(){
    if (eliminando || idPorEliminar === null) return;
    eliminando = true;
    const id = idPorEliminar;
    $('confirmOk').disabled = true;
    $('confirmOk').textContent = 'Eliminando...';

    let resultado;
    try {
      resultado = await conTiempo(supabaseClient.from('productos').delete().eq('id', id).select('id'));
    } catch (err) {
      resultado = { error: err };
    }

    eliminando = false;
    $('confirmOk').disabled = false;
    $('confirmOk').textContent = 'Eliminar';
    cerrarConfirmacion();

    if (resultado.error) {
      showToast(mensajeError(resultado.error, 'eliminar'), 'error');
      return;
    }
    if (!resultado.data || !resultado.data.length) {
      showToast('No se pudo eliminar: el producto ya no existe o no tienes permiso.', 'error');
      cargarProductos();
      return;
    }

    productos = productos.filter(function(p){ return String(p.id) !== String(id); });
    despuesDeCambio();
    showToast('Producto eliminado.', 'success');
  });

  // ---------------------------------------------------------------
  // EVENTOS DE LA LISTA Y LOS FILTROS
  // ---------------------------------------------------------------
  $('tbodyProductos').addEventListener('click', function(e){
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'editar') {
      const p = productos.find(function(x){ return String(x.id) === String(btn.dataset.id); });
      if (p) abrirModal('editar', p);
    } else if (btn.dataset.action === 'eliminar') {
      pedirEliminar(btn.dataset.id);
    }
  });

  $('emptyState').addEventListener('click', function(e){
    if (e.target.closest('[data-action="limpiar"]')) limpiarFiltros();
  });

  $('btnMas').addEventListener('click', function(){
    limiteMostrar += TAM_PAGINA;
    renderTabla();
  });

  function limpiarFiltros(){
    $('fSearch').value = '';
    $('fCategoria').value = '';
    $('fEstado').value = '';
    aplicarFiltros(true);
  }

  // Celular: los filtros son botones; se mantienen sincronizados con las listas de computador
  function sincronizarChips(){
    [['chipsCat', 'fCategoria'], ['chipsEst', 'fEstado']].forEach(function(par){
      const valor = $(par[1]).value;
      $(par[0]).querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.v === valor); });
    });
  }
  [['chipsCat', 'fCategoria'], ['chipsEst', 'fEstado']].forEach(function(par){
    $(par[0]).addEventListener('click', function(e){
      const b = e.target.closest('button');
      if (!b) return;
      $(par[1]).value = b.dataset.v;
      aplicarFiltros(true);
    });
  });

  $('btnBuscar').addEventListener('click', function(){ aplicarFiltros(true); });
  $('btnLimpiar').addEventListener('click', limpiarFiltros);

  // Búsqueda mientras se escribe (con una pequeña pausa para no trabajar de más)
  $('fSearch').addEventListener('input', function(){
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function(){ aplicarFiltros(true); }, 200);
  });
  $('fSearch').addEventListener('keyup', function(e){
    if (e.key === 'Enter') { clearTimeout(debounceTimer); aplicarFiltros(true); }
  });
  $('fCategoria').addEventListener('change', function(){ aplicarFiltros(true); });
  $('fEstado').addEventListener('change', function(){ aplicarFiltros(true); });

  $('avisoBtn').addEventListener('click', cargarProductos);

  // ---------------------------------------------------------------
  // BUSCADOR (productos y proveedores, con los datos ya cargados)
  // ---------------------------------------------------------------
  const buscador = $('buscador');
  const cajaResultados = $('resultadosBusqueda');

  function cerrarBusqueda(){ cajaResultados.classList.remove('show'); cajaResultados.innerHTML = ''; }

  function buscar(){
    const q = normalizar(buscador.value);
    if (!q) { cerrarBusqueda(); return; }

    const prods = productos
      .filter(p => normalizar(p.nombre).includes(q) || normalizar(p.nombre_cientifico).includes(q))
      .slice(0, 5);
    const provs = proveedoresBusqueda
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
  // MENÚ "MÁS" EN CELULAR: iconos flotantes en vertical
  // ---------------------------------------------------------------
  const fan = $('fan');
  const fanBtn = $('fanBtn');

  function abrirFan(){
    fan.classList.add('open');
    fanBtn.classList.add('open');
    fanBtn.setAttribute('aria-expanded', 'true');
    $('fanBtnLabel').textContent = 'Cerrar';
    document.body.classList.add('sin-scroll');
  }
  function cerrarFan(){
    fan.classList.remove('open');
    fanBtn.classList.remove('open');
    fanBtn.setAttribute('aria-expanded', 'false');
    $('fanBtnLabel').textContent = 'Más';
    actualizarScroll();
  }

  fanBtn.addEventListener('click', function(){ fan.classList.contains('open') ? cerrarFan() : abrirFan(); });
  $('fanOverlay').addEventListener('click', cerrarFan);
  window.addEventListener('resize', function(){ if (window.innerWidth > 1000) cerrarFan(); });

  // Tecla Escape: cierra lo último que se abrió
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    if ($('confirmOverlay').classList.contains('show')) { cerrarConfirmacion(); return; }
    if ($('modalOverlay').classList.contains('show'))   { cerrarModal(); return; }
    cerrarPanel();
    cerrarFan();
    cerrarBusqueda();
  });

  // ---------------------------------------------------------------
  // SESIÓN Y REFRESCO AUTOMÁTICO
  // ---------------------------------------------------------------
  supabaseClient.auth.onAuthStateChange(function(evento){
    if (evento === 'SIGNED_OUT') window.location.replace('login.html');
  });

  window.addEventListener('pageshow', function(e){
    if (e.persisted && usuarioActual) { renderNotificaciones(); cargarProductos(); }
  });
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden && usuarioActual && leerPref(PREF_AUTO, 'on') !== 'off' && Date.now() - ultimaActualizacion > 30000) cargarProductos();
  });
  window.addEventListener('online', function(){ if (usuarioActual) cargarProductos(); });

  // ---------------------------------------------------------------
  // INICIO
  // ---------------------------------------------------------------
  async function iniciar(){
    // Si se llega desde una notificación (?id=...), se recuerda qué resaltar
    // y se limpia la dirección para que al recargar no se repita.
    try {
      const id = new URLSearchParams(window.location.search).get('id');
      if (id) {
        idPendiente = id;
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (e) { /* navegador sin URLSearchParams: se ignora */ }

    // La sesión se lee del navegador (rápido). Sin sesión → login.
    let session = null;
    try {
      const res = await supabaseClient.auth.getSession();
      session = res.data.session;
    } catch (err) {
      console.error('No se pudo leer la sesión:', err);
    }

    if (!session) { window.location.replace('login.html'); return; }

    usuarioActual = session.user;
    aplicarPrefs();
    pintarUsuario();

    // 1) Se muestra al instante lo último guardado (si existe)
    const cache = leerCache();
    if (cache) {
      productos = cache;
      datosListos = true;
      $('loadingState').hidden = true;
      indexar();
      actualizarProveedores();
      aplicarFiltros(true);
      renderNotificaciones();
      if (idPendiente && productos.some(function(p){ return String(p.id) === String(idPendiente); })) {
        const id = idPendiente; idPendiente = null; resaltarProducto(id);
      }
    }

    // 2) Se piden los datos frescos en segundo plano
    await cargarProductos();

    // 3) Si venía de registrar un proveedor nuevo, se continúa con el producto
    restaurarBorrador();
  }

  iniciar();


  function syncObsP(){ const on=$('pConObs').checked; $('pObservaciones').hidden=!on; if(!on) $('pObservaciones').value=''; else $('pObservaciones').focus(); }
  function syncDescP(){ const on=$('pConDesc').checked; $('pDescripcion').hidden=!on; if(!on) $('pDescripcion').value=''; else $('pDescripcion').focus(); }
  $('pConDesc').addEventListener('change', syncDescP);
  $('pConObs').addEventListener('change', syncObsP);
})();
