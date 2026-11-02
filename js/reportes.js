/* ==========================================================
   Lógica del módulo: reportes.html
   Extraída del HTML sin cambios: mismo código y mismo orden de ejecución.
   ========================================================== */
(function(){
  'use strict';

  const $ = id => document.getElementById(id);

  if (typeof supabase === 'undefined') {
    $('avisoTexto').textContent = 'No se pudo cargar el sistema. Revisa tu conexión e intenta de nuevo.';
    $('aviso').classList.add('show');
    $('avisoBtn').addEventListener('click', () => window.location.reload());
    return;
  }

  const supabaseClient = DSI.cliente();

  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Las librerías de PDF solo se descargan cuando se necesitan (o en segundo plano al estar libre)
  const URL_JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const URL_AUTOTABLE = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js';

  const POR_PAGINA = 10;
  const LIMITE_TABLA = 100;     // registros recientes de recepciones y calidad que se cargan para la tabla

  // ---------------------------------------------------------------
  // ESTADO
  // ---------------------------------------------------------------
  let usuarioActual = null;
  let productosBusqueda = [];
  let proveedoresBusqueda = [];
  let nombreUsuario = 'Usuario';
  let datos = { productos: [], proveedores: [], recepciones: [], calidad: [], totalRec: 0, totalCal: 0 };
  let mapaProd = new Map();
  let mapaProv = new Map();
  let registros = [];
  let visibles = POR_PAGINA;
  let datosListos = false;
  let errorCarga = false;
  let cargando = false;
  let ultimaActualizacion = 0;
  let notifsActuales = [];
  let firmaPintada = '';
  let generando = false;

  // ---------------------------------------------------------------
  // UTILIDADES
  // ---------------------------------------------------------------
  function escapeHTML(texto){
    return String(texto ?? '').replace(/[&<>"']/g, c => (
      { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
    ));
  }
  function normalizar(texto){
    return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  const fmtNumero = n => Math.round(n).toLocaleString('es-CO');
  const fmtPeso   = n => (Math.round(n * 100) / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' kg';

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
  function fechaPDF(valor){
    const f = parsearFecha(valor);
    return f ? f.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
  }
  function hoyISO(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  const PALABRAS_PROBLEMA  = ['rechaz', 'dano', 'danad', 'deterior', 'vencid', 'cancelad', 'inactiv', 'no apto'];
  const PALABRAS_PENDIENTE = ['pendiente', 'evaluacion', 'revision', 'observ'];

  function clasificarEstado(estado){
    const e = normalizar(estado);
    if (PALABRAS_PROBLEMA.some(p => e.includes(p)))  return 'warn';
    if (PALABRAS_PENDIENTE.some(p => e.includes(p))) return 'pend';
    return 'ok';
  }

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

  let temporizadorToast;
  function mostrarToast(mensaje, tipo){
    const t = $('toast');
    t.textContent = mensaje;
    t.className = 'toast show ' + (tipo || '');
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => { t.className = 'toast'; }, 3600);
  }

  function mostrarAviso(texto){ $('avisoTexto').textContent = texto; $('aviso').classList.add('show'); }
  function ocultarAviso(){ $('aviso').classList.remove('show'); }

  function conLimite(promesa, ms){
    let id;
    const limite = new Promise((_, rechazar) => { id = setTimeout(() => rechazar(new Error('Tiempo de espera agotado')), ms || 15000); });
    return Promise.race([promesa, limite]).finally(() => clearTimeout(id));
  }

  // ---------------------------------------------------------------
  // FILTRO DE ESCRITURA DEL BUSCADOR (letras, números, espacios y guion)
  // ---------------------------------------------------------------
  const L = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
  const RE_BUSQUEDA = new RegExp('[^' + L + '0-9\\s\\-]', 'g');

  function filtrarBusqueda(campo){
    const antes = campo.value;
    const despues = antes.replace(RE_BUSQUEDA, '').replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
    if (despues === antes) return;
    const pos = campo.selectionStart;
    campo.value = despues;
    if (pos !== null) {
      const nueva = Math.max(0, pos - (antes.length - despues.length));
      try { campo.setSelectionRange(nueva, nueva); } catch (e) {}
    }
  }

  // ---------------------------------------------------------------
  // USUARIO Y ENCABEZADO
  // ---------------------------------------------------------------

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

  function pintarUsuario(){
    const u = usuarioActual;
    nombreUsuario = (u.user_metadata?.full_name || u.user_metadata?.name || (u.email || '').split('@')[0] || 'Usuario').trim() || 'Usuario';
    const inicial = nombreUsuario.charAt(0).toUpperCase();
    $('topUserName').textContent = nombreUsuario;
    $('topAvatar').textContent   = inicial;
  }
  // ---------------------------------------------------------------
  // CACHÉ LOCAL
  // ---------------------------------------------------------------
  const claveCache = () => 'dsi_rep_' + usuarioActual.id;

  function leerCache(){
    try {
      const c = JSON.parse(localStorage.getItem(claveCache()) || 'null');
      if (c && Array.isArray(c.productos) && Array.isArray(c.proveedores) && Array.isArray(c.recepciones) && Array.isArray(c.calidad)) return c;
    } catch (e) {}
    return null;
  }
  function guardarCache(){
    try { localStorage.setItem(claveCache(), JSON.stringify(datos)); } catch (e) {}
  }

  function reconstruirMapas(){
    mapaProd = new Map(datos.productos.map(p => [String(p.id), p.nombre]));
    mapaProv = new Map(datos.proveedores.map(p => [String(p.id), p.nombre]));
  }

  // ---------------------------------------------------------------
  // CARGA DE DATOS: 4 consultas en paralelo, solo las columnas necesarias.
  // Los totales de recepciones y calidad vienen del conteo del servidor,
  // sin descargar todos los registros.
  // ---------------------------------------------------------------
  async function actualizarDatos(){
    if (cargando) return;
    cargando = true;
    let hayError = false;

    try {
      const [prod, prov, rec, cal] = await conLimite(Promise.all([
        supabaseClient.from('productos').select('id,nombre,estado,created_at').order('created_at', { ascending: false }),
        supabaseClient.from('proveedores').select('id,nombre,estado,created_at').order('created_at', { ascending: false }),
        supabaseClient.from('recepciones')
          .select('id,producto_id,peso,estado_producto,fecha_recepcion', { count: 'exact' })
          .order('fecha_recepcion', { ascending: false, nullsFirst: false })
          .limit(LIMITE_TABLA),
        supabaseClient.from('controles_calidad')
          .select('id,producto_id,resultado,fecha_control', { count: 'exact' })
          .order('fecha_control', { ascending: false, nullsFirst: false })
          .limit(LIMITE_TABLA)
      ]));

      if (prod.error) { hayError = true; console.error('Error productos:', prod.error); }
      else datos.productos = prod.data || [];

      if (prov.error) { hayError = true; console.error('Error proveedores:', prov.error); }
      else datos.proveedores = prov.data || [];

      if (rec.error) { hayError = true; console.error('Error recepciones:', rec.error); }
      else { datos.recepciones = rec.data || []; datos.totalRec = rec.count ?? datos.recepciones.length; }

      if (cal.error) { hayError = true; console.error('Error controles de calidad:', cal.error); }
      else { datos.calidad = cal.data || []; datos.totalCal = cal.count ?? datos.calidad.length; }
    } catch (err) {
      hayError = true;
      console.error('Error cargando reportes:', err);
    }

    cargando = false;
    errorCarga = hayError;
    datosListos = true;

    if (hayError) {
      mostrarAviso('No se pudieron actualizar algunos datos. Revisa tu conexión.');
    } else {
      ocultarAviso();
      guardarCache();
      ultimaActualizacion = Date.now();
    }

    pintar();
    programarPrecargaPDF();
  }

  // ---------------------------------------------------------------
  // PINTAR
  // ---------------------------------------------------------------
  function construirRegistros(){
    const lista = [];
    const agregar = (tipo, nombre, fecha, estado) => {
      const f = parsearFecha(fecha);
      lista.push({
        tipo: tipo, nombre: nombre, fecha: fecha, estado: estado,
        t: f ? f.getTime() : 0,
        busq: normalizar(nombre + ' ' + tipo + ' ' + estado)
      });
    };

    datos.productos.forEach(p => agregar('Producto', p.nombre || 'Sin nombre', p.created_at, p.estado || 'Activo'));
    datos.proveedores.forEach(p => agregar('Proveedor', p.nombre || 'Sin nombre', p.created_at, p.estado || 'Activo'));
    datos.recepciones.forEach(r => agregar('Recepción', mapaProd.get(String(r.producto_id)) || 'Recepción', r.fecha_recepcion, r.estado_producto || 'Recibido'));
    datos.calidad.forEach(c => agregar('Calidad', mapaProd.get(String(c.producto_id)) || 'Control de calidad', c.fecha_control, c.resultado || 'Pendiente'));

    lista.sort((a, b) => b.t - a.t);
    return lista;
  }

  function pintar(){
    if (!datosListos) return;

    const firma = JSON.stringify(datos) + '|' + errorCarga;
    if (firma === firmaPintada) return;
    firmaPintada = firma;

    reconstruirMapas();
      productosBusqueda = datos.productos;
      proveedoresBusqueda = datos.proveedores;
    registros = construirRegistros();

    const totalProd = datos.productos.length;
    const totalProv = datos.proveedores.length;

    animarNumero($('totalProductos'), totalProd, fmtNumero);
    animarNumero($('totalProveedores'), totalProv, fmtNumero);
    animarNumero($('totalRecepciones'), datos.totalRec, fmtNumero);
    animarNumero($('totalCalidad'), datos.totalCal, fmtNumero);

    animarNumero($('resProductos'), totalProd, fmtNumero);
    animarNumero($('resProveedores'), totalProv, fmtNumero);
    animarNumero($('resRecepciones'), datos.totalRec, fmtNumero);
    animarNumero($('resCalidad'), datos.totalCal, fmtNumero);

    const inactivos = lista => lista.filter(x => normalizar(x.estado) === 'inactivo').length;
    const inP = inactivos(datos.productos), inV = inactivos(datos.proveedores);
    $('dProductos').textContent = `${fmtNumero(totalProd - inP)} activos · ${fmtNumero(inP)} inactivos`;
    $('dProveedores').textContent = `${fmtNumero(totalProv - inV)} activos · ${fmtNumero(inV)} inactivos`;
    $('dRecepciones').textContent = datos.recepciones.length ? 'Última: ' + formatearFecha(datos.recepciones[0].fecha_recepcion) : 'Sin recepciones';
    $('dCalidad').textContent = datos.calidad.length ? 'Último: ' + formatearFecha(datos.calidad[0].fecha_control) : 'Sin controles';

    pintarTabla(true);
    renderNotificaciones();
  }

  function filtrarRegistros(){
    const q = normalizar($('buscar').value);
    const tipo = $('tipoFiltro').value;
    return registros.filter(r => (tipo === 'todos' || r.tipo === tipo) && (!q || r.busq.includes(q)));
  }

  function pintarTabla(animar){
    const tbody = $('tablaReportes');
    const lista = filtrarRegistros();

    if (!lista.length) {
      let msg = 'No hay registros disponibles.';
      if (errorCarga && !registros.length) msg = 'No se pudo cargar la información.';
      else if (registros.length) msg = 'No se encontraron resultados para la búsqueda.';
      tbody.innerHTML = `<tr class="vacio"><td colspan="4" class="empty">${msg}</td></tr>`;
      $('tablaPie').style.display = 'none';
      return;
    }

    const mostrar = lista.slice(0, visibles);
    tbody.innerHTML = mostrar.map((r, i) => {
      const anim = animar && !reducirMovimiento ? ` class="row-in" style="animation-delay:${Math.min(i, 10) * 25}ms"` : '';
      const claveTipo = r.tipo === 'Recepción' ? 'Recepcion' : r.tipo;
      return `<tr${anim}>
        <td data-label="Tipo"><span class="pill tp-${claveTipo}">${escapeHTML(r.tipo)}</span></td>
        <td data-label="Nombre">${escapeHTML(r.nombre)}</td>
        <td data-label="Fecha">${formatearFecha(r.fecha)}</td>
        <td data-label="Estado"><span class="pill ${clasificarEstado(r.estado)}">${escapeHTML(r.estado)}</span></td>
      </tr>`;
    }).join('');

    $('tablaPie').style.display = 'flex';
    $('tablaInfo').textContent = `Mostrando ${mostrar.length} de ${lista.length}`;
    $('verMas').style.display = lista.length > mostrar.length ? '' : 'none';
  }

  let temporizadorBusqueda;
  $('buscar').addEventListener('input', function(){
    filtrarBusqueda($('buscar'));
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => { visibles = POR_PAGINA; pintarTabla(false); }, 120);
  });
  $('tipoFiltro').addEventListener('change', () => { visibles = POR_PAGINA; pintarTabla(true); });
  $('verMas').addEventListener('click', () => { visibles += POR_PAGINA; pintarTabla(false); });

  // ---------------------------------------------------------------
  // PERIODO DEL REPORTE (validación)
  // ---------------------------------------------------------------
  const campoDesde = $('desde'), campoHasta = $('hasta');
  campoDesde.max = campoHasta.max = hoyISO();

  function marcarErrorPeriodo(mensaje){
    const caja = $('periodoBox');
    caja.classList.remove('invalid');
    if (mensaje) { void caja.offsetWidth; caja.classList.add('invalid'); }
    $('errorPeriodo').textContent = mensaje || '';
  }

  // Devuelve { desde: Date|null, hasta: Date|null } o null si hay un error
  function validarPeriodo(){
    const vd = campoDesde.value, vh = campoHasta.value;
    const hoy = hoyISO();
    let error = '';

    const fechaValida = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && parseInt(v.slice(0, 4), 10) >= 2000;

    if (vd && !fechaValida(vd)) error = 'La fecha inicial no es válida.';
    else if (vh && !fechaValida(vh)) error = 'La fecha final no es válida.';
    else if (vd && vd > hoy) error = 'La fecha inicial no puede ser futura.';
    else if (vh && vh > hoy) error = 'La fecha final no puede ser futura.';
    else if (vd && vh && vd > vh) error = 'La fecha inicial no puede ser posterior a la final.';

    marcarErrorPeriodo(error);
    if (error) return null;

    let desde = null, hasta = null;
    if (vd) desde = parsearFecha(vd);
    if (vh) { const f = parsearFecha(vh); hasta = new Date(f.getFullYear(), f.getMonth(), f.getDate(), 23, 59, 59, 999); }
    return { desde: desde, hasta: hasta, textoDesde: vd, textoHasta: vh };
  }

  campoDesde.addEventListener('change', validarPeriodo);
  campoHasta.addEventListener('change', validarPeriodo);
  $('limpiarPeriodo').addEventListener('click', function(){
    campoDesde.value = '';
    campoHasta.value = '';
    marcarErrorPeriodo('');
  });

  function textoPeriodo(p){
    if (!p.desde && !p.hasta) return 'Todos los registros';
    const f = v => fechaPDF(v);
    if (p.desde && p.hasta) return f(p.textoDesde) + ' al ' + f(p.textoHasta);
    if (p.desde) return 'Desde el ' + f(p.textoDesde);
    return 'Hasta el ' + f(p.textoHasta);
  }

  function enPeriodo(valor, p){
    if (!p.desde && !p.hasta) return true;
    const f = parsearFecha(valor);
    if (!f) return false;
    if (p.desde && f < p.desde) return false;
    if (p.hasta && f > p.hasta) return false;
    return true;
  }

  // ---------------------------------------------------------------
  // LIBRERÍAS DE PDF (carga bajo demanda)
  // ---------------------------------------------------------------
  let promesaLibs = null;

  function cargarScript(src){
    return new Promise((resolver, rechazar) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolver;
      s.onerror = () => rechazar(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }
  function cargarLibreriasPDF(){
    if (window.jspdf && window.jspdf.jsPDF && typeof window.jspdf.jsPDF.API.autoTable === 'function') return Promise.resolve();
    if (promesaLibs) return promesaLibs;
    promesaLibs = cargarScript(URL_JSPDF)
      .then(() => cargarScript(URL_AUTOTABLE))
      .catch(err => { promesaLibs = null; throw err; });
    return promesaLibs;
  }

  let precargaProgramada = false;
  function programarPrecargaPDF(){
    if (precargaProgramada) return;
    precargaProgramada = true;
    const lanzar = () => { cargarLibreriasPDF().catch(() => {}); };
    if ('requestIdleCallback' in window) requestIdleCallback(lanzar, { timeout: 4000 });
    else setTimeout(lanzar, 2500);
  }

  // Logo para el encabezado del PDF (si no se puede leer, se usa solo texto)
  let promesaLogo = null;
  function cargarLogo(){
    if (promesaLogo) return promesaLogo;
    promesaLogo = Promise.race([
      new Promise(resolver => {
        const img = new Image();
        img.onload = function(){
          try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            c.getContext('2d').drawImage(img, 0, 0);
            resolver({ data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
          } catch (e) { resolver(null); }
        };
        img.onerror = () => resolver(null);
        img.src = 'logo-emblema.png';
      }),
      new Promise(resolver => setTimeout(() => resolver(null), 3000))
    ]);
    return promesaLogo;
  }

  // ---------------------------------------------------------------
  // DEFINICIÓN DE LOS REPORTES
  // ---------------------------------------------------------------
  const vacio = v => (v === null || v === undefined || String(v).trim() === '') ? '-' : v;
  const contar = (lista, fn) => lista.filter(fn).length;
  const distintos = (lista, fn) => new Set(lista.map(x => normalizar(fn(x))).filter(Boolean)).size;
  const esInactivo = x => normalizar(x.estado) === 'inactivo';

  const REPORTES = {
    productos: {
      titulo: 'Reporte de productos',
      archivo: 'productos',
      tabla: 'productos',
      orden: 'created_at',
      fecha: r => r.created_at,
      cols: [
        { t: 'Nombre',        v: r => r.nombre },
        { t: 'Categoría',     v: r => r.categoria },
        { t: 'Proveedor',     v: (r, c) => r.proveedor || c.mapaProv.get(String(r.proveedor_id)) },
        { t: 'Fecha captura', v: r => r.fecha_captura ? fechaPDF(r.fecha_captura) : '', w: 27 },
        { t: 'Origen',        v: r => r.origen },
        { t: 'Estado',        v: r => r.estado, estado: true, w: 26 }
      ],
      resumen: d => [
        { t: 'Total de productos', v: fmtNumero(d.length) },
        { t: 'Activos', v: fmtNumero(contar(d, x => !esInactivo(x))) },
        { t: 'Inactivos', v: fmtNumero(contar(d, esInactivo)) },
        { t: 'Categorías distintas', v: fmtNumero(distintos(d, x => x.categoria)) }
      ]
    },
    proveedores: {
      titulo: 'Reporte de proveedores',
      archivo: 'proveedores',
      tabla: 'proveedores',
      orden: 'created_at',
      fecha: r => r.created_at,
      cols: [
        { t: 'Nombre',    v: r => r.nombre },
        { t: 'Tipo',      v: r => r.tipo },
        { t: 'Ubicación', v: r => r.ubicacion },
        { t: 'Teléfono',  v: r => r.telefono, w: 32 },
        { t: 'Email',     v: r => r.email },
        { t: 'Estado',    v: r => r.estado, estado: true, w: 26 }
      ],
      resumen: d => [
        { t: 'Total de proveedores', v: fmtNumero(d.length) },
        { t: 'Activos', v: fmtNumero(contar(d, x => !esInactivo(x))) },
        { t: 'Inactivos', v: fmtNumero(contar(d, esInactivo)) },
        { t: 'Tipos distintos', v: fmtNumero(distintos(d, x => x.tipo)) }
      ]
    },
    recepciones: {
      titulo: 'Reporte de recepciones',
      archivo: 'recepciones',
      tabla: 'recepciones',
      orden: 'fecha_recepcion',
      fecha: r => r.fecha_recepcion,
      cols: [
        { t: 'Producto',        v: (r, c) => c.mapaProd.get(String(r.producto_id)) },
        { t: 'Proveedor',       v: (r, c) => c.mapaProv.get(String(r.proveedor_id)) },
        { t: 'Peso (kg)',       v: r => (r.peso === null || r.peso === undefined || r.peso === '') ? '' : (Number(r.peso) || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 }), w: 28, derecha: true },
        { t: 'Estado',          v: r => r.estado_producto || 'Recibido', estado: true, w: 30 },
        { t: 'Fecha recepción', v: r => r.fecha_recepcion ? fechaPDF(r.fecha_recepcion) : '', w: 32 }
      ],
      resumen: d => [
        { t: 'Total de recepciones', v: fmtNumero(d.length) },
        { t: 'Peso total recibido', v: fmtPeso(d.reduce((s, r) => s + (Number(r.peso) || 0), 0)) },
        { t: 'Sin novedad', v: fmtNumero(contar(d, r => clasificarEstado(r.estado_producto || 'Recibido') === 'ok')) },
        { t: 'Con novedad', v: fmtNumero(contar(d, r => clasificarEstado(r.estado_producto || 'Recibido') !== 'ok')) }
      ],
      // Fila de totales al final de la tabla
      pie: d => ['TOTAL', '', '', fmtPeso(d.reduce((s, r) => s + (Number(r.peso) || 0), 0)).replace(' kg', ''), '', '']
    },
    calidad: {
      titulo: 'Reporte de controles de calidad',
      archivo: 'calidad',
      tabla: 'controles_calidad',
      orden: 'fecha_control',
      fecha: r => r.fecha_control,
      cols: [
        { t: 'Producto',  v: (r, c) => c.mapaProd.get(String(r.producto_id)) },
        { t: 'Recepción', v: (r, c) => { const f = c.mapaRec.get(String(r.recepcion_id)); return f ? 'Del ' + fechaPDF(f) : ''; }, w: 30 },
        { t: 'Color',     v: r => r.color },
        { t: 'Olor',      v: r => r.olor },
        { t: 'Textura',   v: r => r.textura },
        { t: 'Resultado', v: r => r.resultado, estado: true, w: 28 },
        { t: 'Fecha',     v: r => r.fecha_control ? fechaPDF(r.fecha_control) : '', w: 26 }
      ],
      resumen: d => {
        const aprob = contar(d, r => normalizar(r.resultado).includes('aprob'));
        const rech = contar(d, r => normalizar(r.resultado).includes('rechaz'));
        return [
          { t: 'Total de controles', v: fmtNumero(d.length) },
          { t: 'Aprobados', v: fmtNumero(aprob) },
          { t: 'Rechazados', v: fmtNumero(rech) },
          { t: 'Pendientes u otros', v: fmtNumero(d.length - aprob - rech) }
        ];
      }
    }
  };

  // Trae todos los registros de una tabla (el servidor entrega máximo 1000 por consulta)
  async function traerTodo(tabla, orden, columnas){
    const paso = 1000;
    const todo = [];
    for (let desde = 0; desde < 100000; desde += paso) {
      const { data, error } = await supabaseClient
        .from(tabla)
        .select(columnas || '*')
        .order(orden, { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
        .range(desde, desde + paso - 1);
      if (error) throw error;
      todo.push(...(data || []));
      if (!data || data.length < paso) break;
    }
    return todo;
  }

  // ---------------------------------------------------------------
  // GENERACIÓN DEL PDF
  // ---------------------------------------------------------------
  // Los PDF estándar solo admiten caracteres latinos; cualquier otro se reemplaza
  const limpiarPDF = v => String(v ?? '').normalize('NFC').replace(/[^\u0009\u000A\u0020-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u20AC]/g, '?');

  const AZUL = [6, 43, 91];
  const ACENTOS = [[30, 102, 245], [123, 92, 199], [27, 138, 90], [255, 169, 77]];
  const PALETA_ESTADO = {
    ok:   { fondo: [220, 247, 229], texto: [20, 97, 66] },
    pend: { fondo: [255, 243, 205], texto: [122, 90, 0] },
    warn: { fondo: [255, 227, 209], texto: [180, 83, 0] }
  };

  function crearPDF(cfg, filas, contexto, periodo, logo){
    const { jsPDF } = window.jspdf;
    let papel = 'a4';
    try { if (JSON.parse(localStorage.getItem('dsi_prefs_v1') || '{}').papel === 'letter') papel = 'letter'; } catch (e) {}
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: papel });
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();
    const M = 16;
    const DORADO = [255, 215, 106];
    const ahora = new Date();
    const emision = ahora.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    const hora = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const codigo = 'DSI-' + cfg.archivo.slice(0, 3).toUpperCase() + '-' + hoyISO().replace(/-/g, '') + '-' +
      Math.random().toString(36).slice(2, 6).toUpperCase();
    const conPeriodo = !!(periodo.desde || periodo.hasta);

    pdf.setProperties({
      title: limpiarPDF(cfg.titulo),
      subject: 'Informe generado por Deep Sea Intelligence',
      author: limpiarPDF(nombreUsuario),
      creator: 'Deep Sea Intelligence'
    });

    // ---------- Portada: banda institucional ----------
    pdf.setFillColor(...AZUL);
    pdf.rect(0, 0, W, 40, 'F');
    pdf.setFillColor(...DORADO);
    pdf.rect(0, 40, W, 1.2, 'F');

    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(M, 10, 20, 20, 3.5, 3.5, 'F');
    if (logo && logo.data) {
      const ratio = logo.w / logo.h;
      const iw = ratio >= 1 ? 15.5 : 15.5 * ratio;
      const ih = ratio >= 1 ? 15.5 / ratio : 15.5;
      try { pdf.addImage(logo.data, 'PNG', M + 10 - iw / 2, 20 - ih / 2, iw, ih); } catch (e) {}
    }
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text('Deep Sea Intelligence', M + 26, 18);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(170, 205, 240);
    pdf.text('Gestión inteligente de recursos marinos', M + 26, 24);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...DORADO);
    pdf.text('INFORME DEL SISTEMA', M + 26, 31);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(170, 205, 240);
    pdf.text('Código del documento', W - M, 14, { align: 'right' });
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(255, 255, 255);
    pdf.text(codigo, W - M, 19.5, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(170, 205, 240);
    pdf.text('Emitido el ' + emision + ', ' + hora, W - M, 26, { align: 'right' });

    // ---------- Título del informe ----------
    pdf.setTextColor(...AZUL);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.text(limpiarPDF(cfg.titulo), M, 60);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(91, 112, 137);
    pdf.text('Resumen y detalle de los registros del sistema.', M, 67);

    // ---------- Datos del documento ----------
    const yMeta = 74, hMeta = 15, gap = 4, anchoM = (W - 2 * M - 2 * gap) / 3;
    const datosDoc = [
      ['Generado por', nombreUsuario],
      ['Registros incluidos', fmtNumero(filas.length)],
      ['Periodo', conPeriodo ? textoPeriodo(periodo) : 'Todo el historial']
    ];
    datosDoc.forEach((d, i) => {
      const x = M + i * (anchoM + gap);
      pdf.setFillColor(244, 247, 252);
      pdf.roundedRect(x, yMeta, anchoM, hMeta, 2.5, 2.5, 'F');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.8);
      pdf.setTextColor(91, 112, 137);
      pdf.text(d[0].toUpperCase(), x + 4, yMeta + 5.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(...AZUL);
      pdf.text(limpiarPDF(String(d[1])).slice(0, 38), x + 4, yMeta + 11.5);
    });

    const seccion = (numero, titulo, y) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(...AZUL);
      pdf.text(numero + '   ' + limpiarPDF(titulo), M, y);
      pdf.setFillColor(...DORADO);
      pdf.rect(M, y + 2.2, 12, 0.9, 'F');
    };

    // ---------- 1. Resumen ----------
    let y = 100;
    seccion('1', 'Resumen', y);
    y += 8;
    const resumen = cfg.resumen(filas);
    const sepK = 4, anchoK = (W - 2 * M - sepK * (resumen.length - 1)) / resumen.length;
    resumen.forEach((r, i) => {
      const x = M + i * (anchoK + sepK);
      pdf.setFillColor(...ACENTOS[i % ACENTOS.length]);
      pdf.rect(x, y, anchoK, 1.4, 'F');
      pdf.setFillColor(248, 250, 253);
      pdf.rect(x, y + 1.4, anchoK, 22, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(15);
      pdf.setTextColor(...AZUL);
      pdf.text(limpiarPDF(r.v), x + 4, y + 12.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(91, 112, 137);
      pdf.text(limpiarPDF(r.t), x + 4, y + 19);
    });
    y += 31;

    // ---------- 2. Detalle ----------
    seccion('2', 'Detalle de registros', y);
    y += 6;

    const columnas = [{ t: 'N°', w: 10, centro: true }].concat(cfg.cols);
    const cuerpo = filas.map((r, i) => [String(i + 1)].concat(cfg.cols.map(c => limpiarPDF(vacio(c.v(r, contexto))))));
    const colsEstado = new Set();
    const estilosCol = {};
    columnas.forEach((c, i) => {
      const e = {};
      if (c.w) e.cellWidth = c.w;
      if (c.derecha) e.halign = 'right';
      if (c.centro) e.halign = 'center';
      if (c.estado) colsEstado.add(i);
      estilosCol[i] = e;
    });
    const pie = cfg.pie ? [cfg.pie(filas).map(limpiarPDF)] : undefined;

    pdf.autoTable({
      startY: y,
      head: [columnas.map(c => c.t)],
      body: cuerpo,
      foot: pie,
      showFoot: 'lastPage',
      showHead: 'everyPage',
      theme: 'plain',
      margin: { top: 24, left: M, right: M, bottom: 22 },
      styles: {
        font: 'helvetica', fontSize: 8, cellPadding: { top: 2.4, bottom: 2.4, left: 2, right: 2 },
        textColor: [36, 59, 87], valign: 'middle', overflow: 'linebreak', lineWidth: 0
      },
      headStyles: { fillColor: [233, 240, 250], textColor: AZUL, fontStyle: 'bold', fontSize: 7.5, halign: 'left' },
      footStyles: { fillColor: [244, 247, 252], textColor: AZUL, fontStyle: 'bold', halign: 'right' },
      columnStyles: estilosCol,
      rowPageBreak: 'avoid',
      didParseCell: function(data){
        if (data.section === 'body' && colsEstado.has(data.column.index) && data.cell.raw && data.cell.raw !== '-') {
          const paleta = PALETA_ESTADO[clasificarEstado(data.cell.raw)];
          data.cell.styles.textColor = paleta.texto;
          data.cell.styles.fontStyle = 'bold';
        }
      },
      // Solo líneas horizontales finas entre filas (sin cuadrícula)
      didDrawCell: function(data){
        if (data.section !== 'body') return;
        pdf.setDrawColor(228, 233, 240);
        pdf.setLineWidth(0.25);
        const yl = data.cell.y + data.cell.height;
        pdf.line(data.cell.x, yl, data.cell.x + data.cell.width, yl);
      },
      didDrawPage: function(data){
        // Cabecera reducida en las páginas siguientes
        if (data.pageNumber > 1) {
          pdf.setFillColor(...AZUL);
          pdf.rect(0, 0, W, 13, 'F');
          pdf.setFillColor(...DORADO);
          pdf.rect(0, 13, W, 0.8, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8.5);
          pdf.setTextColor(255, 255, 255);
          pdf.text(limpiarPDF(cfg.titulo), M, 8.3);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7.5);
          pdf.setTextColor(190, 208, 232);
          pdf.text(codigo, W - M, 8.3, { align: 'right' });
        }
        // Pie de página en todas las hojas
        pdf.setDrawColor(228, 233, 240);
        pdf.setLineWidth(0.3);
        pdf.line(M, H - 14, W - M, H - 14);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(120, 138, 160);
        pdf.text('Deep Sea Intelligence  ·  Documento generado automáticamente por el sistema', M, H - 8.5);
        pdf.text('Página ' + data.pageNumber + ' de {total_pages}', W - M, H - 8.5, { align: 'right' });
      }
    });

    pdf.putTotalPages('{total_pages}');
    return pdf;
  }

  async function generarReporte(clave, boton){
    if (generando) return;
    const cfg = REPORTES[clave];
    if (!cfg) return;

    // 1) Validar el periodo antes de pedir datos
    const periodo = validarPeriodo();
    if (!periodo) {
      mostrarToast('Corrige el periodo del reporte antes de continuar.', 'error');
      $('periodoBox').scrollIntoView({ behavior: reducirMovimiento ? 'auto' : 'smooth', block: 'center' });
      return;
    }

    generando = true;
    const textoOriginal = boton.textContent;
    document.querySelectorAll('[data-reporte]').forEach(b => { b.disabled = true; });
    boton.classList.add('loading');
    boton.textContent = 'Generando';

    try {
      // 2) Todo lo necesario se pide en paralelo
      const pedidos = [
        conLimite(traerTodo(cfg.tabla, cfg.orden, '*'), 45000),
        cargarLibreriasPDF(),
        cargarLogo()
      ];
      if (clave === 'calidad') pedidos.push(conLimite(traerTodo('recepciones', 'fecha_recepcion', 'id,fecha_recepcion'), 45000));

      const [bruto, , logo, recepcionesRef] = await Promise.all(pedidos);

      const filas = bruto.filter(r => enPeriodo(cfg.fecha(r), periodo));
      if (!filas.length) {
        mostrarToast(periodo.desde || periodo.hasta
          ? 'No hay registros en el periodo seleccionado.'
          : 'No hay información disponible para generar este reporte.', 'error');
        return;
      }

      const contexto = {
        mapaProd: mapaProd,
        mapaProv: mapaProv,
        mapaRec: new Map((recepcionesRef || []).map(r => [String(r.id), r.fecha_recepcion]))
      };

      // Se deja respirar al navegador para que el botón muestre el estado antes del trabajo pesado
      await new Promise(r => setTimeout(r, 30));

      const pdf = crearPDF(cfg, filas, contexto, periodo, logo);
      const nombre = 'reporte_' + cfg.archivo + '_' + hoyISO() + '.pdf';
      pdf.save(nombre);
      mostrarToast('Reporte generado: ' + nombre, 'success');
    } catch (err) {
      console.error('Error generando el PDF:', err);
      const sinLibreria = String(err && err.message).includes('No se pudo cargar');
      mostrarToast(sinLibreria
        ? 'No se pudo cargar el generador de PDF. Revisa tu conexión.'
        : 'No fue posible generar el PDF. Intenta de nuevo.', 'error');
    } finally {
      generando = false;
      boton.classList.remove('loading');
      boton.textContent = textoOriginal;
      document.querySelectorAll('[data-reporte]').forEach(b => { b.disabled = false; });
    }
  }

  document.querySelectorAll('[data-reporte]').forEach(boton => {
    boton.addEventListener('click', () => generarReporte(boton.dataset.reporte, boton));
    // Al acercarse al botón ya se van descargando las librerías
    boton.addEventListener('pointerenter', () => { cargarLibreriasPDF().catch(() => {}); }, { once: true });
  });

  // ---------------------------------------------------------------
  // NOTIFICACIONES (comparten el estado de "leídas" con las demás páginas)
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
      if (clase === 'ok') return;
      lista.push({
        key: `rec:${r.id}:${normalizar(estado)}`,
        tipo: clase,
        titulo: `Recepción ${estado.toLowerCase()}`,
        texto: `${mapaProd.get(String(r.producto_id)) || 'Producto'} — ${fmtPeso(Number(r.peso) || 0)}`,
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
    setTimeout(function(){ window.location.href = n.href; }, 170);
  });

  $('markAllRead').addEventListener('click', function(){
    const leidas = leerLeidas();
    construirNotificaciones().forEach(n => leidas.add(n.key));
    guardarLeidas(leidas);
    renderNotificaciones();
  });

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
  // BUSCADOR (productos y proveedores, con los datos ya cargados)
  // ---------------------------------------------------------------
  const buscador = $('buscador');
  const cajaResultados = $('resultadosBusqueda');

  function cerrarBusqueda(){ cajaResultados.classList.remove('show'); cajaResultados.innerHTML = ''; }

  function buscar(){
    const q = normalizar(buscador.value);
    if (!q) { cerrarBusqueda(); return; }

    const prods = productosBusqueda
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

  function actualizarScroll(){
    document.body.style.overflow = $('fan').classList.contains('open') ? 'hidden' : '';
  }

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
    actualizarScroll();
  }
  function cerrarFan(){
    fan.classList.remove('open');
    fanBtn.classList.remove('open');
    fanBtn.setAttribute('aria-expanded', 'false');
    $('fanBtnLabel').textContent = 'Más';
    actualizarScroll();
  }

  fanBtn.addEventListener('click', () => fan.classList.contains('open') ? cerrarFan() : abrirFan());
  $('fanOverlay').addEventListener('click', cerrarFan);
  window.addEventListener('resize', () => { if (window.innerWidth > 1000) cerrarFan(); });

  // Escape: cierra lo que esté abierto
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
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

  $('avisoBtn').addEventListener('click', actualizarDatos);

  window.addEventListener('pageshow', function(e){
    if (e.persisted && usuarioActual) { renderNotificaciones(); actualizarDatos(); }
  });
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden && usuarioActual && leerPref(PREF_AUTO, 'on') !== 'off' && !generando && Date.now() - ultimaActualizacion > 30000) actualizarDatos();
  });
  window.addEventListener('online', function(){ if (usuarioActual) actualizarDatos(); });

  // ---------------------------------------------------------------
  // INICIO
  // ---------------------------------------------------------------
  async function iniciar(){

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

    // 1) Se muestra al instante lo último guardado
    const cache = leerCache();
    if (cache) {
      datos = Object.assign({ totalRec: cache.recepciones.length, totalCal: cache.calidad.length }, cache);
      datosListos = true;
      pintar();
    }

    // 2) Se piden los datos frescos en segundo plano
    await actualizarDatos();
  }

  iniciar();

})();
