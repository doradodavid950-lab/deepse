/* ==========================================================
   Lógica del módulo: almacenamiento.html
   Extraída del HTML sin cambios: mismo código y mismo orden de ejecución.
   ========================================================== */
(function(){
  'use strict';

  const $ = id => document.getElementById(id);

  // Si el SDK no cargó (sin internet) se avisa y se ofrece recargar
  if (typeof supabase === 'undefined') {
    $('avisoTexto').textContent = 'No se pudo cargar el sistema. Revisa tu conexión e intenta de nuevo.';
    $('aviso').classList.add('show');
    $('avisoBtn').addEventListener('click', () => window.location.reload());
    return;
  }

  const supabaseClient = DSI.cliente();

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
  // CONFIGURACIÓN (cámbiala aquí si tus reglas de negocio son otras)
  // ---------------------------------------------------------------
  const TIPOS   = ['Refrigerado', 'Congelado'];
  const ESTADOS = ['Almacenado', 'Conservado', 'Disponible', 'En revisión'];

  // Rangos de temperatura (°C) aceptados según el tipo de almacenamiento
  const RANGO_TEMP = {
    'Refrigerado': { min: -2, max: 10 },
    'Congelado':   { min: -60, max: 0 }
  };

  // ---------------------------------------------------------------
  // ESTADO DE LA PÁGINA
  // ---------------------------------------------------------------
  let usuarioActual = null;
  let datos = { productos: [], almacenamientos: [], recepciones: [], proveedores: [] };
  let datosListos = false;
  let errorCarga = false;
  let cargando = false;
  let ultimaActualizacion = 0;
  let notifsActuales = [];
  let firmaPintada = '';
  let editandoId = null;        // id real del registro que se edita (null = nuevo)
  let guardando = false;
  let resolverConfirmacion = null;

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
  function formatearHora(valor){
    const f = parsearFecha(valor);
    if (!f || (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor))) return '';
    return f.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }
  // Fecha local en el formato que pide <input type="datetime-local">
  function aInputFecha(fecha){
    const d = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
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

  // Aviso emergente
  let temporizadorToast;
  function mostrarToast(mensaje, tipo){
    const t = $('toast');
    t.textContent = mensaje;
    t.className = 'toast show ' + (tipo || '');
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => { t.className = 'toast'; }, 3200);
  }

  function mostrarAviso(texto){ $('avisoTexto').textContent = texto; $('aviso').classList.add('show'); }
  function ocultarAviso(){ $('aviso').classList.remove('show'); }

  // ---------------------------------------------------------------
  // FILTROS DE ESCRITURA (se aplican mientras el usuario escribe o pega)
  // Uso: agrega data-filtro="..." a cualquier <input> o <textarea>.
  //   numero       → solo números (negativo y 1 decimal)
  //   letras       → solo letras y espacios
  //   alfanumerico → letras, números, espacios, guion, punto y #
  //   busqueda     → letras, números, espacios y guion
  //   texto        → texto normal con puntuación básica (sin símbolos raros)
  // ---------------------------------------------------------------
  const L = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
  const FILTROS = {
    numero: v => {
      let s = v.replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
      const negativo = s.charAt(0) === '-';
      s = s.replace(/-/g, '');
      const i = s.indexOf('.');
      if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, 1);
      return (negativo ? '-' : '') + s;
    },
    letras:       v => v.replace(new RegExp('[^' + L + '\\s]', 'g'), '').replace(/\s{2,}/g, ' '),
    alfanumerico: v => v.replace(new RegExp('[^' + L + '0-9\\s.\\-#]', 'g'), '').replace(/\s{2,}/g, ' '),
    busqueda:     v => v.replace(new RegExp('[^' + L + '0-9\\s\\-]', 'g'), '').replace(/\s{2,}/g, ' '),
    texto:        v => v.replace(new RegExp('[^' + L + '0-9\\s.,;:()%°¿?¡!/\\-]', 'g'), '').replace(/[ \t]{2,}/g, ' ')
  };

  function aplicarFiltro(campo){
    const filtro = FILTROS[campo.dataset.filtro];
    if (!filtro) return;
    const antes = campo.value;
    let despues = filtro(antes);
    // No permite empezar con espacios
    if (campo.dataset.filtro !== 'texto') despues = despues.replace(/^\s+/, '');
    if (despues === antes) return;
    const pos = campo.selectionStart;
    campo.value = despues;
    if (pos !== null) {
      const nueva = Math.max(0, pos - (antes.length - despues.length));
      try { campo.setSelectionRange(nueva, nueva); } catch (e) {}
    }
  }

  document.querySelectorAll('[data-filtro]').forEach(campo => {
    campo.addEventListener('input', () => aplicarFiltro(campo));
  });

  // ---------------------------------------------------------------
  // VALIDACIÓN DEL FORMULARIO
  // ---------------------------------------------------------------
  const RE_UBICACION = new RegExp('^[' + L + '0-9][' + L + '0-9 .\\-#]*$');
  const RE_TEMP      = /^-?\d{1,2}(\.\d)?$/;

  function marcarError(idCampo, mensaje){
    const campo = $(idCampo);
    const grupo = campo.closest('.form-group');
    const caja  = grupo.querySelector('.field-error');
    // Reinicia la animación de temblor si el error se repite
    grupo.classList.remove('invalid');
    if (mensaje) { void grupo.offsetWidth; grupo.classList.add('invalid'); }
    caja.textContent = mensaje || '';
    campo.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
  }

  function limpiarErrores(){
    ['producto','lote','tipo','ubicacion','temperatura','estado','fecha','observaciones'].forEach(id => marcarError(id, ''));
  }

  function validarFormulario(){
    const errores = {};

    const productoId = $('producto').value;
    if (!productoId) errores.producto = 'Selecciona un producto.';
    else if (!datos.productos.some(p => String(p.id) === productoId)) errores.producto = 'El producto seleccionado ya no existe.';

    const loteId = $('lote').value || null;
    const lotesProducto = (datos.recepciones || []).filter(r => String(r.producto_id) === String(productoId));
    const opcionLote = $('lote').selectedOptions[0];
    if (lotesProducto.length && !loteId && editandoId === null) errores.lote = 'Selecciona el lote de origen del almacenamiento.';
    if (loteId && !lotesProducto.some(r => String(r.id) === String(loteId)) && !(editandoId !== null && opcionLote && opcionLote.dataset.historico === 'true')) errores.lote = 'El lote no corresponde al producto seleccionado.';

    const tipo = $('tipo').value;
    if (!tipo) errores.tipo = 'Selecciona el tipo de almacenamiento.';
    else if (!TIPOS.includes(tipo)) errores.tipo = 'Tipo no válido.';

    const ubicacion = $('ubicacion').value.trim();
    if (!ubicacion) errores.ubicacion = 'La ubicación es obligatoria.';
    else if (ubicacion.length < 2) errores.ubicacion = 'Escribe al menos 2 caracteres.';
    else if (!RE_UBICACION.test(ubicacion)) errores.ubicacion = 'Solo letras, números, espacios, guion, punto y #.';

    const tempTexto = $('temperatura').value.trim().replace(',', '.');
    if (tempTexto !== '') {
      if (!RE_TEMP.test(tempTexto)) {
        errores.temperatura = 'Escribe solo números (ej. 4 o -18.5).';
      } else if (TIPOS.includes(tipo)) {
        const t = Number(tempTexto), r = RANGO_TEMP[tipo];
        if (t < r.min || t > r.max) errores.temperatura = `Para ${tipo.toLowerCase()} la temperatura debe estar entre ${r.min} y ${r.max} °C.`;
      }
    }

    if (!ESTADOS.includes($('estado').value)) errores.estado = 'Selecciona un estado válido.';

    const fechaTexto = $('fecha').value;
    if (!fechaTexto) errores.fecha = 'Selecciona la fecha de almacenamiento.';
    else {
      const f = new Date(fechaTexto);
      if (isNaN(f.getTime()) || f.getFullYear() < 2000) errores.fecha = 'Fecha no válida.';
      else if (f.getTime() > Date.now() + 60000) errores.fecha = 'La fecha no puede ser futura.';
    }

    const obs = $('observaciones').value.trim();
    if (obs.length > 300) errores.observaciones = 'Máximo 300 caracteres.';

    limpiarErrores();
    const ids = Object.keys(errores);
    ids.forEach(id => marcarError(id, errores[id]));
    if (ids.length) {
      const primero = $(ids[0]);
      primero.focus();
      return null;
    }

    return {
      producto_id: productoId,
      recepcion_id: $('lote').value || null,
      tipo: tipo,
      ubicacion: ubicacion,
      temperatura: tempTexto === '' ? null : Number(tempTexto),
      estado_producto: $('estado').value,
      fecha_almacenamiento: new Date(fechaTexto).toISOString(),
      observaciones: obs || null
    };
  }

  // Quita el error de un campo en cuanto el usuario lo corrige
  ['producto','tipo','ubicacion','temperatura','estado','fecha','observaciones'].forEach(id => {
    const el = $(id);
    const evento = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evento, () => marcarError(id, ''));
  });
  $('tipo').addEventListener('change', actualizarAyudaTemperatura);
  $('observaciones').addEventListener('input', () => { $('obsCount').textContent = $('observaciones').value.length; });

  function actualizarAyudaTemperatura(){
    const r = RANGO_TEMP[$('tipo').value];
    $('tempHint').textContent = r
      ? `Solo números. Rango para este tipo: ${r.min} a ${r.max} °C.`
      : 'Solo números. Puede ser negativa y con un decimal.';
  }

  // ---------------------------------------------------------------
  // USUARIO Y ENCABEZADO
  // ---------------------------------------------------------------
  function pintarUsuario(){
    const u = usuarioActual;
    const nombre = (u.user_metadata?.full_name || u.user_metadata?.name || (u.email || '').split('@')[0] || 'Usuario').trim() || 'Usuario';
    const inicial = nombre.charAt(0).toUpperCase();
    $('topUserName').textContent = nombre;
    $('topAvatar').textContent   = inicial;
  }

  // ---------------------------------------------------------------
  // CACHÉ LOCAL
  // ---------------------------------------------------------------
  const claveCache = () => 'dsi_alm_' + usuarioActual.id;

  function leerCache(){
    try {
      const c = JSON.parse(localStorage.getItem(claveCache()) || 'null');
      if (c && Array.isArray(c.productos) && Array.isArray(c.almacenamientos) && Array.isArray(c.recepciones)) return c;
    } catch (e) {}
    return null;
  }
  function guardarCache(){
    try { localStorage.setItem(claveCache(), JSON.stringify(datos)); } catch (e) {}
  }

  // ---------------------------------------------------------------
  // CARGA DE DATOS (3 consultas en paralelo con tiempo límite de 15 s)
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
      const [prod, alm, rec, prov] = await Promise.race([Promise.all([
        supabaseClient.from('productos').select('id,nombre,estado,proveedor').order('nombre', { ascending: true }),
        supabaseClient
          .from('almacenamientos')
          .select('id,producto_id,recepcion_id,tipo,ubicacion,temperatura,estado_producto,fecha_almacenamiento,observaciones,productos(nombre)')
          .order('fecha_almacenamiento', { ascending: false, nullsFirst: false }),
        // Solo para las notificaciones (se piden las más recientes)
        supabaseClient
          .from('recepciones')
          .select('id,codigo_lote,producto_id,peso,estado_producto,fecha_recepcion,proveedor_id,productos(nombre),proveedores(nombre)')
          .order('fecha_recepcion', { ascending: false, nullsFirst: false })
          .limit(500),
        // Solo para el buscador de la barra superior
        supabaseClient.from('proveedores').select('id,nombre,estado')
      ]), tiempoAgotado]);

      if (prod.error) { hayError = true; console.error('Error productos:', prod.error); }
      else datos.productos = prod.data || [];

      if (alm.error) { hayError = true; console.error('Error almacenamientos:', alm.error); }
      else datos.almacenamientos = alm.data || [];

      if (rec.error) { console.error('Error recepciones (notificaciones):', rec.error); }
      else datos.recepciones = rec.data || [];

      if (!prov.error) datos.proveedores = prov.data || [];
    } catch (err) {
      hayError = true;
      console.error('Error cargando almacenamiento:', err);
    } finally {
      clearTimeout(temporizador);
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
  }

  // ---------------------------------------------------------------
  // PINTAR
  // ---------------------------------------------------------------
  function pintar(){
    if (!datosListos) return;

    const firma = JSON.stringify(datos) + '|' + errorCarga;
    if (firma === firmaPintada) return;
    firmaPintada = firma;

    const alm = datos.almacenamientos;
    animarNumero($('totalCount'), alm.length, fmtNumero);
    animarNumero($('refrigeratedCount'), alm.filter(a => normalizar(a.tipo) === 'refrigerado').length, fmtNumero);
    animarNumero($('frozenCount'),       alm.filter(a => normalizar(a.tipo) === 'congelado').length, fmtNumero);

    animarNumero($('outCount'), alm.filter(fueraDeRango).length, fmtNumero);

    pintarTabla(true);
    renderNotificaciones();
  }

  // ¿La temperatura registrada está fuera del rango permitido para su tipo?
  function fueraDeRango(a){
    if (a.temperatura === null || a.temperatura === undefined || a.temperatura === '') return false;
    const r = RANGO_TEMP[a.tipo];
    const t = Number(a.temperatura);
    return !!r && isFinite(t) && (t < r.min || t > r.max);
  }

  function nombreProducto(item){
    const p = Array.isArray(item.productos) ? item.productos[0] : item.productos;
    return p?.nombre || 'Sin producto';
  }

  function pintarTabla(animar){
    const tabla = $('storageTable');
    const q = normalizar($('searchInput').value);

    const lista = datos.almacenamientos.filter(it => {
      if (!q) return true;
      return normalizar([nombreProducto(it), it.ubicacion, it.tipo, it.estado_producto].join(' ')).includes(q);
    });

    if (!lista.length) {
      let msg = 'No hay registros de almacenamiento.';
      if (errorCarga && !datos.almacenamientos.length) msg = 'No se pudo cargar la información.';
      else if (q) msg = 'No se encontraron resultados para la búsqueda.';
      tabla.innerHTML = `<tr><td colspan="8" class="empty">${msg}</td></tr>`;
      return;
    }

    tabla.innerHTML = lista.map((it, i) => {
      const tipoClase = normalizar(it.tipo) === 'refrigerado' ? 'refrigerado' : 'congelado';
      const tieneTemp = it.temperatura !== null && it.temperatura !== undefined && it.temperatura !== '';
      const temp = tieneTemp ? Number(it.temperatura).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' °C' : '-';
      const malTemp = fueraDeRango(it);
      const hora = formatearHora(it.fecha_almacenamiento);
      const fecha = formatearFecha(it.fecha_almacenamiento);
      const anim = animar && !reducirMovimiento ? ` class="row-in" style="animation-delay:${Math.min(i, 10) * 30}ms"` : '';
      const id = escapeHTML(it.id);
      const nombre = escapeHTML(nombreProducto(it));

      return `<tr${anim} data-id="${id}">
        <td><div class="nom"><span class="chip"><svg class="i" aria-hidden="true"><use href="#i-wh"/></svg></span><strong>${nombre}</strong></div></td>
        <td><span class="pill ${tipoClase}">${escapeHTML(it.tipo || '-')}</span></td>
        <td>${escapeHTML(it.ubicacion || '-')}</td>
        <td class="${malTemp ? 'temp-bad' : (tieneTemp ? '' : 'sin-dato')}">${escapeHTML(temp)}${malTemp ? ' ⚠' : ''}</td>
        <td><span class="pill ${clasificarEstado(it.estado_producto)}">${escapeHTML(it.estado_producto || '-')}</span></td>
        <td class="td-fecha">${fecha}${hora ? `<small>${hora}</small>` : ''}</td>
        <td><div class="row-actions">
          <button class="action-btn" type="button" data-accion="editar" data-id="${id}" title="Editar" aria-label="Editar ${nombre}"><svg class="i" aria-hidden="true"><use href="#i-edit"/></svg></button>
          <button class="action-btn danger" type="button" data-accion="eliminar" data-id="${id}" title="Eliminar" aria-label="Eliminar ${nombre}"><svg class="i" aria-hidden="true"><use href="#i-trash"/></svg></button>
        </div></td>
        <td class="c-meta"><span class="pill ${tipoClase}">${escapeHTML(it.tipo || '-')}</span>${tieneTemp ? `<span class="${malTemp ? 'temp-bad' : ''}"><b>${escapeHTML(temp)}</b></span>` : ''}<span>${fecha}${hora ? ' · ' + hora : ''}</span></td>
      </tr>`;
    }).join('');
  }

  // Búsqueda (el filtro de escritura ya limpió el texto)
  let temporizadorBusqueda;
  $('searchInput').addEventListener('input', function(){
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => pintarTabla(false), 120);
  });

  // Botones Editar / Eliminar (delegación de eventos: no hace falta onclick en el HTML)
  $('storageTable').addEventListener('click', function(e){
    const btn = e.target.closest('button[data-accion]');
    if (!btn) return;
    const item = datos.almacenamientos.find(a => String(a.id) === btn.dataset.id);
    if (!item) return;
    if (btn.dataset.accion === 'editar') abrirModal(item);
    else eliminar(item, btn.closest('tr'));
  });

  // ---------------------------------------------------------------
  // BLOQUEO DE SCROLL (modales y menú móvil)
  // ---------------------------------------------------------------
  function actualizarScroll(){
    const abierto = $('storageModal').classList.contains('show')
      || $('confirmModal').classList.contains('show')
      || $('fan').classList.contains('open');
    document.body.style.overflow = abierto ? 'hidden' : '';
  }

  // ---------------------------------------------------------------
  // MODAL DE FORMULARIO
  // ---------------------------------------------------------------
  const modal = $('storageModal');

  function llenarProductos(item){
    const select = $('producto');
    // En un almacenamiento nuevo solo aparecen productos que aún no están
    // registrados. Al editar, se conserva disponible el producto del registro actual.
    const yaAlmacenados = new Set(datos.almacenamientos
      .filter(a => !item || String(a.id) !== String(item.id))
      .map(a => String(a.producto_id)));
    const disponibles = datos.productos.filter(p =>
      !yaAlmacenados.has(String(p.id)) || (item && String(item.producto_id) === String(p.id))
    );
    if (!disponibles.length) {
      select.innerHTML = '<option value="">Todos los productos ya están en almacenamiento</option>';
      return;
    }
    select.innerHTML = '<option value="">Seleccionar producto</option>' + disponibles.map(p => {
      const inactivo = normalizar(p.estado) === 'inactivo';
      const actual = item && String(item.producto_id) === String(p.id);
      const bloqueado = inactivo && !actual;
      const proveedor = String(p.proveedor || '').trim();
      const detalleProveedor = proveedor ? ` — Proveedor: ${proveedor}` : ' — Sin proveedor';
      return `<option value="${escapeHTML(p.id)}"${bloqueado ? ' disabled' : ''}>${escapeHTML(p.nombre)}${escapeHTML(detalleProveedor)}${inactivo ? ' (inactivo)' : ''}</option>`;
    }).join('');
  }

  function llenarLotes(productoId, item){
    const select = $('lote');
    const actual = item && item.recepcion_id ? String(item.recepcion_id) : '';
    const lotes = (datos.recepciones || []).filter(r => String(r.producto_id) === String(productoId));
    select.innerHTML = '<option value="">Sin lote vinculado</option>' + lotes.map(r => {
      const prov = (Array.isArray(r.proveedores) ? r.proveedores[0] : r.proveedores)?.nombre || 'Sin proveedor';
      const fecha = r.fecha_recepcion ? new Date(r.fecha_recepcion).toLocaleDateString('es-CO') : 'Fecha sin registrar';
      const label = (r.codigo_lote ? r.codigo_lote + ' · ' : '') + fecha + ' · ' + fmtPeso(Number(r.peso) || 0) + ' · ' + prov + ' · ' + (r.estado_producto || 'Recibido');
      return '<option value="' + escapeHTML(r.id) + '">' + escapeHTML(label) + '</option>';
    }).join('');
    if (actual && !lotes.some(r => String(r.id) === actual)) {
      select.insertAdjacentHTML('beforeend', '<option value="' + escapeHTML(actual) + '" data-historico="true">Lote vinculado anteriormente</option>');
    }
    select.value = actual || '';
  }

  $('producto').addEventListener('change', function(){ llenarLotes($('producto').value, null); });

  function abrirModal(item){
    editandoId = item ? item.id : null;
    $('storageForm').reset();
    limpiarErrores();
    llenarProductos(item);

    // La fecha no puede ser futura
    const ahora = new Date();
    $('fecha').max = aInputFecha(ahora);
    $('fecha').min = '2000-01-01T00:00';

    if (item) {
      $('producto').value      = item.producto_id ?? '';
      llenarLotes(item.producto_id, item);
      $('lote').value          = item.recepcion_id || '';
      $('tipo').value          = item.tipo || '';
      $('ubicacion').value     = item.ubicacion || '';
      $('temperatura').value   = item.temperatura ?? '';
      $('estado').value        = ESTADOS.includes(item.estado_producto) ? item.estado_producto : 'Almacenado';
      $('observaciones').value = item.observaciones || '';
      const f = parsearFecha(item.fecha_almacenamiento);
      $('fecha').value = f ? aInputFecha(f) : aInputFecha(ahora);
      $('modalTitle').textContent = 'Editar almacenamiento';
      $('saveBtn').textContent = 'Actualizar almacenamiento';
    } else {
      llenarLotes($('producto').value, null);
      $('fecha').value = aInputFecha(ahora);
      $('modalTitle').textContent = 'Nuevo almacenamiento';
      $('saveBtn').textContent = 'Guardar almacenamiento';
    }

    $('obsCount').textContent = $('observaciones').value.length;
    actualizarAyudaTemperatura();
    modal.classList.add('show');
    actualizarScroll();
    setTimeout(() => $('producto').focus(), 60);
  }

  function cerrarModal(){
    modal.classList.remove('show');
    actualizarScroll();
  }

  $('newStorageBtn').addEventListener('click', () => abrirModal(null));
  $('newStorageFab').addEventListener('click', () => abrirModal(null));
  $('closeModal').addEventListener('click', cerrarModal);
  $('cancelBtn').addEventListener('click', cerrarModal);
  modal.addEventListener('mousedown', e => { if (e.target === modal) cerrarModal(); });

  // ---------------------------------------------------------------
  // GUARDAR
  // ---------------------------------------------------------------
  $('storageForm').addEventListener('submit', async function(e){
    e.preventDefault();
    if (guardando) return;

    const payload = validarFormulario();
    if (!payload) { mostrarToast('Revisa los campos marcados en rojo', 'error'); return; }

    guardando = true;
    const btn = $('saveBtn');
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = 'Guardando...';

    let resultado;
    try {
      // Segunda validación contra la base de datos para evitar duplicados
      // aunque los datos de la pantalla estén desactualizados.
      const duplicadosQuery = supabaseClient.from('almacenamientos')
        .select('id')
        .eq('producto_id', payload.producto_id);
      if (editandoId !== null) duplicadosQuery.neq('id', editandoId);
      const { data: duplicados, error: errorDuplicados } = await duplicadosQuery.limit(1);

      if (errorDuplicados) throw errorDuplicados;
      if (duplicados && duplicados.length) {
        guardando = false;
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.textContent = textoOriginal;
        mostrarToast('Este producto ya está registrado en almacenamiento.', 'error');
        await refrescar();
        return;
      }

      resultado = editandoId !== null
        ? await supabaseClient.from('almacenamientos').update(payload).eq('id', editandoId)
        : await supabaseClient.from('almacenamientos').insert([payload]);
    } catch (err) {
      resultado = { error: err };
    }

    guardando = false;
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = textoOriginal;

    if (resultado.error) {
      console.error('Error al guardar:', resultado.error);
      mostrarToast('No se pudo guardar el almacenamiento', 'error');
      return;
    }

    const eraEdicion = editandoId !== null;
    cerrarModal();
    mostrarToast(eraEdicion ? 'Almacenamiento actualizado correctamente' : 'Almacenamiento registrado correctamente', 'success');
    await refrescar();
  });

  // Fuerza una recarga aunque haya otra en curso
  async function refrescar(){
    let intentos = 0;
    while (cargando && intentos++ < 40) await new Promise(r => setTimeout(r, 100));
    await actualizarDatos();
  }

  // ---------------------------------------------------------------
  // ELIMINAR (con ventana de confirmación)
  // ---------------------------------------------------------------
  function confirmar(htmlTexto){
    return new Promise(resolver => {
      $('confirmText').innerHTML = htmlTexto;
      resolverConfirmacion = resolver;
      $('confirmModal').classList.add('show');
      actualizarScroll();
      setTimeout(() => $('confirmNo').focus(), 60);
    });
  }
  function cerrarConfirmacion(respuesta){
    $('confirmModal').classList.remove('show');
    actualizarScroll();
    if (resolverConfirmacion) { resolverConfirmacion(respuesta); resolverConfirmacion = null; }
  }
  $('confirmYes').addEventListener('click', () => cerrarConfirmacion(true));
  $('confirmNo').addEventListener('click', () => cerrarConfirmacion(false));
  $('confirmModal').addEventListener('mousedown', e => { if (e.target === $('confirmModal')) cerrarConfirmacion(false); });

  async function eliminar(item, fila){
    const ok = await confirmar(`¿Deseas eliminar el registro de almacenamiento de <strong>${escapeHTML(nombreProducto(item))}</strong>? Esta acción no se puede deshacer.`);
    if (!ok) return;

    let error = null;
    try {
      const res = await supabaseClient.from('almacenamientos').delete().eq('id', item.id);
      error = res.error;
    } catch (err) { error = err; }

    if (error) {
      console.error('Error al eliminar:', error);
      mostrarToast('No se pudo eliminar el registro', 'error');
      return;
    }

    if (fila && !reducirMovimiento) {
      fila.classList.add('removing');
      await new Promise(r => setTimeout(r, 230));
    }
    mostrarToast('Registro eliminado correctamente', 'success');
    await refrescar();
  }

  // ---------------------------------------------------------------
  // NOTIFICACIONES (comparten el estado de "leídas" con la página de Inicio)
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

  // Escape: cierra lo que esté abierto, de lo más reciente a lo más antiguo
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    if ($('confirmModal').classList.contains('show')) { cerrarConfirmacion(false); return; }
    if (modal.classList.contains('show')) { cerrarModal(); return; }
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
    // No se recarga si el usuario está llenando el formulario
    if (!document.hidden && usuarioActual && leerPref(PREF_AUTO, 'on') !== 'off' && !modal.classList.contains('show') && Date.now() - ultimaActualizacion > 30000) actualizarDatos();
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
      datos = cache;
      datosListos = true;
      pintar();
    }

    // 2) Se piden los datos frescos en segundo plano
    await actualizarDatos();
  }

  iniciar();

  // ---------------------------------------------------------------
  // INVENTARIO DISPONIBLE
  // Disponible = recibido aprobado − vendido ± ajustes (lo calcula la base de datos).
  // Solo el dueño de la cuenta registra ajustes; el auditor solo consulta.
  // ---------------------------------------------------------------
  let invEsAuditor = false;
  let invFilas = [];

  function mostrarToastInv(texto, tipo){
    const t = $('toast');
    t.textContent = texto;
    t.className = 'toast show' + (tipo ? ' ' + tipo : '');
    clearTimeout(mostrarToastInv.timer);
    mostrarToastInv.timer = setTimeout(function(){ t.className = 'toast'; }, 3600);
  }
  const fmtKgInv = function(n){ return (Math.round(Number(n || 0) * 100) / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' kg'; };
  const fmtNumInv = function(n){ return (Math.round(Number(n || 0) * 100) / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }); };
  function pillStockInv(e){
    if (e === 'Agotado') return '<span class="pill bad">Agotado</span>';
    if (e === 'Bajo') return '<span class="pill warn">Bajo</span>';
    return '<span class="pill ok">OK</span>';
  }

  function enfocarProductoNotificado(){
    let id = '';
    try { id = new URLSearchParams(window.location.search).get('producto') || ''; } catch (e) {}
    if (!id) return;
    const filas = Array.from($('invTabla').querySelectorAll('tr[data-id]'));
    const fila = filas.find(function(tr){ return String(tr.dataset.id) === String(id); });
    if (!fila) return;
    fila.classList.add('resaltado');
    $('invSec').scrollIntoView({ behavior: 'smooth', block: 'center' });
    fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try { history.replaceState(null, '', window.location.pathname + '#invSec'); } catch (e) {}
  }

  function pintarInventario(filas){
    invFilas = filas;
    const total = filas.reduce(function(s, f){ return s + Number(f.disponible || 0); }, 0);
    const bajo = filas.filter(function(f){ return f.estado_stock === 'Bajo'; }).length;
    const agotado = filas.filter(function(f){ return f.estado_stock === 'Agotado'; }).length;
    const revision = filas.reduce(function(s, f){ return s + Number(f.en_revision || 0); }, 0);

    [['invTotal', fmtNumInv(total) + ' kg'], ['invBajo', String(bajo)], ['invAgotado', String(agotado)], ['invRevision', fmtNumInv(revision) + ' kg']]
      .forEach(function(par){ const el = $(par[0]); el.classList.remove('loading-val'); el.textContent = par[1]; });

    $('invTabla').innerHTML = filas.length ? filas.map(function(f){
      const minimo = invEsAuditor
        ? fmtKgInv(f.stock_minimo)
        : '<input type="number" class="min-in" min="0" step="0.5" value="' + Number(f.stock_minimo) + '" data-id="' + escapeHTML(f.producto_id) + '" aria-label="Stock mínimo de ' + escapeHTML(f.nombre) + '">';
      return '<tr data-id="' + escapeHTML(f.producto_id) + '">' +
        '<td data-label="Producto"><strong>' + escapeHTML(f.nombre) + '</strong></td>' +
        '<td data-label="Recibido">' + fmtKgInv(f.recibido) + '</td>' +
        '<td data-label="Vendido">' + fmtKgInv(f.vendido) + '</td>' +
        '<td data-label="Ajustes">' + fmtKgInv(f.ajustes) + '</td>' +
        '<td data-label="Disponible"><strong>' + fmtKgInv(f.disponible) + '</strong></td>' +
        '<td data-label="Mínimo">' + minimo + '</td>' +
        '<td data-label="Estado">' + pillStockInv(f.estado_stock) + '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="7" class="empty">No hay productos registrados.</td></tr>';
    enfocarProductoNotificado();
  }

  async function cargarInventario(){
    if (!supabaseClient) return;
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (user) {
        const { data: perf } = await supabaseClient.from('perfiles').select('rol').eq('id', user.id).maybeSingle();
        invEsAuditor = !!(perf && perf.rol === 'auditor');
      }
      const { data, error } = await supabaseClient.from('inventario_productos')
        .select('producto_id,nombre,stock_minimo,recibido,vendido,ajustes,en_revision,disponible,estado_stock')
        .order('nombre', { ascending: true });
      if (error) { console.warn('No se pudo cargar el inventario:', error); return; }
      pintarInventario(data || []);
    } catch (e) {
      console.warn('Inventario no disponible:', e);
    }
    $('btnAjuste').hidden = invEsAuditor;
  }

  // Cambiar el stock mínimo de un producto (se guarda al salir del campo)
  $('invTabla').addEventListener('change', async function(e){
    const inp = e.target.closest('.min-in');
    if (!inp) return;
    const v = Number(inp.value);
    if (!isFinite(v) || v < 0) { mostrarToastInv('El mínimo debe ser 0 o mayor.', 'error'); cargarInventario(); return; }
    const { error } = await supabaseClient.from('productos').update({ stock_minimo: v }).eq('id', inp.dataset.id);
    if (error) { mostrarToastInv('No se pudo guardar el mínimo.', 'error'); cargarInventario(); return; }
    mostrarToastInv('Stock mínimo actualizado.', 'success');
    cargarInventario();
  });

  $('btnAjuste').addEventListener('click', function(){
    $('ajProducto').innerHTML = '<option value="">Seleccionar producto</option>' + invFilas.map(function(f){
      return '<option value="' + escapeHTML(f.producto_id) + '">' + escapeHTML(f.nombre) + '</option>';
    }).join('');
    $('ajCantidad').value = '';
    $('ajMotivo').value = '';
    $('ajusteForm').hidden = false;
    $('ajCantidad').focus();
  });
  $('ajCancelar').addEventListener('click', function(){ $('ajusteForm').hidden = true; });

  $('ajusteForm').addEventListener('submit', async function(e){
    e.preventDefault();
    const pid = $('ajProducto').value;
    const cant = Number($('ajCantidad').value);
    const motivo = $('ajMotivo').value.trim();
    if (!pid) { mostrarToastInv('Selecciona un producto.', 'error'); return; }
    if (!isFinite(cant) || cant === 0) { mostrarToastInv('La cantidad debe ser distinta de 0. Usa negativo para restar.', 'error'); return; }
    if (motivo.length < 3) { mostrarToastInv('Escribe el motivo del ajuste (mínimo 3 letras).', 'error'); return; }

    $('ajGuardar').disabled = true;
    const { error } = await supabaseClient.from('ajustes_inventario')
      .insert({ producto_id: pid, cantidad: cant, motivo: motivo });
    $('ajGuardar').disabled = false;

    if (error) {
      const msg = String(error.message || '');
      mostrarToastInv(/negativo/i.test(msg) ? msg : 'No se pudo registrar el ajuste.', 'error');
      return;
    }
    $('ajusteForm').hidden = true;
    mostrarToastInv('Ajuste registrado.', 'success');
    cargarInventario();
  });

  supabaseClient.auth.onAuthStateChange(function(evento){
    if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN') cargarInventario();
  });

})();
