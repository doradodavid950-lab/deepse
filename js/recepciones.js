/* ==========================================================
   Lógica del módulo: recepciones.html
   Extraída del HTML sin cambios: mismo código y mismo orden de ejecución.
   ========================================================== */
(function(){
  'use strict';

  const $ = function(id){ return document.getElementById(id); };

  // Solo las columnas necesarias, en una sola consulta con los nombres ya unidos
  const COLUMNAS = 'id,codigo_lote,producto_id,proveedor_id,peso,estado_producto,fecha_recepcion,observaciones,productos(nombre),proveedores(nombre)';
  const ESTADOS_FORM = ['Fresco', 'Congelado', 'En revisión', 'Rechazado'];
  const APROBADOS = ['fresco', 'congelado', 'recibido'];   // "recibido" = registros anteriores
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const PESO_MAX = 100000;      // kg
  const TAM_PAGINA = 25;        // filas que se dibujan por tanda
  const LIMITE_FILAS = 500;     // las más recientes: suficiente y mucho más rápido
  const LIMITE_MS = 15000;
  const CLAVE_UID = 'dsi_uid';

  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mqMovil = window.matchMedia('(max-width:1000px)');

  // ---------------------------------------------------------------
  // ESTADO DE LA PÁGINA
  // ---------------------------------------------------------------
  let supabaseClient = null;
  let uid = null;
  let nombreUsuario = '';
  let recepciones = [];
  let productos = [];
  let proveedores = [];
  let filtrados = [];
  let limiteMostrar = TAM_PAGINA;
  let datosListos = false;
  let productosListos = false;
  let errorCarga = false;
  let cargando = false;
  let guardando = false;
  let eliminando = false;
  let formSucio = false;
  let idPorEliminar = null;
  let idPendiente = null;
  let sigRec = '', sigProd = '', sigProv = '';
  let ultimaActualizacion = 0;
  let notifsActuales = [];
  let menuAbierto = false;
  let toastTimer = null;
  let debounceTimer = null;
  let indice = new WeakMap();

  // ---------------------------------------------------------------
  // UTILIDADES
  // ---------------------------------------------------------------
  function escapeHTML(texto){
    return String(texto == null ? '' : texto).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function normalizar(texto){
    return String(texto == null ? '' : texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  const pad = function(n){ return String(n).padStart(2, '0'); };
  const fmtNumero = function(n){ return Math.round(n).toLocaleString('es-CO'); };
  const fmtPeso = function(n){ return (Math.round(n * 100) / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' kg'; };
  function fmtPesoKpi(kg){
    return kg >= 1000
      ? (kg / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' t'
      : fmtNumero(kg) + ' kg';
  }

  // Una fecha sola ("2026-09-23") se toma como fecha local (si no, se vería un día antes)
  function parsearFecha(valor){
    if (!valor) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      const p = valor.split('-').map(Number);
      return new Date(p[0], p[1] - 1, p[2]);
    }
    const f = new Date(valor);
    return isNaN(f.getTime()) ? null : f;
  }
  // "12 oct 2026 · 07:30" (computador) o "12 oct · 07:30" (celular)
  function fechaCorta(valor, conAnio){
    const f = parsearFecha(valor);
    if (!f) return '-';
    let t = pad(f.getDate()) + ' ' + MESES[f.getMonth()] + (conAnio ? ' ' + f.getFullYear() : '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) t += ' · ' + pad(f.getHours()) + ':' + pad(f.getMinutes());
    return t;
  }
  function aInputFecha(f){
    return f.getFullYear() + '-' + pad(f.getMonth() + 1) + '-' + pad(f.getDate()) + 'T' + pad(f.getHours()) + ':' + pad(f.getMinutes());
  }
  function nombreRel(rel){
    const r = Array.isArray(rel) ? rel[0] : rel;
    return (r && r.nombre) || '';
  }

  function conTiempo(promesa){
    let t;
    const limite = new Promise(function(_, rechazar){
      t = setTimeout(function(){ rechazar(new Error('Tiempo de espera agotado')); }, LIMITE_MS);
    });
    return Promise.race([promesa, limite]).finally(function(){ clearTimeout(t); });
  }

  function mensajeError(error, accion){
    const msg = String((error && error.message) || '').toLowerCase();
    const code = error && error.code;
    if (accion === 'eliminar' && (code === '23503' || msg.indexOf('foreign key') !== -1)) {
      return 'No se puede eliminar: la recepción está asociada a otros registros (por ejemplo, almacenamiento o trazabilidad).';
    }
    if (accion === 'guardar' && code === '23503') return 'El producto o el proveedor elegido ya no existe. Actualiza la página.';
    if (code === '23514' || msg.indexOf('check constraint') !== -1) {
      return 'La base de datos no acepta alguno de los valores (revisa el estado).';
    }
    if (code === '42501' || msg.indexOf('row-level security') !== -1 || msg.indexOf('permission') !== -1) {
      return 'No tienes permiso para realizar esta acción.';
    }
    if (code === '23505' || msg.indexOf('duplicate') !== -1) return 'Ya existe un registro con esos datos.';
    if (code === '23502') return 'Falta un dato obligatorio.';
    if (code === '22003') return 'El peso es demasiado grande.';
    if (msg.indexOf('failed to fetch') !== -1 || msg.indexOf('network') !== -1 || msg.indexOf('tiempo de espera') !== -1) {
      return 'No se pudo conectar. Revisa tu internet e intenta de nuevo.';
    }
    console.warn('Error al ' + accion + ':', error);
    return 'No se pudo ' + accion + ' la recepción. Intenta de nuevo.';
  }

  function showToast(mensaje, tipo){
    const t = $('toast');
    t.textContent = mensaje;
    t.className = 'toast show' + (tipo ? ' ' + tipo : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.className = 'toast'; }, 3400);
  }

  const ICONO_ALERTA = '<svg class="i" aria-hidden="true"><use href="#i-alert"/></svg>';
  function mostrarMsg(texto){
    const m = $('formMsg');
    m.className = 'msg show error';
    m.innerHTML = ICONO_ALERTA + '<span>' + escapeHTML(texto) + '</span>';
  }
  function ocultarMsg(){
    $('formMsg').className = 'msg';
    $('formMsg').innerHTML = '';
  }

  function mostrarAviso(texto){ $('avisoTexto').textContent = texto; $('aviso').classList.add('show'); }
  function ocultarAviso(){ $('aviso').classList.remove('show'); }

  function actualizarScroll(){
    document.body.classList.toggle('sin-scroll',
      menuAbierto || $('modalOverlay').classList.contains('show') || $('confirmOverlay').classList.contains('show'));
  }

  function pintarUsuario(nombre){
    nombreUsuario = nombre || nombreUsuario;
    if (!nombreUsuario) return;
    $('topUserName').textContent = nombreUsuario;
    $('topAvatar').textContent = nombreUsuario.charAt(0).toUpperCase();
  }

  // ---------------------------------------------------------------
  // CACHÉ LOCAL
  // Al abrir la página se dibuja al instante lo último guardado (sin
  // esperar a internet ni al SDK) y después se actualiza por detrás.
  // ---------------------------------------------------------------
  const claveCache = function(u){ return 'dsi_rec2_' + u; };

  function leerCache(u){
    try {
      const c = JSON.parse(localStorage.getItem(claveCache(u)) || 'null');
      if (c && Array.isArray(c.recepciones) && Array.isArray(c.productos) && Array.isArray(c.proveedores)) return c;
    } catch (e) { /* caché dañada */ }
    return null;
  }
  function guardarCache(){
    if (!uid) return;
    try {
      localStorage.setItem(claveCache(uid), JSON.stringify({
        nombre: nombreUsuario, recepciones: recepciones, productos: productos, proveedores: proveedores
      }));
    } catch (e) { /* sin espacio */ }
  }
  function borrarLocal(){
    try {
      if (uid) localStorage.removeItem(claveCache(uid));
      localStorage.removeItem(CLAVE_UID);
    } catch (e) { /* se ignora */ }
  }

  function aplicarCache(c){
    recepciones = c.recepciones;
    productos = c.productos;
    proveedores = c.proveedores;
    sigRec = JSON.stringify(recepciones);
    sigProd = JSON.stringify(productos);
    sigProv = JSON.stringify(proveedores);
    productosListos = true;
    datosListos = true;
    if (c.nombre) pintarUsuario(c.nombre);
    $('loadingState').hidden = true;
    actualizarResumen();
    aplicarFiltros(true);
    renderNotificaciones();
  }

  // ---------------------------------------------------------------
  // RESUMEN DEL MES
  // ---------------------------------------------------------------
  function setKpi(id, texto){
    const el = $(id);
    el.classList.remove('loading-val');
    el.textContent = texto;
  }

  function actualizarResumen(){
    const hoy = new Date();
    const mes = hoy.getMonth(), anio = hoy.getFullYear();
    let total = 0, aprobadas = 0, rechazadas = 0, peso = 0;

    for (let i = 0; i < recepciones.length; i++) {
      const r = recepciones[i];
      const f = parsearFecha(r.fecha_recepcion);
      if (!f || f.getMonth() !== mes || f.getFullYear() !== anio) continue;
      total++;
      const e = normalizar(r.estado_producto);
      if (e === 'rechazado') rechazadas++;
      else peso += Number(r.peso) || 0;
      if (APROBADOS.indexOf(e) !== -1) aprobadas++;
    }

    setKpi('kMes', fmtNumero(total));
    setKpi('kPeso', fmtPesoKpi(peso));
    setKpi('kAprob', (total ? Math.round(aprobadas * 100 / total) : 0) + '%');
    setKpi('kRech', fmtNumero(rechazadas));
  }

  // ---------------------------------------------------------------
  // LISTAS DEL FORMULARIO
  // ---------------------------------------------------------------
  // Los productos que se repiten con el mismo nombre (uno por proveedor) se muestran una sola vez
  function claveNombre(n){ return normalizar(String(n == null ? '' : n).replace(/\s+/g, ' ')); }
  function gruposProductos(){
    const mapa = new Map();
    productos.forEach(function(p){
      const k = claveNombre(p.nombre) || ('id:' + p.id);
      let g = mapa.get(k);
      if (!g) { g = { nombre: p.nombre, filas: [] }; mapa.set(k, g); }
      g.filas.push(p);
    });
    return Array.from(mapa.values());
  }
  function filasDelProducto(productoId){
    const p = productos.find(function(x){ return String(x.id) === String(productoId); });
    if (!p) return [];
    const k = claveNombre(p.nombre);
    if (!k) return [p];
    return productos.filter(function(x){ return claveNombre(x.nombre) === k; });
  }

  // Proveedores del producto elegido. Si el producto no tiene ninguno registrado, se muestran todos.
  function llenarProveedores(productoId, proveedorSel, autoElegir){
    const ordenar = function(a, b){ return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'); };
    const hint = $('proveedorHint');

    // Proveedores inactivos solo si la recepción ya tenía uno (para no perderlo al editar)
    const base = proveedores.filter(function(p){
      return !(normalizar(p.estado) === 'inactivo' && String(p.id) !== String(proveedorSel));
    });
    const delProducto = new Set();
    if (productoId) filasDelProducto(productoId).forEach(function(f){ const k = claveNombre(f.proveedor); if (k) delProducto.add(k); });
    const propios = base.filter(function(p){ return delProducto.has(claveNombre(p.nombre)); });
    const filtrado = propios.length > 0;
    const opciones = (filtrado ? propios : base).slice();

    // Si la recepción ya tenía un proveedor distinto, se conserva para no perderlo al editar
    if (proveedorSel && !opciones.some(function(p){ return String(p.id) === String(proveedorSel); })) {
      const extra = proveedores.find(function(p){ return String(p.id) === String(proveedorSel); });
      if (extra) opciones.push(extra);
    }
    opciones.sort(ordenar);

    let html = '<option value="">Seleccionar proveedor</option>';
    opciones.forEach(function(p){
      const inactivo = normalizar(p.estado) === 'inactivo';
      html += '<option value="' + escapeHTML(p.id) + '">' + escapeHTML(p.nombre) + (inactivo ? ' (inactivo)' : '') + '</option>';
    });
    $('proveedor').innerHTML = html;

    if (proveedorSel) $('proveedor').value = proveedorSel;
    else if (autoElegir && filtrado && opciones.length === 1) $('proveedor').value = opciones[0].id;

    let texto = '';
    if (productoId && filtrado) texto = opciones.length === 1 ? 'Proveedor registrado para este producto.' : 'Se muestran los proveedores de este producto.';
    else if (productoId) texto = 'Este producto no tiene proveedor registrado: se muestran todos.';
    hint.textContent = texto;
    hint.style.display = texto ? 'block' : 'none';
  }

  // El producto elegido es una fila de "productos"; si hay varias con el mismo nombre,
  // se usa la que corresponde al proveedor elegido.
  function productoIdFinal(){
    const sel = $('producto').value;
    const provId = $('proveedor').value;
    if (!sel || !provId) return sel;
    const prov = proveedores.find(function(p){ return String(p.id) === String(provId); });
    if (!prov) return sel;
    const kp = claveNombre(prov.nombre);
    const filas = filasDelProducto(sel);
    const actual = filas.find(function(f){ return String(f.id) === String(sel); });
    if (actual && claveNombre(actual.proveedor) === kp) return sel;
    const otra = filas.find(function(f){ return claveNombre(f.proveedor) === kp; });
    return otra ? otra.id : sel;
  }

  function llenarSelects(productoSel, proveedorSel, estadoSel){
    const ordenar = function(a, b){ return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'); };

    let htmlProd = '<option value="">Seleccionar producto</option>';
    gruposProductos().sort(ordenar).forEach(function(g){
      const activas = g.filas.filter(function(f){ return normalizar(f.estado) !== 'inactivo'; });
      const inactivo = !activas.length;
      // El valor es el id de una fila del grupo: la que ya tenía la recepción al editar, o una activa
      const rep = g.filas.find(function(f){ return String(f.id) === String(productoSel); }) || activas[0] || g.filas[0];
      htmlProd += '<option value="' + escapeHTML(rep.id) + '">' + escapeHTML(g.nombre) + (inactivo ? ' (inactivo)' : '') + '</option>';
    });
    $('producto').innerHTML = htmlProd;

    llenarProveedores(productoSel || '', proveedorSel, false);

    // Estados: los nuevos, más el estado anterior del registro si era otro (ej. "Recibido")
    let htmlEst = ESTADOS_FORM.map(function(e){ return '<option value="' + e + '">' + e + '</option>'; }).join('');
    if (estadoSel && ESTADOS_FORM.indexOf(estadoSel) === -1) {
      htmlEst += '<option value="' + escapeHTML(estadoSel) + '">' + escapeHTML(estadoSel) + '</option>';
    }
    $('estado').innerHTML = htmlEst;
  }

  // ---------------------------------------------------------------
  // BÚSQUEDA
  // ---------------------------------------------------------------
  // El texto de búsqueda se prepara la primera vez que se necesita
  function textoBusqueda(r){
    let t = indice.get(r);
    if (t === undefined) {
      t = normalizar([nombreRel(r.productos), nombreRel(r.proveedores), r.estado_producto, r.observaciones].join(' '));
      indice.set(r, t);
    }
    return t;
  }

  function aplicarFiltros(reiniciar){
    const q = normalizar($('searchInput').value);
    filtrados = q
      ? recepciones.filter(function(r){ return textoBusqueda(r).indexOf(q) !== -1; })
      : recepciones.slice();
    if (reiniciar) limiteMostrar = TAM_PAGINA;
    renderTabla();
  }

  // ---------------------------------------------------------------
  // TABLA (computador) Y TARJETAS (celular): solo se dibuja la que se ve
  // ---------------------------------------------------------------
  function claseEstado(estado){
    const e = normalizar(estado);
    if (e === 'rechazado') return 'bad';
    if (e === 'congelado') return 'cold';
    if (e === 'fresco' || e === 'recibido') return 'ok';
    return 'warn';
  }

  // Lote = número de recepción de ese producto con ese proveedor, por orden de fecha
  // (misma regla que usa Normas y calidad). Un proveedor nuevo empieza en Lote 1.
  let lotesMapa = new Map();
  function calcularLotes(){
    const cont = {}, mapa = new Map();
    recepciones.slice().sort(function(a, b){
      return String(a.fecha_recepcion || '').localeCompare(String(b.fecha_recepcion || ''));
    }).forEach(function(r){
      const k = String(r.producto_id || '') + '|' + String(r.proveedor_id || '');
      cont[k] = (cont[k] || 0) + 1;
      mapa.set(String(r.id), cont[k]);
    });
    return mapa;
  }
  function loteDe(r){ return lotesMapa.get(String(r.id)) || 1; }
  // Código único y permanente del lote (lo genera la base de datos al registrar la recepción)
  function codigoDe(r){ return r.codigo_lote || ('Lote ' + loteDe(r)); }

  function filaHTML(r){
    const id = escapeHTML(r.id);
    const producto = nombreRel(r.productos) || 'Sin producto';
    const prod = escapeHTML(producto);
    const obs = r.observaciones ? escapeHTML(r.observaciones) : '';
    return '<tr data-id="' + id + '">' +
      '<td>' + prod + '</td>' +
      '<td>' + escapeHTML(nombreRel(r.proveedores) || 'Sin proveedor') + '</td>' +
      '<td><span class="lote-tag">' + escapeHTML(codigoDe(r)) + '</span></td>' +
      '<td class="nowrap">' + escapeHTML(fmtPeso(Number(r.peso) || 0)) + '</td>' +
      '<td><span class="pill ' + claseEstado(r.estado_producto) + '">' + escapeHTML(r.estado_producto || '-') + '</span></td>' +
      '<td class="nowrap">' + escapeHTML(fechaCorta(r.fecha_recepcion, true)) + '</td>' +
      '<td class="obs" title="' + (r.observaciones ? escapeHTML(r.observaciones) : '') + '">' + obs + '</td>' +
      '<td><div class="acts">' +
        '<button class="action-btn edit-btn" type="button" data-action="editar" data-id="' + id + '" aria-label="Editar recepción de ' + prod + '"><svg class="i" aria-hidden="true"><use href="#i-edit"/></svg></button>' +
        '<button class="action-btn delete-btn" type="button" data-action="eliminar" data-id="' + id + '" aria-label="Eliminar recepción de ' + prod + '"><svg class="i" aria-hidden="true"><use href="#i-trash"/></svg></button>' +
      '</div></td>' +
    '</tr>';
  }

  function tarjetaHTML(r){
    const id = escapeHTML(r.id);
    const producto = nombreRel(r.productos) || 'Sin producto';
    return '<div class="pcard" role="button" tabindex="0" data-action="editar" data-id="' + id + '" aria-label="Editar recepción de ' + escapeHTML(producto) + '">' +
      '<div class="pc-top">' +
        '<div class="pc-ic"><svg class="i" aria-hidden="true"><use href="#i-truck"/></svg></div>' +
        '<div class="pc-info"><strong>' + escapeHTML(producto) + '</strong><span>' + escapeHTML(nombreRel(r.proveedores) || 'Sin proveedor') + '</span></div>' +
        '<span class="pill ' + claseEstado(r.estado_producto) + '">' + escapeHTML(r.estado_producto || '-') + '</span>' +
      '</div>' +
      '<div class="pc-bot"><span>Lote <b>' + escapeHTML(codigoDe(r)) + '</b></span><span>Peso <b>' + escapeHTML(fmtPeso(Number(r.peso) || 0)) + '</b></span><b>' + escapeHTML(fechaCorta(r.fecha_recepcion, false)) + '</b></div>' +
    '</div>';
  }

  function renderTabla(){
    const total = recepciones.length;
    const tabla = $('tablaRecepciones');
    const tarjetas = $('receptionCards');
    const vacio = $('emptyState');

    if (!total || !filtrados.length) {
      tabla.hidden = true;
      tarjetas.hidden = true;
      $('masWrap').hidden = true;
      vacio.hidden = false;
      if (!total) {
        vacio.innerHTML = errorCarga
          ? '<div class="icon">⚠️</div>No se pudo cargar la información.'
          : '<div class="icon">📦</div>No hay recepciones registradas todavía.<br>' +
            '<button class="btn btn-primary" type="button" data-action="nuevo">Registrar la primera</button>';
      } else {
        vacio.innerHTML = '<div class="icon">🔎</div>No se encontraron recepciones con esa búsqueda.' +
          '<br><button class="btn btn-secondary" type="button" data-action="limpiar">Limpiar búsqueda</button>';
      }
      return;
    }

    const visibles = filtrados.slice(0, limiteMostrar);
    lotesMapa = calcularLotes();
    // Si ninguna fila tiene observaciones, la columna no se muestra
    tabla.classList.toggle('sin-obs', !visibles.some(function(r){ return !!r.observaciones; }));
    const movil = mqMovil.matches;
    vacio.hidden = true;
    tabla.hidden = movil;
    tarjetas.hidden = !movil;

    if (movil) {
      $('receptionTable').innerHTML = '';
      tarjetas.innerHTML = visibles.map(tarjetaHTML).join('');
    } else {
      tarjetas.innerHTML = '';
      $('receptionTable').innerHTML = visibles.map(filaHTML).join('');
    }

    const restantes = filtrados.length - limiteMostrar;
    $('masWrap').hidden = restantes <= 0;
    if (restantes > 0) $('btnMas').textContent = 'Mostrar más (' + restantes + ' restantes)';
  }

  // Al girar el teléfono o cambiar el tamaño de la ventana se dibuja la vista que corresponde
  if (mqMovil.addEventListener) mqMovil.addEventListener('change', renderTabla);
  else if (mqMovil.addListener) mqMovil.addListener(renderTabla);

  function resaltarRecepcion(id){
    const sid = String(id);
    let idx = filtrados.findIndex(function(r){ return String(r.id) === sid; });

    if (idx === -1) {
      if (!recepciones.some(function(r){ return String(r.id) === sid; })) {
        showToast('Esa recepción ya no existe.', 'error');
        return;
      }
      $('searchInput').value = '';
      aplicarFiltros(true);
      idx = filtrados.findIndex(function(r){ return String(r.id) === sid; });
    }

    if (idx >= limiteMostrar) { limiteMostrar = idx + 1; renderTabla(); }

    const cont = mqMovil.matches ? $('receptionCards') : $('receptionTable');
    const el = Array.prototype.find.call(cont.children, function(x){ return x.dataset.id === sid; });
    if (!el) return;

    el.scrollIntoView({ behavior: reducirMovimiento ? 'auto' : 'smooth', block: 'center' });
    el.classList.remove('resaltado');
    void el.offsetWidth;
    el.classList.add('resaltado');
    setTimeout(function(){ el.classList.remove('resaltado'); }, 3600);
  }

  // ---------------------------------------------------------------
  // CARGA DE DATOS
  // Las tres consultas salen a la vez y cada una se dibuja apenas
  // llega (la tabla no espera a las demás). Solo se redibuja lo que cambió.
  // ---------------------------------------------------------------
  async function cargarDatos(){
    if (cargando || !supabaseClient) return;
    cargando = true;
    if (!datosListos) $('loadingState').hidden = false;

    let hayError = false, cambio = false;

    const pRec = conTiempo(
      supabaseClient.from('recepciones').select(COLUMNAS)
        .order('fecha_recepcion', { ascending: false, nullsFirst: false })
        .limit(LIMITE_FILAS)
    ).then(function(res){
      if (res.error) { hayError = true; console.error('Error recepciones:', res.error); return; }
      const datos = res.data || [];
      const sig = JSON.stringify(datos);
      $('loadingState').hidden = true;
      if (sig !== sigRec || !datosListos) {
        sigRec = sig;
        recepciones = datos;
        indice = new WeakMap();
        cambio = true;
        datosListos = true;
        actualizarResumen();
        aplicarFiltros(false);
        renderNotificaciones();
      }
      datosListos = true;
      if (idPendiente) { const id = idPendiente; idPendiente = null; resaltarRecepcion(id); }
    }).catch(function(err){ hayError = true; console.error('Error cargando recepciones:', err); });

    const pProd = conTiempo(
      supabaseClient.from('productos').select('id,nombre,estado,proveedor')
    ).then(function(res){
      if (res.error) { hayError = true; console.error('Error productos:', res.error); return; }
      const datos = res.data || [];
      const sig = JSON.stringify(datos);
      productosListos = true;
      if (sig !== sigProd) { sigProd = sig; productos = datos; cambio = true; renderNotificaciones(); }
    }).catch(function(err){ hayError = true; console.error('Error cargando productos:', err); });

    const pProv = conTiempo(
      supabaseClient.from('proveedores').select('id,nombre,estado')
    ).then(function(res){
      if (res.error) { hayError = true; console.error('Error proveedores:', res.error); return; }
      const datos = res.data || [];
      const sig = JSON.stringify(datos);
      if (sig !== sigProv) { sigProv = sig; proveedores = datos; cambio = true; renderNotificaciones(); }
    }).catch(function(err){ hayError = true; console.error('Error cargando proveedores:', err); });

    await Promise.all([pRec, pProd, pProv]);

    cargando = false;
    $('loadingState').hidden = true;
    errorCarga = hayError;

    if (hayError) {
      mostrarAviso('No se pudieron actualizar los datos. Revisa tu conexión.');
      if (!datosListos) { datosListos = true; actualizarResumen(); renderTabla(); }
      return;
    }

    ocultarAviso();
    ultimaActualizacion = Date.now();
    if (cambio) { podarLeidas(); guardarCache(); }
  }

  // Después de crear/editar/eliminar se actualiza la lista al instante
  function despuesDeCambio(){
    sigRec = JSON.stringify(recepciones);
    indice = new WeakMap();
    actualizarResumen();
    guardarCache();
    aplicarFiltros(false);
    renderNotificaciones();
  }

  // ---------------------------------------------------------------
  // NOTIFICACIONES
  // ---------------------------------------------------------------
  const PALABRAS_PROBLEMA  = ['rechaz', 'dano', 'danad', 'deterior', 'vencid', 'cancelad', 'inactiv', 'no apto'];
  const PALABRAS_PENDIENTE = ['pendiente', 'evaluacion', 'revision', 'observ'];

  function clasificarEstado(estado){
    const e = normalizar(estado);
    if (PALABRAS_PROBLEMA.some(function(p){ return e.indexOf(p) !== -1; }))  return 'warn';
    if (PALABRAS_PENDIENTE.some(function(p){ return e.indexOf(p) !== -1; })) return 'pend';
    return 'ok';
  }

  const claveLeidas = function(){ return 'dsi_notif_leidas_' + uid; };

  function leerLeidas(){
    try { return new Set(JSON.parse(localStorage.getItem(claveLeidas()) || '[]')); }
    catch (e) { return new Set(); }
  }
  function guardarLeidas(set){
    try { localStorage.setItem(claveLeidas(), JSON.stringify(Array.from(set).slice(-300))); } catch (e) {}
  }

  function construirNotificaciones(){
    const lista = [];

    recepciones.forEach(function(r){
      const estado = r.estado_producto || 'Fresco';
      const clase = clasificarEstado(estado);
      if (clase === 'ok') return;
      lista.push({
        key: 'rec:' + r.id + ':' + normalizar(estado),
        tipo: clase,
        titulo: 'Recepción ' + estado.toLowerCase(),
        texto: (nombreRel(r.productos) || 'Producto') + ' — ' + fmtPeso(Number(r.peso) || 0),
        fecha: fechaCorta(r.fecha_recepcion, true),
        href: 'recepciones.html?id=' + encodeURIComponent(r.id),
        refId: r.id
      });
    });

    productos.forEach(function(p){
      if (normalizar(p.estado) !== 'inactivo') return;
      lista.push({
        key: 'prod:' + p.id, tipo: 'info', titulo: 'Producto inactivo', texto: p.nombre || 'Producto', fecha: '',
        href: 'productos.html?id=' + encodeURIComponent(p.id), refId: null
      });
    });

    proveedores.forEach(function(p){
      if (normalizar(p.estado) !== 'inactivo') return;
      lista.push({
        key: 'prov:' + p.id, tipo: 'info', titulo: 'Proveedor inactivo', texto: p.nombre || 'Proveedor', fecha: '',
        href: 'proveedores.html?id=' + encodeURIComponent(p.id), refId: null
      });
    });

    return lista;
  }

  function podarLeidas(){
    // Desactivado: cada página solo conoce una parte de las notificaciones y, al podar,
    // borraba como "leídas" las que no conocía (p. ej. controles rechazados), por eso reaparecían.
    // La limpieza ahora la hace campana.js, que conoce la lista completa.
    return;
  }

  function actualizarGlobo(){
    const leidas = leerLeidas();
    const total = notifsActuales.filter(function(n){ return !leidas.has(n.key); }).length;
    $('notificationBadge').classList.toggle('show', total > 0);
    $('notificationBtn').setAttribute('aria-label', total ? 'Notificaciones (' + total + ' sin leer)' : 'Notificaciones');
    $('markAllRead').style.display = total ? '' : 'none';
  }

  function iconoNotif(tipo){
    return tipo === 'info'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v5" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="8" r=".9" fill="currentColor"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3v12" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>';
  }

  function renderNotificaciones(){
    if (!uid) return;
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

      // Si es de una recepción, ya estamos en su módulo: se resalta sin recargar
      if (n.refId !== null && n.refId !== undefined) {
        cerrarPanel();
        resaltarRecepcion(n.refId);
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
  // FORMULARIO: VALIDACIÓN
  // ---------------------------------------------------------------
  const form = $('receptionForm');
  const CAMPOS = [
    ['fieldProducto', 'producto'],
    ['fieldProveedor', 'proveedor'],
    ['fieldPeso', 'peso'],
    ['fieldEstado', 'estado'],
    ['fieldFecha', 'fecha'],
    ['fieldObservaciones', 'observaciones']
  ];

  function limpiarErrores(){
    CAMPOS.forEach(function(c){ $(c[0]).classList.remove('invalid'); });
  }
  function ponerError(idCampo, mensaje){
    const f = $(idCampo);
    f.classList.add('invalid');
    if (mensaje) f.querySelector('.field-error').textContent = mensaje;
  }

  CAMPOS.forEach(function(c){
    const el = $(c[1]);
    const quitar = function(){
      $(c[0]).classList.remove('invalid');
      if ($('formMsg').classList.contains('show') && !form.querySelector('.field.invalid')) ocultarMsg();
    };
    el.addEventListener('input', quitar);
    el.addEventListener('change', quitar);
  });
  form.addEventListener('input', function(){ formSucio = true; });
  // Al elegir producto, el selector de proveedor muestra solo los de ese producto
  $('producto').addEventListener('change', function(){ llenarProveedores($('producto').value, '', true); });
  form.addEventListener('change', function(){ formSucio = true; });

  // El peso solo admite números: se bloquean e, E, + y -
  $('peso').addEventListener('keydown', function(e){
    if (['e', 'E', '+', '-'].indexOf(e.key) !== -1) e.preventDefault();
  });

  const OBS_PERMITIDO = /^[\p{L}\p{N}\s.,;:()¡!¿?"'%°#&\/+@_-]*$/u;

  function limpiarObservaciones(texto){
    return String(texto || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function validarFormulario(){
    limpiarErrores();
    const fallidos = [];
    let primero = null;

    function fallo(idCampo, nombreCampo, mensaje, input){
      ponerError(idCampo, mensaje);
      if (fallidos.indexOf(nombreCampo) === -1) fallidos.push(nombreCampo);
      if (!primero) primero = input;
    }

    const productoId = productoIdFinal();
    if (!productoId) {
      fallo('fieldProducto', 'Producto', 'Selecciona un producto.', $('producto'));
    } else if (!productos.some(function(p){ return String(p.id) === String(productoId); })) {
      fallo('fieldProducto', 'Producto', 'El producto elegido ya no existe. Actualiza la página.', $('producto'));
    }

    const proveedorId = $('proveedor').value;
    if (proveedorId && !proveedores.some(function(p){ return String(p.id) === String(proveedorId); })) {
      fallo('fieldProveedor', 'Proveedor', 'El proveedor elegido ya no existe. Actualiza la página.', $('proveedor'));
    }

    const pesoTxt = String($('peso').value).trim();
    const peso = Number(pesoTxt);
    if (!pesoTxt) {
      fallo('fieldPeso', 'Peso', 'El peso es obligatorio.', $('peso'));
    } else if (!/^\d+(\.\d{1,2})?$/.test(pesoTxt)) {
      fallo('fieldPeso', 'Peso', 'Ingresa solo números, con máximo 2 decimales (ej. 25.50).', $('peso'));
    } else if (!isFinite(peso) || peso <= 0) {
      fallo('fieldPeso', 'Peso', 'El peso debe ser mayor a 0.', $('peso'));
    } else if (peso > PESO_MAX) {
      fallo('fieldPeso', 'Peso', 'El peso no puede superar ' + PESO_MAX.toLocaleString('es-CO') + ' kg.', $('peso'));
    }

    const estadoVal = $('estado').value;
    const estadoOk = Array.prototype.some.call($('estado').options, function(o){ return o.value === estadoVal; });
    if (!estadoVal || !estadoOk) {
      fallo('fieldEstado', 'Estado', 'Selecciona un estado.', $('estado'));
    }

    const fechaTxt = $('fecha').value;
    const fecha = fechaTxt ? new Date(fechaTxt) : null;
    if (!fechaTxt) {
      fallo('fieldFecha', 'Fecha', 'La fecha de recepción es obligatoria.', $('fecha'));
    } else if (!fecha || isNaN(fecha.getTime()) || fecha.getFullYear() < 1990) {
      fallo('fieldFecha', 'Fecha', 'Ingresa una fecha válida.', $('fecha'));
    } else if (fecha.getTime() > Date.now() + 60000) {
      fallo('fieldFecha', 'Fecha', 'La fecha de recepción no puede ser futura.', $('fecha'));
    }

    const obs = limpiarObservaciones($('observaciones').value);
    if (obs) {
      if (obs.length > 500) {
        fallo('fieldObservaciones', 'Observaciones', 'Máximo 500 caracteres.', $('observaciones'));
      } else if (!OBS_PERMITIDO.test(obs)) {
        fallo('fieldObservaciones', 'Observaciones', 'Hay caracteres no permitidos (por ejemplo < > { } [ ] $ = * | \\ ~). Usa letras, números y signos básicos.', $('observaciones'));
      } else if (!/[\p{L}\p{N}]/u.test(obs)) {
        fallo('fieldObservaciones', 'Observaciones', 'Las observaciones deben contener letras o números.', $('observaciones'));
      }
    }

    // Evita registros idénticos (mismo producto, proveedor, peso y minuto), por ejemplo al tocar "Guardar" dos veces
    if (!fallidos.length) {
      const idEditando = $('receptionId').value;
      const minuto = Math.floor(fecha.getTime() / 60000);
      const repetida = recepciones.some(function(r){
        const f = parsearFecha(r.fecha_recepcion);
        return String(r.id) !== String(idEditando) &&
          String(r.producto_id) === String(productoId) &&
          String(r.proveedor_id || '') === String(proveedorId || '') &&
          Math.abs((Number(r.peso) || 0) - peso) < 0.005 &&
          f && Math.floor(f.getTime() / 60000) === minuto;
      });
      if (repetida) {
        fallo('fieldProducto', 'Producto', 'Ya existe una recepción idéntica (mismo producto, proveedor, peso y hora).', $('producto'));
      }
    }

    if (primero) primero.focus();
    return fallidos;
  }

  // ---------------------------------------------------------------
  // VENTANA NUEVA / EDITAR
  // ---------------------------------------------------------------
  function syncObs(){
    const on = $('conObs').checked;
    $('obsBox').hidden = !on;
    if (!on) $('observaciones').value = '';      // sin observaciones: no se guarda nada
  }
  $('conObs').addEventListener('change', function(){
    syncObs();
    if ($('conObs').checked && window.matchMedia('(pointer:fine)').matches) setTimeout(function(){ $('observaciones').focus(); }, 30);
  });

  function abrirModal(rec){
    if (!productos.length) {
      showToast(productosListos
        ? 'Primero registra al menos un producto en el módulo Productos.'
        : 'Cargando productos, intenta de nuevo en un momento.', 'error');
      return;
    }

    form.reset();
    limpiarErrores();
    ocultarMsg();
    formSucio = false;
    $('fecha').max = aInputFecha(new Date());

    if (rec) {
      llenarSelects(rec.producto_id, rec.proveedor_id, rec.estado_producto);
      $('modalTitle').textContent = 'Editar recepción';
      $('modalSub').textContent = 'Modifica los datos de esta recepción.';
      $('saveBtn').textContent = 'Actualizar recepción';
      $('formDelete').hidden = false;
      $('receptionId').value   = rec.id;
      $('producto').value      = rec.producto_id || '';
      $('proveedor').value     = rec.proveedor_id || '';
      $('peso').value          = rec.peso != null ? rec.peso : '';
      $('estado').value        = rec.estado_producto || 'Fresco';
      $('observaciones').value = rec.observaciones || '';
      $('conObs').checked = !!rec.observaciones;
      syncObs();
      const f = parsearFecha(rec.fecha_recepcion);
      $('fecha').value = f ? aInputFecha(f) : '';
    } else {
      llenarSelects();
      $('modalTitle').textContent = 'Nueva recepción';
      $('modalSub').textContent = 'Registra el ingreso de un producto.';
      $('saveBtn').textContent = 'Guardar recepción';
      $('formDelete').hidden = true;
      $('receptionId').value = '';
      $('conObs').checked = false;
      syncObs();
      $('estado').value = 'Fresco';
      $('fecha').value = aInputFecha(new Date());
    }

    $('modalOverlay').classList.add('show');
    actualizarScroll();
    if (window.matchMedia('(pointer:fine)').matches) setTimeout(function(){ $('producto').focus(); }, 60);
  }

  function cerrarModal(){
    $('modalOverlay').classList.remove('show');
    actualizarScroll();
  }

  $('btnNuevo').addEventListener('click', function(){ abrirModal(null); });
  $('fabNuevo').addEventListener('click', function(){ abrirModal(null); });
  $('modalClose').addEventListener('click', cerrarModal);
  $('cancelBtn').addEventListener('click', cerrarModal);
  $('formDelete').addEventListener('click', function(){
    const id = $('receptionId').value;
    if (id) pedirEliminar(id);
  });

  // Tocar fuera de la ventana la cierra, salvo que ya haya datos escritos
  $('modalOverlay').addEventListener('click', function(e){
    if (e.target === $('modalOverlay') && !formSucio) cerrarModal();
  });

  // ---------------------------------------------------------------
  // GUARDAR (crear / actualizar)
  // ---------------------------------------------------------------
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    if (guardando) return;
    if (!supabaseClient) { showToast('Conectando… intenta de nuevo en un momento.', 'error'); return; }

    const fallidos = validarFormulario();
    if (fallidos.length) {
      mostrarMsg(fallidos.length === 1
        ? 'Revisa el campo marcado en rojo: ' + fallidos[0] + '.'
        : 'Revisa los campos marcados en rojo: ' + fallidos.join(', ') + '.');
      return;
    }
    ocultarMsg();

    const idEditando = $('receptionId').value;
    const payload = {
      producto_id:     productoIdFinal(),
      proveedor_id:    $('proveedor').value || null,
      peso:            Math.round(Number($('peso').value) * 100) / 100,
      estado_producto: $('estado').value,
      fecha_recepcion: new Date($('fecha').value).toISOString(),
      observaciones:   limpiarObservaciones($('observaciones').value) || null
    };

    guardando = true;
    $('saveBtn').disabled = true;
    $('saveBtn').textContent = 'Guardando...';

    let resultado;
    try {
      resultado = idEditando
        ? await conTiempo(supabaseClient.from('recepciones').update(payload).eq('id', idEditando).select(COLUMNAS))
        : await conTiempo(supabaseClient.from('recepciones').insert(payload).select(COLUMNAS));
    } catch (err) {
      resultado = { error: err };
    }

    guardando = false;
    $('saveBtn').disabled = false;
    $('saveBtn').textContent = idEditando ? 'Actualizar recepción' : 'Guardar recepción';

    if (resultado.error) {
      mostrarMsg(mensajeError(resultado.error, 'guardar'));
      return;
    }

    const fila = resultado.data && resultado.data[0];

    if (idEditando && !fila) {
      cerrarModal();
      showToast('No se pudo actualizar: la recepción ya no existe o no tienes permiso.', 'error');
      cargarDatos();
      return;
    }

    cerrarModal();
    showToast(idEditando ? 'Recepción actualizada correctamente.' : 'Recepción registrada correctamente.', 'success');

    if (fila) {
      if (idEditando) {
        const i = recepciones.findIndex(function(r){ return String(r.id) === String(idEditando); });
        if (i > -1) recepciones[i] = fila; else recepciones.unshift(fila);
      } else {
        recepciones.unshift(fila);
      }
      recepciones.sort(function(a, b){
        const fa = parsearFecha(a.fecha_recepcion), fb = parsearFecha(b.fecha_recepcion);
        return (fb ? fb.getTime() : 0) - (fa ? fa.getTime() : 0);
      });
      despuesDeCambio();
      resaltarRecepcion(fila.id);
    } else {
      sigRec = '';
      cargarDatos();
    }
  });

  // ---------------------------------------------------------------
  // ELIMINAR
  // ---------------------------------------------------------------
  function pedirEliminar(id){
    const r = recepciones.find(function(x){ return String(x.id) === String(id); });
    if (!r) return;
    idPorEliminar = r.id;
    $('confirmTexto').textContent = '¿Eliminar la recepción de "' + (nombreRel(r.productos) || 'este producto') + '"? Esta acción no se puede deshacer.';
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
    if (!supabaseClient) { showToast('Conectando… intenta de nuevo en un momento.', 'error'); return; }
    eliminando = true;
    const id = idPorEliminar;
    $('confirmOk').disabled = true;
    $('confirmOk').textContent = 'Eliminando...';

    let resultado;
    try {
      resultado = await conTiempo(supabaseClient.from('recepciones').delete().eq('id', id).select('id'));
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
      showToast('No se pudo eliminar: la recepción ya no existe o no tienes permiso.', 'error');
      cargarDatos();
      return;
    }

    if ($('modalOverlay').classList.contains('show') && String($('receptionId').value) === String(id)) cerrarModal();

    recepciones = recepciones.filter(function(r){ return String(r.id) !== String(id); });
    despuesDeCambio();
    showToast('Recepción eliminada correctamente.', 'success');
  });

  // ---------------------------------------------------------------
  // EVENTOS DE LA LISTA Y LA BÚSQUEDA
  // ---------------------------------------------------------------
  function clickLista(e){
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'editar') {
      const r = recepciones.find(function(x){ return String(x.id) === String(btn.dataset.id); });
      if (r) abrirModal(r); else showToast('Esa recepción ya no existe.', 'error');
    } else if (btn.dataset.action === 'eliminar') {
      pedirEliminar(btn.dataset.id);
    }
  }
  $('receptionTable').addEventListener('click', clickLista);
  $('receptionCards').addEventListener('click', clickLista);
  $('receptionCards').addEventListener('keydown', function(e){
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.pcard');
    if (!card) return;
    e.preventDefault();
    const r = recepciones.find(function(x){ return String(x.id) === String(card.dataset.id); });
    if (r) abrirModal(r);
  });

  $('emptyState').addEventListener('click', function(e){
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'limpiar') { $('searchInput').value = ''; aplicarFiltros(true); }
    else if (btn.dataset.action === 'nuevo') abrirModal(null);
  });

  $('btnMas').addEventListener('click', function(){
    limiteMostrar += TAM_PAGINA;
    renderTabla();
  });

  $('searchInput').addEventListener('input', function(){
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function(){ aplicarFiltros(true); }, 120);
  });

  $('avisoBtn').addEventListener('click', function(){
    if (supabaseClient) cargarDatos(); else window.location.reload();
  });

  // ---------------------------------------------------------------
  // MENÚ "MÁS" EN CELULAR
  // ---------------------------------------------------------------
  const fan = $('fan');
  const fanBtn = $('fanBtn');

  function abrirFan(){
    menuAbierto = true;
    fan.classList.add('open');
    fanBtn.classList.add('open');
    fanBtn.setAttribute('aria-expanded', 'true');
    $('fanBtnLabel').textContent = 'Cerrar';
    actualizarScroll();
  }
  function cerrarFan(){
    menuAbierto = false;
    fan.classList.remove('open');
    fanBtn.classList.remove('open');
    fanBtn.setAttribute('aria-expanded', 'false');
    $('fanBtnLabel').textContent = 'Más';
    actualizarScroll();
  }

  fanBtn.addEventListener('click', function(){ fan.classList.contains('open') ? cerrarFan() : abrirFan(); });
  $('fanOverlay').addEventListener('click', cerrarFan);
  window.addEventListener('resize', function(){ if (window.innerWidth > 1000 && menuAbierto) cerrarFan(); });

  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    if ($('confirmOverlay').classList.contains('show')) { cerrarConfirmacion(); return; }
    if ($('modalOverlay').classList.contains('show')) { cerrarModal(); return; }
    cerrarPanel();
    cerrarFan();
  });

  // ---------------------------------------------------------------
  // REFRESCO AUTOMÁTICO
  // ---------------------------------------------------------------
  window.addEventListener('pageshow', function(e){
    if (e.persisted && uid) { renderNotificaciones(); cargarDatos(); }
  });
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden && uid && Date.now() - ultimaActualizacion > 30000) cargarDatos();
  });
  window.addEventListener('online', function(){ if (uid) cargarDatos(); });

  // ---------------------------------------------------------------
  // INICIO
  // ---------------------------------------------------------------
  // 1) Sin esperar al SDK: se dibuja lo último guardado en este dispositivo
  function arranqueRapido(){
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      if (id) {
        idPendiente = id;
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (e) { /* se ignora */ }

    let u = null;
    try { u = localStorage.getItem(CLAVE_UID); } catch (e) { /* se ignora */ }
    if (!u) return;
    uid = u;
    const c = leerCache(u);
    if (!c) return;
    aplicarCache(c);
    if (idPendiente && recepciones.some(function(r){ return String(r.id) === String(idPendiente); })) {
      const id = idPendiente; idPendiente = null; resaltarRecepcion(id);
    }
  }

  // 2) Cuando el SDK está listo: se confirma la sesión y se piden los datos nuevos
  async function conectar(){
    if (supabaseClient || typeof supabase === 'undefined') return;
    supabaseClient = DSI.cliente();

    supabaseClient.auth.onAuthStateChange(function(evento){
      if (evento === 'SIGNED_OUT') { borrarLocal(); window.location.replace('login.html'); }
    });

    let session = null;
    try {
      const res = await supabaseClient.auth.getSession();
      session = res.data.session;
    } catch (err) {
      console.error('No se pudo leer la sesión:', err);
    }

    if (!session) { borrarLocal(); window.location.replace('login.html'); return; }

    const u = session.user;
    const meta = u.user_metadata || {};
    pintarUsuario((meta.full_name || meta.name || (u.email || '').split('@')[0] || 'Usuario').trim() || 'Usuario');

    if (uid !== u.id) {
      // Otra cuenta distinta a la guardada: se descarta lo dibujado
      if (uid) {
        recepciones = []; productos = []; proveedores = [];
        sigRec = sigProd = sigProv = '';
        datosListos = false; productosListos = false;
        $('tablaRecepciones').hidden = true;
        $('receptionCards').hidden = true;
        $('emptyState').hidden = true;
        $('loadingState').hidden = false;
      }
      uid = u.id;
      const c = leerCache(uid);
      if (c) aplicarCache(c);
    }
    try { localStorage.setItem(CLAVE_UID, uid); } catch (e) { /* se ignora */ }

    await cargarDatos();
  }

  function sinSDK(){
    if (supabaseClient) return;
    $('loadingState').hidden = true;
    mostrarAviso('No se pudo cargar el sistema. Revisa tu conexión e intenta de nuevo.');
    $('avisoBtn').textContent = 'Recargar';
  }

  arranqueRapido();

  if (typeof supabase !== 'undefined') {
    conectar();
  } else {
    const sdk = $('sdk');
    sdk.addEventListener('load', conectar);
    sdk.addEventListener('error', sinSDK);
    setTimeout(function(){ if (!supabaseClient) sinSDK(); }, 15000);
  }
})();
