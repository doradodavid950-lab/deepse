/* ==========================================================
   Lógica del módulo: ventas.html
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
  const TIPOS   = ['Local', 'Distribución'];
  const CANALES = ['Presencial', 'Distribuidor', 'Venta directa'];
  const CANTIDAD_MAX = 999999;

  const CAMPOS = ['producto','lote','cantidad','cliente','tipoVenta','canalVenta','destino','fecha','observaciones'];

  // ---------------------------------------------------------------
  // ESTADO DE LA PÁGINA
  // ---------------------------------------------------------------
  let usuarioActual = null;
  let datos = { productos: [], ventas: [], recepciones: [], proveedores: [] };
  let clientesVenta = [];
  let datosListos = false;
  let errorCarga = false;
  let cargando = false;
  let ultimaActualizacion = 0;
  let notifsActuales = [];
  let firmaPintada = '';
  let editandoId = null;
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
  //   entero       → solo dígitos (cantidades)
  //   numero       → número con negativo y 1 decimal
  //   letras       → solo letras y espacios
  //   nombre       → letras, espacios, punto, guion, & y apóstrofo
  //   alfanumerico → letras, números, espacios, guion, punto y #
  //   direccion    → letras, números, espacios, coma, punto, guion y #
  //   busqueda     → letras, números, espacios y guion
  //   texto        → texto normal con puntuación básica (sin símbolos raros)
  // ---------------------------------------------------------------
  const L = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
  const FILTROS = {
    entero: v => v.replace(/\D/g, '').replace(/^0+(?=\d)/, ''),
    numero: v => {
      let s = v.replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
      const negativo = s.charAt(0) === '-';
      s = s.replace(/-/g, '');
      const i = s.indexOf('.');
      if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, 1);
      return (negativo ? '-' : '') + s;
    },
    letras:       v => v.replace(new RegExp('[^' + L + '\\s]', 'g'), '').replace(/\s{2,}/g, ' '),
    nombre:       v => v.replace(new RegExp("[^" + L + "\\s.\\-&']", 'g'), '').replace(/\s{2,}/g, ' '),
    alfanumerico: v => v.replace(new RegExp('[^' + L + '0-9\\s.\\-#]', 'g'), '').replace(/\s{2,}/g, ' '),
    direccion:    v => v.replace(new RegExp('[^' + L + '0-9\\s.,\\-#]', 'g'), '').replace(/\s{2,}/g, ' '),
    busqueda:     v => v.replace(new RegExp('[^' + L + '0-9\\s\\-]', 'g'), '').replace(/\s{2,}/g, ' '),
    texto:        v => v.replace(new RegExp('[^' + L + '0-9\\s.,;:()%°¿?¡!/\\-]', 'g'), '').replace(/[ \t]{2,}/g, ' ')
  };

  FILTROS.razon     = v => v.replace(new RegExp("[^" + L + "0-9\\s.,\\-&']", 'g'), '').replace(/\s{2,}/g, ' ');
  FILTROS.telefono  = v => v.replace(/[^0-9+\s\-()]/g, '').replace(/\s{2,}/g, ' ');
  FILTROS.documento = v => v.replace(/[^A-Za-z0-9\-]/g, '');
  FILTROS.correo    = v => v.replace(/\s/g, '');

  function aplicarFiltro(campo){
    const filtro = FILTROS[campo.dataset.filtro];
    if (!filtro) return;
    const antes = campo.value;
    let despues = filtro(antes);
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
  const RE_CLIENTE = new RegExp("^[" + L + "0-9][" + L + "0-9 .,\\-&']*$");
  const RE_DESTINO = new RegExp('^[' + L + '0-9][' + L + '0-9 .,\\-#]*$');

  function marcarError(idCampo, mensaje){
    const campo = $(idCampo);
    const grupo = campo.closest('.form-group');
    const caja  = grupo.querySelector('.field-error');
    grupo.classList.remove('invalid');
    if (mensaje) { void grupo.offsetWidth; grupo.classList.add('invalid'); }
    caja.textContent = mensaje || '';
    campo.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
  }

  function limpiarErrores(){ CAMPOS.forEach(id => marcarError(id, '')); }

  function validarFormulario(){
    const errores = {};

    const productoId = $('producto').value;
    if (!productoId) errores.producto = 'Selecciona un producto.';
    else if (!datos.productos.some(p => String(p.id) === productoId)) errores.producto = 'El producto seleccionado ya no existe.';

    const cantTexto = $('cantidad').value.trim();
    if (!cantTexto) errores.cantidad = 'La cantidad es obligatoria.';
    else if (!/^\d+$/.test(cantTexto)) errores.cantidad = 'Escribe solo números enteros.';
    else if (Number(cantTexto) < 1) errores.cantidad = 'La cantidad debe ser mayor que 0.';
    else if (Number(cantTexto) > CANTIDAD_MAX) errores.cantidad = `La cantidad máxima es ${CANTIDAD_MAX.toLocaleString('es-CO')}.`;

    const cliente = $('cliente').value.trim();
    const clienteId = $('clienteSelect').value || null;
    if (!cliente) errores.cliente = 'El nombre del cliente es obligatorio.';
    else if (cliente.length < 2) errores.cliente = 'Escribe al menos 2 caracteres.';
    else if (!RE_CLIENTE.test(cliente)) errores.cliente = 'Solo letras, números, espacios, punto, coma, guion y &.';

    const tipo = $('tipoVenta').value;
    if (!tipo) errores.tipoVenta = 'Selecciona el tipo de venta.';
    else if (!TIPOS.includes(tipo)) errores.tipoVenta = 'Tipo no válido.';

    const canal = $('canalVenta').value;
    if (!canal) errores.canalVenta = 'Selecciona el canal de venta.';
    else if (!CANALES.includes(canal)) errores.canalVenta = 'Canal no válido.';

    const destino = $('destino').value.trim();
    if (destino) {
      if (destino.length < 2) errores.destino = 'Escribe al menos 2 caracteres.';
      else if (!RE_DESTINO.test(destino)) errores.destino = 'Solo letras, números, espacios, coma, punto, guion y #.';
    }

    const fechaTexto = $('fecha').value;
    if (!fechaTexto) errores.fecha = 'Selecciona la fecha de la venta.';
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
      // Se enfoca el primero según el orden del formulario
      const primero = CAMPOS.find(id => errores[id]);
      $(primero).focus();
      return null;
    }

    const loteId = $('lote').value || null;
    const lotesProducto = (datos.recepciones || []).filter(r => String(r.producto_id) === String(productoId) && !['rechazado','en revision'].includes(normalizar(r.estado_producto)));
    if (lotesProducto.length && !loteId && editandoId === null) errores.lote = 'Selecciona el lote del que sale el producto.';
    const opcionLote = $('lote').selectedOptions[0];
    if (loteId && !lotesProducto.some(r => String(r.id) === String(loteId)) && !(editandoId !== null && opcionLote && opcionLote.dataset.historico === 'true')) errores.lote = 'El lote no corresponde al producto seleccionado o no está disponible.';
    if (loteId) {
      const loteSeleccionado = (datos.recepciones || []).find(r => String(r.id) === String(loteId));
      if (loteSeleccionado) {
        const vendidoLote = (datos.ventas || []).reduce((s, v) =>
          s + (String(v.recepcion_id || '') === String(loteId) && String(v.id) !== String(editandoId) ? Number(v.cantidad) || 0 : 0), 0);
        const disponibleLote = Math.max((Number(loteSeleccionado.peso) || 0) - vendidoLote, 0);
        if (Number(cantTexto) > disponibleLote) errores.cantidad = 'El lote seleccionado solo tiene ' + fmtPeso(disponibleLote) + ' disponibles.';
      }
    }
    if (Object.keys(errores).length) {
      limpiarErrores();
      Object.keys(errores).forEach(id => marcarError(id, errores[id]));
      const primero = CAMPOS.find(id => errores[id]);
      if (primero) $(primero).focus();
      return null;
    }

    return {
      producto_id: productoId,
      recepcion_id: loteId,
      cantidad: Number(cantTexto),
      fecha_venta: new Date(fechaTexto).toISOString(),
      cliente: cliente,
      cliente_id: clienteId,
      tipo_venta: tipo,
      canal_venta: canal,
      destino: destino || null,
      observaciones: obs || null
    };
  }

  // Quita el error de un campo en cuanto el usuario lo corrige
  CAMPOS.forEach(id => {
    const el = $(id);
    const evento = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evento, () => marcarError(id, ''));
  });
  $('observaciones').addEventListener('input', () => { $('obsCount').textContent = $('observaciones').value.length; });

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
  const claveCache = () => 'dsi_ven_' + usuarioActual.id;

  function leerCache(){
    try {
      const c = JSON.parse(localStorage.getItem(claveCache()) || 'null');
      if (c && Array.isArray(c.productos) && Array.isArray(c.ventas) && Array.isArray(c.recepciones)) return c;
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
      const [prod, ven, rec, prov] = await Promise.race([Promise.all([
        supabaseClient.from('productos').select('id,nombre,estado').order('nombre', { ascending: true }),
        supabaseClient
          .from('ventas')
          .select('id,producto_id,recepcion_id,cantidad,fecha_venta,cliente,cliente_id,tipo_venta,canal_venta,destino,observaciones,productos(nombre)')
          .order('fecha_venta', { ascending: false, nullsFirst: false }),
        // Solo para las notificaciones
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

      if (ven.error) { hayError = true; console.error('Error ventas:', ven.error); }
      else datos.ventas = ven.data || [];

      if (rec.error) { console.error('Error recepciones (notificaciones):', rec.error); }
      else datos.recepciones = rec.data || [];

      if (!prov.error) datos.proveedores = prov.data || [];
    } catch (err) {
      hayError = true;
      console.error('Error cargando ventas:', err);
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

  async function refrescar(){
    let intentos = 0;
    while (cargando && intentos++ < 40) await new Promise(r => setTimeout(r, 100));
    await actualizarDatos();
  }

  // ---------------------------------------------------------------
  // PINTAR
  // ---------------------------------------------------------------
  function pintar(){
    if (!datosListos) return;

    const firma = JSON.stringify(datos) + '|' + errorCarga;
    if (firma === firmaPintada) return;
    firmaPintada = firma;

    const v = datos.ventas;
    animarNumero($('totalCount'), v.length, fmtNumero);
    animarNumero($('localCount'), v.filter(x => normalizar(x.tipo_venta) === 'local').length, fmtNumero);
    animarNumero($('distributionCount'), v.filter(x => normalizar(x.tipo_venta) === 'distribucion').length, fmtNumero);
    animarNumero($('qtyCount'), v.reduce((t, x) => t + (Number(x.cantidad) || 0), 0), fmtNumero);

    pintarTabla(true);
    if (vistaClientes) pintarClientesVentas();
    renderNotificaciones();
  }

  function nombreProducto(item){
    const p = Array.isArray(item.productos) ? item.productos[0] : item.productos;
    return p?.nombre || 'Sin producto';
  }

  function pintarTabla(animar){
    const tabla = $('salesTable');
    const q = normalizar($('searchInput').value);

    const lista = datos.ventas.filter(it => {
      if (!q) return true;
      return normalizar([nombreProducto(it), it.cliente, it.tipo_venta, it.canal_venta, it.destino].join(' ')).includes(q);
    });

    if (!lista.length) {
      let msg = 'No hay registros de ventas.';
      if (errorCarga && !datos.ventas.length) msg = 'No se pudo cargar la información.';
      else if (q) msg = 'No se encontraron resultados para la búsqueda.';
      tabla.innerHTML = `<tr class="vacio"><td colspan="8" class="empty">${msg}</td></tr>`;
      return;
    }

    tabla.innerHTML = lista.map((it, i) => {
      const tipoClase = normalizar(it.tipo_venta) === 'local' ? 'local' : 'distribucion';
      const hora = formatearHora(it.fecha_venta);
      const fecha = formatearFecha(it.fecha_venta);
      const anim = animar && !reducirMovimiento ? ` class="row-in" style="animation-delay:${Math.min(i, 10) * 30}ms"` : '';
      const id = escapeHTML(it.id);
      const nombre = escapeHTML(nombreProducto(it));
      const cantidad = fmtNumero(Number(it.cantidad) || 0);

      return `<tr${anim} data-id="${id}">
        <td><div class="nom"><span class="chip"><svg class="i" aria-hidden="true"><use href="#i-cart"/></svg></span><strong>${nombre}</strong></div></td>
        <td>${cantidad}</td>
        <td>${escapeHTML(it.cliente || '-')}</td>
        <td><span class="pill ${tipoClase}">${escapeHTML(it.tipo_venta || '-')}</span></td>
        <td>${escapeHTML(it.canal_venta || '-')}</td>
        <td class="td-fecha">${fecha}${hora ? `<small>${hora}</small>` : ''}</td>
        <td><div class="row-actions">
          <button class="action-btn" type="button" data-accion="editar" data-id="${id}" title="Editar" aria-label="Editar venta de ${nombre}"><svg class="i" aria-hidden="true"><use href="#i-edit"/></svg></button>
          <button class="action-btn danger" type="button" data-accion="eliminar" data-id="${id}" title="Eliminar" aria-label="Eliminar venta de ${nombre}"><svg class="i" aria-hidden="true"><use href="#i-trash"/></svg></button>
        </div></td>
        <td class="c-meta"><span>Cant. <b>${cantidad}</b></span><span>${escapeHTML(it.canal_venta || '-')}</span><span>${fecha}${hora ? ' · ' + hora : ''}</span></td>
      </tr>`;
    }).join('');
  }

  let temporizadorBusqueda;
  $('searchInput').addEventListener('input', function(){
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => pintarTabla(false), 120);
  });

  // Botones Editar / Eliminar (delegación de eventos)
  $('salesTable').addEventListener('click', function(e){
    const btn = e.target.closest('button[data-accion]');
    if (!btn) return;
    const item = datos.ventas.find(v => String(v.id) === btn.dataset.id);
    if (!item) return;
    if (btn.dataset.accion === 'editar') abrirModal(item);
    else eliminar(item, btn.closest('tr'));
  });

  // ---------------------------------------------------------------
  // BLOQUEO DE SCROLL (modales y menú móvil)
  // ---------------------------------------------------------------
  function actualizarScroll(){
    const abierto = $('saleModal').classList.contains('show')
      || $('confirmModal').classList.contains('show')
      || $('clienteVentaModal').classList.contains('show')
      || $('fan').classList.contains('open');
    document.body.style.overflow = abierto ? 'hidden' : '';
  }

  // ---------------------------------------------------------------
  // MODAL DE FORMULARIO
  // ---------------------------------------------------------------
  const modal = $('saleModal');

  function llenarProductos(item){
    const select = $('producto');
    if (!datos.productos.length) {
      select.innerHTML = '<option value="">No hay productos registrados</option>';
      return;
    }
    select.innerHTML = '<option value="">Seleccionar producto</option>' + datos.productos.map(p => {
      const inactivo = normalizar(p.estado) === 'inactivo';
      const actual = item && String(item.producto_id) === String(p.id);
      // Un producto inactivo no se puede vender en registros nuevos
      const bloqueado = inactivo && !actual;
      return `<option value="${escapeHTML(p.id)}"${bloqueado ? ' disabled' : ''}>${escapeHTML(p.nombre)}${inactivo ? ' (inactivo)' : ''}</option>`;
    }).join('');
  }

  function llenarLotes(productoId, item){
    const select = $('lote');
    const actual = item && item.recepcion_id ? String(item.recepcion_id) : '';
    const lotes = (datos.recepciones || []).filter(r => String(r.producto_id) === String(productoId) && !['rechazado','en revision'].includes(normalizar(r.estado_producto)));
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

  $('producto').addEventListener('change', function(){
    llenarLotes($('producto').value, null);
    cargarDisponible();
  });

  function abrirModal(item){
    editandoId = item ? item.id : null;
    $('saleForm').reset();
    limpiarErrores();
    destinoAuto = false; $('destinoHint').textContent = DESTINO_HINT;
    llenarProductos(item);

    const ahora = new Date();
    $('fecha').max = aInputFecha(ahora);
    $('fecha').min = '2000-01-01T00:00';

    if (item) {
      $('producto').value      = item.producto_id ?? '';
      llenarLotes(item.producto_id, item);
      $('lote').value          = item.recepcion_id || '';
      $('cantidad').value      = item.cantidad ?? '';
      $('cliente').value       = item.cliente || '';
      $('clienteSelect').value = item.cliente_id || '';
      actualizarDetalleCliente();
      $('tipoVenta').value     = TIPOS.includes(item.tipo_venta) ? item.tipo_venta : '';
      $('canalVenta').value    = CANALES.includes(item.canal_venta) ? item.canal_venta : '';
      $('destino').value       = item.destino || '';
      $('observaciones').value = item.observaciones || '';
      const f = parsearFecha(item.fecha_venta);
      $('fecha').value = f ? aInputFecha(f) : aInputFecha(ahora);
      $('modalTitle').textContent = 'Editar venta';
      $('saveBtn').textContent = 'Actualizar venta';
    } else {
      $('cliente').value = '';
      $('clienteSelect').value = '';
      actualizarDetalleCliente();
      llenarLotes($('producto').value, null);
      const lotesDisponibles = (datos.recepciones || []).filter(r => String(r.producto_id) === String($('producto').value) && !['rechazado','en revision'].includes(normalizar(r.estado_producto)));
      if (lotesDisponibles.length) $('lote').value = String(lotesDisponibles[0].id);
      $('fecha').value = aInputFecha(ahora);
      const pc = prefsConfig();
      if (TIPOS.includes(pc.ventaTipo)) $('tipoVenta').value = pc.ventaTipo;
      if (CANALES.includes(pc.ventaCanal)) $('canalVenta').value = pc.ventaCanal;
      $('modalTitle').textContent = 'Nueva venta';
      $('saveBtn').textContent = 'Guardar venta';
    }

    $('obsCount').textContent = $('observaciones').value.length;
    modal.classList.add('show');
    actualizarScroll();
    setTimeout(() => $('producto').focus(), 60);
  }

  function cerrarModal(){
    modal.classList.remove('show');
    actualizarScroll();
  }

  const accionNuevo = () => (vistaClientes ? abrirClienteModal('lista') : abrirModal(null));
  $('newSaleBtn').addEventListener('click', accionNuevo);
  $('newSaleFab').addEventListener('click', accionNuevo);
  $('closeModal').addEventListener('click', cerrarModal);
  $('cancelBtn').addEventListener('click', cerrarModal);
  modal.addEventListener('mousedown', e => { if (e.target === modal) cerrarModal(); });

  // ---------------------------------------------------------------
  // GUARDAR
  // ---------------------------------------------------------------
  $('saleForm').addEventListener('submit', async function(e){
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
      resultado = editandoId !== null
        ? await supabaseClient.from('ventas').update(payload).eq('id', editandoId)
        : await supabaseClient.from('ventas').insert([payload]);
    } catch (err) {
      resultado = { error: err };
    }

    guardando = false;
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = textoOriginal;

    if (resultado.error) {
      // El detalle completo queda en la consola (F12) para depurar
      console.error('Error al guardar la venta:', {
        mensaje: resultado.error.message,
        codigo: resultado.error.code,
        detalles: resultado.error.details,
        sugerencia: resultado.error.hint,
        datos: payload
      });
      const msgDb = String(resultado.error.message || '');
      // Mensajes de negocio de la base de datos (sin stock, cantidad inválida, etc.)
      if (/Stock insuficiente|cantidad vendida|Cantidad/i.test(msgDb)) {
        mostrarToast(msgDb.replace(/^.*?(Stock insuficiente|La cantidad)/, '$1'), 'error');
      } else {
        mostrarToast('No se pudo guardar la venta', 'error');
      }
      return;
    }

    const eraEdicion = editandoId !== null;
    cerrarModal();
    mostrarToast(eraEdicion ? 'Venta actualizada correctamente' : 'Venta registrada correctamente', 'success');
    await refrescar();
  });


  // ---------------------------------------------------------------
  // CLIENTES: lista, resumen, alta rápida desde ventas, edición y eliminación
  // ---------------------------------------------------------------
  const CLIENTE_COLS = 'id,nombre,tipo,documento_tipo,documento_numero,telefono,correo,direccion';
  const DESTINO_HINT = 'Letras, números, espacios, coma, punto, guion y #.';
  const TIPOS_CLIENTE = ['Restaurante', 'Hotel', 'Supermercado', 'Distribuidor', 'Persona natural'];
  let vistaClientes = false;       // true cuando se está viendo la pestaña Clientes
  let clientesCargados = false;
  let clientesError = false;
  let usarFechaAlta = true;        // se intenta leer created_at; si la tabla no lo tiene, se omite
  let clienteModo = 'venta';       // 'venta' | 'lista' | 'editar'
  let clienteEditandoId = null;
  let guardandoCliente = false;
  let destinoAuto = false;         // true si el destino se llenó solo con la dirección del cliente

  // Opciones guardadas en Configuración (este dispositivo)
  function prefsConfig(){
    try { return JSON.parse(localStorage.getItem('dsi_prefs_v1') || '{}') || {}; }
    catch (e) { return {}; }
  }

  function claseTipoCliente(t){
    const n = normalizar(t);
    if (n === 'hotel') return 't-hotel';
    if (n === 'supermercado') return 't-super';
    if (n === 'otro') return 't-otro';
    return 't-ok';
  }
  function ciudadDe(dir){
    if (!dir) return '';
    const partes = String(dir).split(',');
    return partes[partes.length - 1].trim();
  }

  async function cargarClientesVenta(){
    let r = null;
    if (usarFechaAlta) {
      r = await supabaseClient.from('clientes').select(CLIENTE_COLS + ',created_at').order('nombre');
      if (r.error) { usarFechaAlta = false; r = null; }
    }
    if (!r) r = await supabaseClient.from('clientes').select(CLIENTE_COLS).order('nombre');
    if (r.error) {
      console.error('No se pudieron cargar los clientes:', r.error);
      clientesError = true;
      if (vistaClientes) pintarClientesVentas();
      return false;
    }
    clientesError = false;
    clientesCargados = true;
    clientesVenta = r.data || [];
    llenarSelectClientes();
    actualizarDetalleCliente();
    return true;
  }

  function llenarSelectClientes(){
    const select = $('clienteSelect'), actual = select.value;
    select.innerHTML = '<option value="">Seleccionar cliente registrado...</option>' +
      clientesVenta.map(c => '<option value="' + escapeHTML(c.id) + '">' + escapeHTML(c.nombre) + ' · ' + escapeHTML(c.tipo) + '</option>').join('');
    if (actual && clientesVenta.some(c => String(c.id) === actual)) select.value = actual;
  }

  // Tarjeta con los datos del cliente elegido (y el enlace para registrar uno nuevo)
  function actualizarDetalleCliente(){
    const c = clientesVenta.find(x => String(x.id) === $('clienteSelect').value);
    let html = '';
    if (c) {
      const ciu = ciudadDe(c.direccion);
      html += '<span class="pill ' + claseTipoCliente(c.tipo) + '">' + escapeHTML(c.tipo) + '</span>' +
              '<div class="cv-linea">Tel. ' + escapeHTML(c.telefono || '—') + (ciu ? ' · ' + escapeHTML(ciu) : '') + '</div>';
      $('cliente').value = c.nombre;
      if (prefsConfig().ventaDestinoAuto !== false && c.direccion && (!$('destino').value || destinoAuto)) {
        $('destino').value = c.direccion;
        destinoAuto = true;
        $('destinoHint').textContent = 'Se llenó con la dirección del cliente. Puedes cambiarla.';
      }
    }
    html += '<button type="button" class="cv-link">+ Registrar cliente nuevo</button>';
    $('clienteVentaDetalle').innerHTML = html;
  }
  $('clienteSelect').addEventListener('change', function(){
    if (!this.value) $('cliente').value = '';
    actualizarDetalleCliente();
    marcarError('cliente', '');
  });
  $('clienteVentaDetalle').addEventListener('click', e => {
    if (e.target.closest('.cv-link')) abrirClienteModal('venta');
  });
  $('destino').addEventListener('input', () => {
    if (destinoAuto) { destinoAuto = false; $('destinoHint').textContent = DESTINO_HINT; }
  });

  // ---------- Resumen y tabla ----------
  function estadisticasClientes(){
    const porId = new Map(), porNombre = new Map();
    clientesVenta.forEach(c => {
      const st = { c: c, n: 0, kg: 0, ultima: null, ultimaRaw: null };
      porId.set(String(c.id), st);
      porNombre.set(normalizar(c.nombre), st);
    });
    const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);
    let kgMes = 0;
    datos.ventas.forEach(v => {
      const st = v.cliente_id ? porId.get(String(v.cliente_id)) : porNombre.get(normalizar(v.cliente));
      if (!st) return;
      const kg = Number(v.cantidad) || 0;
      const f = parsearFecha(v.fecha_venta);
      st.n++; st.kg += kg;
      if (f) {
        if (!st.ultima || f > st.ultima) { st.ultima = f; st.ultimaRaw = v.fecha_venta; }
        if (f >= ini) kgMes += kg;
      }
    });
    let nuevos = null;
    if (usarFechaAlta) {
      nuevos = clientesVenta.filter(c => { const f = parsearFecha(c.created_at); return f && f >= ini; }).length;
    }
    return { lista: Array.from(porId.values()), kgMes: kgMes, nuevos: nuevos };
  }

  function pintarClientesVentas(){
    const tbody = $('clientesVentasTabla');
    if (!clientesCargados) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">' + (clientesError ? 'No se pudieron cargar los clientes.' : 'Cargando clientes...') + '</td></tr>';
      return;
    }
    const st = estadisticasClientes();
    $('kcActivos').textContent = fmtNumero(clientesVenta.length);
    $('kcNuevos').textContent = st.nuevos === null ? '—' : fmtNumero(st.nuevos);
    $('kcComprado').textContent = fmtPeso(st.kgMes);
    const top = st.lista.filter(x => x.kg > 0).sort((a, b) => b.kg - a.kg)[0];
    $('kcTop').textContent = top ? top.c.nombre : '—';

    const q = normalizar($('buscarClientesVentas').value);
    const filas = st.lista.filter(x => !q || normalizar([x.c.nombre, x.c.tipo, x.c.telefono, x.c.correo, x.c.documento_numero, x.c.direccion].join(' ')).includes(q));
    if (!filas.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">' + (q ? 'No hay clientes que coincidan con la búsqueda.' : 'Aún no tienes clientes. Usa “Nuevo cliente” para registrar el primero.') + '</td></tr>';
      return;
    }
    tbody.innerHTML = filas.map(x => {
      const c = x.c, id = escapeHTML(c.id), nombre = escapeHTML(c.nombre);
      return '<tr data-id="' + id + '">' +
        '<td data-label="Cliente"><div class="nom"><span class="chip"><svg class="i" aria-hidden="true"><use href="#i-users"/></svg></span><strong>' + nombre + '</strong></div></td>' +
        '<td data-label="Tipo"><span class="pill ' + claseTipoCliente(c.tipo) + '">' + escapeHTML(c.tipo) + '</span></td>' +
        '<td data-label="Contacto" class="cli-contacto"><div class="cli-cont"><span class="cli-tel">' + escapeHTML(c.telefono || '—') + '</span><small>' + escapeHTML(c.correo || '—') + '</small></div></td>' +
        '<td data-label="Ventas">' + fmtNumero(x.n) + '</td>' +
        '<td data-label="Total comprado" class="cli-total">' + fmtPeso(x.kg) + '</td>' +
        '<td data-label="Última compra">' + (x.ultimaRaw ? formatearFecha(x.ultimaRaw) : '—') + '</td>' +
        '<td data-label="Acciones"><div class="row-actions">' +
          '<button class="action-btn" type="button" data-editar-cliente="' + id + '" title="Editar" aria-label="Editar cliente ' + nombre + '"><svg class="i" aria-hidden="true"><use href="#i-edit"/></svg></button>' +
          '<button class="action-btn danger" type="button" data-borrar-cliente="' + id + '" title="Eliminar" aria-label="Eliminar cliente ' + nombre + '"><svg class="i" aria-hidden="true"><use href="#i-trash"/></svg></button>' +
        '</div></td></tr>';
    }).join('');
  }

  // ---------- Pestañas ----------
  function cambiarPestanaClientes(activa){
    vistaClientes = activa;
    $('ventasResumen').hidden = activa;
    $('ventasRegistros').hidden = activa;
    $('clientesResumen').hidden = !activa;
    $('clientesVentasVista').hidden = !activa;
    $('tabVentas').classList.toggle('active', !activa);
    $('tabClientes').classList.toggle('active', activa);
    $('tabVentas').setAttribute('aria-selected', String(!activa));
    $('tabClientes').setAttribute('aria-selected', String(activa));
    const txt = activa ? 'Nuevo cliente' : 'Nueva venta';
    $('newSaleBtnTxt').textContent = txt;
    $('newSaleFab').setAttribute('aria-label', txt);
    if (activa) {
      pintarClientesVentas();
      cargarClientesVenta().then(ok => { if (ok && vistaClientes) pintarClientesVentas(); });
    }
  }
  $('tabVentas').addEventListener('click', () => cambiarPestanaClientes(false));
  $('tabClientes').addEventListener('click', () => cambiarPestanaClientes(true));
  $('buscarClientesVentas').addEventListener('input', pintarClientesVentas);

  // ---------- Editar y eliminar ----------
  $('clientesVentasTabla').addEventListener('click', e => {
    const be = e.target.closest('[data-editar-cliente]');
    if (be) { const c = clientesVenta.find(x => String(x.id) === be.dataset.editarCliente); if (c) abrirClienteModal('editar', c); return; }
    const bb = e.target.closest('[data-borrar-cliente]');
    if (bb) { const c = clientesVenta.find(x => String(x.id) === bb.dataset.borrarCliente); if (c) eliminarCliente(c); }
  });

  async function eliminarCliente(c){
    $('confirmTitle').textContent = 'Eliminar cliente';
    const ok = await confirmar('¿Deseas eliminar a <strong>' + escapeHTML(c.nombre) + '</strong>? Esta acción no se puede deshacer.');
    $('confirmTitle').textContent = 'Eliminar venta';
    if (!ok) return;
    let error = null;
    try { error = (await supabaseClient.from('clientes').delete().eq('id', c.id)).error; }
    catch (err) { error = err; }
    if (error) {
      console.error('Error al eliminar el cliente:', { mensaje: error.message, codigo: error.code });
      mostrarToast(error.code === '23503' ? 'No se puede eliminar: el cliente tiene ventas registradas.' : 'No se pudo eliminar el cliente.', 'error');
      return;
    }
    clientesVenta = clientesVenta.filter(x => x.id !== c.id);
    llenarSelectClientes(); actualizarDetalleCliente();
    pintarClientesVentas();
    mostrarToast('Cliente eliminado.', 'success');
  }

  // ---------- Ventana "Registrar / Editar cliente" ----------
  const CV_CAMPOS = ['cvNombre', 'cvTipoChips', 'cvDocTipo', 'cvDocNumero', 'cvTelefono', 'cvCorreo', 'cvDireccion', 'cvAutoriza'];
  const CV_TEXTOS = {
    venta:  { titulo: 'Registrar cliente', sub: 'Solo lo necesario. Al guardar, el cliente queda elegido en tu venta.', boton: 'Guardar y usar en la venta' },
    lista:  { titulo: 'Registrar cliente', sub: 'Solo lo necesario. Después podrás elegirlo al registrar una venta.', boton: 'Guardar cliente' },
    editar: { titulo: 'Editar cliente',    sub: 'Actualiza los datos del cliente.', boton: 'Guardar cambios' }
  };

  function abrirClienteModal(modo, c){
    clienteModo = modo;
    clienteEditandoId = c ? c.id : null;
    $('clienteVentaForm').reset();
    CV_CAMPOS.forEach(id => marcarError(id, ''));
    document.querySelectorAll('#cvTipoChips .chip-op.extra').forEach(el => el.remove());
    const t = CV_TEXTOS[modo];
    $('clienteVentaTitulo').textContent = t.titulo;
    $('clienteVentaSub').textContent = t.sub;
    $('guardarClienteVenta').textContent = t.boton;
    $('cvConsentGrupo').hidden = modo === 'editar';
    if (c) {
      $('cvNombre').value = c.nombre || '';
      let radio = document.querySelector('input[name="cvTipo"][value="' + (TIPOS_CLIENTE.includes(c.tipo) ? c.tipo : '__') + '"]');
      if (!radio && c.tipo) {
        // tipo guardado antes que no está en la lista (p. ej. "Otro"): se muestra para no perderlo
        const l = document.createElement('label');
        l.className = 'chip-op extra';
        l.innerHTML = '<input type="radio" name="cvTipo"><span></span>';
        l.querySelector('input').value = c.tipo;
        l.querySelector('span').textContent = c.tipo;
        $('cvTipoChips').appendChild(l);
        radio = l.querySelector('input');
      }
      if (radio) radio.checked = true;
      $('cvDocTipo').value = c.documento_tipo || '';
      $('cvDocNumero').value = c.documento_numero || '';
      $('cvTelefono').value = c.telefono || '';
      $('cvCorreo').value = c.correo || '';
      $('cvDireccion').value = c.direccion || '';
    }
    $('clienteVentaModal').classList.add('show');
    actualizarScroll();
    setTimeout(() => $('cvNombre').focus(), 60);
  }
  function cerrarClienteVenta(){
    $('clienteVentaModal').classList.remove('show');
    actualizarScroll();
  }
  $('cerrarClienteVenta').addEventListener('click', cerrarClienteVenta);
  $('cancelarClienteVenta').addEventListener('click', cerrarClienteVenta);
  $('clienteVentaModal').addEventListener('mousedown', e => { if (e.target === $('clienteVentaModal')) cerrarClienteVenta(); });
  $('cvTipoChips').addEventListener('change', () => marcarError('cvTipoChips', ''));
  ['cvNombre', 'cvDocTipo', 'cvDocNumero', 'cvTelefono', 'cvCorreo', 'cvDireccion'].forEach(id => {
    $(id).addEventListener('input', () => { if ($(id).closest('.form-group').classList.contains('invalid')) marcarError(id, ''); });
  });
  $('cvAutoriza').addEventListener('change', () => marcarError('cvAutoriza', ''));

  function validarCliente(){
    let ok = true;
    const err = (id, msg) => { marcarError(id, msg); if (msg) ok = false; };
    const nombre = $('cvNombre').value.trim().replace(/\s{2,}/g, ' ');
    const repetido = clientesVenta.some(x => String(x.id) !== String(clienteEditandoId) && normalizar(x.nombre) === normalizar(nombre));
    err('cvNombre',
      nombre.length < 2 ? 'Escribe el nombre o razón social (mínimo 2 caracteres).' :
      !/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]/.test(nombre) ? 'El nombre debe tener letras o números.' :
      repetido ? 'Ya tienes un cliente con ese nombre.' : '');
    err('cvTipoChips', document.querySelector('input[name="cvTipo"]:checked') ? '' : 'Elige el tipo de cliente.');
    const dt = $('cvDocTipo').value, dn = $('cvDocNumero').value.trim();
    err('cvDocTipo', dn && !dt ? 'Elige el tipo de documento.' : '');
    err('cvDocNumero', dt && !dn ? 'Escribe el número del documento.' : (dn && dn.replace(/[^A-Za-z0-9]/g, '').length < 5 ? 'El número es muy corto.' : ''));
    const tel = $('cvTelefono').value.trim(), dig = tel.replace(/\D/g, '').length;
    err('cvTelefono', !tel ? 'Escribe el teléfono.' : (dig < 7 || dig > 15 ? 'Revisa el teléfono (de 7 a 15 dígitos).' : ''));
    const correo = $('cvCorreo').value.trim();
    err('cvCorreo', correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo) ? 'Escribe un correo válido.' : '');
    err('cvAutoriza', clienteModo !== 'editar' && !$('cvAutoriza').checked ? 'Confirma la autorización para guardar al cliente.' : '');
    return ok;
  }

  $('clienteVentaForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (guardandoCliente) return;
    if (!validarCliente()) { mostrarToast('Revisa los campos marcados en rojo', 'error'); return; }

    const payload = {
      nombre: $('cvNombre').value.trim().replace(/\s{2,}/g, ' '),
      tipo: document.querySelector('input[name="cvTipo"]:checked').value,
      documento_tipo: $('cvDocTipo').value || null,
      documento_numero: $('cvDocNumero').value.trim() || null,
      telefono: $('cvTelefono').value.trim().replace(/\s{2,}/g, ' '),
      correo: $('cvCorreo').value.trim() || null,
      direccion: $('cvDireccion').value.trim() || null
    };
    if (clienteModo !== 'editar') payload.acepta_datos = $('cvAutoriza').checked;   // constancia de la autorización (Ley 1581)
    const btn = $('guardarClienteVenta');
    guardandoCliente = true;
    btn.disabled = true; btn.classList.add('loading'); btn.textContent = 'Guardando...';

    try {
      const editando = clienteModo === 'editar';
      const previo = editando ? clientesVenta.find(x => String(x.id) === String(clienteEditandoId)) : null;
      const q = editando
        ? supabaseClient.from('clientes').update(payload).eq('id', clienteEditandoId)
        : supabaseClient.from('clientes').insert(payload);
      const { data, error } = await q.select(CLIENTE_COLS).single();
      if (error) {
        console.error('Error al guardar el cliente:', { mensaje: error.message, codigo: error.code });
        mostrarToast(error.code === '23505' || /clientes_documento_por_usuario_uidx/i.test(error.message || '')
          ? 'Ya existe un cliente con ese documento.'
          : (editando ? 'No se pudieron guardar los cambios.' : 'No se pudo registrar el cliente.'), 'error');
        return;
      }

      if (editando) {
        clientesVenta = clientesVenta.map(x => String(x.id) === String(data.id) ? Object.assign({}, x, data) : x);
        // Si cambió el nombre, las ventas de este cliente se muestran con el nombre nuevo
        if (previo && previo.nombre !== data.nombre) {
          const r = await supabaseClient.from('ventas').update({ cliente: data.nombre }).eq('cliente_id', data.id);
          if (!r.error) datos.ventas.forEach(v => { if (String(v.cliente_id) === String(data.id)) v.cliente = data.nombre; });
        }
      } else {
        clientesVenta.push(data);
      }
      clientesVenta.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      llenarSelectClientes();
      if (clienteModo === 'venta') {
        $('clienteSelect').value = data.id;
        $('cliente').value = data.nombre;
        marcarError('cliente', '');
      }
      actualizarDetalleCliente();
      if (vistaClientes) pintarClientesVentas();
      if (editando) pintarTabla(false);
      cerrarClienteVenta();
      mostrarToast(editando ? 'Cliente actualizado.' : (clienteModo === 'venta' ? 'Cliente registrado y seleccionado.' : 'Cliente registrado.'), 'success');
    } catch (err) {
      console.error('Error inesperado al guardar el cliente:', err);
      mostrarToast('No se pudo guardar el cliente. Revisa tu conexión.', 'error');
    } finally {
      guardandoCliente = false;
      btn.disabled = false; btn.classList.remove('loading');
      btn.textContent = CV_TEXTOS[clienteModo].boton;
    }
  });

  cargarClientesVenta();


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
    const ok = await confirmar(`¿Deseas eliminar la venta de <strong>${escapeHTML(nombreProducto(item))}</strong> a <strong>${escapeHTML(item.cliente || 'cliente sin nombre')}</strong>? Esta acción no se puede deshacer.`);
    if (!ok) return;

    let error = null;
    try {
      const res = await supabaseClient.from('ventas').delete().eq('id', item.id);
      error = res.error;
    } catch (err) { error = err; }

    if (error) {
      console.error('Error al eliminar la venta:', { mensaje: error.message, codigo: error.code });
      mostrarToast('No se pudo eliminar la venta', 'error');
      return;
    }

    if (fila && !reducirMovimiento) {
      fila.classList.add('removing');
      await new Promise(r => setTimeout(r, 230));
    }
    mostrarToast('Venta eliminada correctamente', 'success');
    await refrescar();
  }

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
  // DISPONIBLE AL VENDER: se muestra al elegir el producto
  // ---------------------------------------------------------------
  let dispActual = null;
  const fmtKgDisp = function(n){ return (Math.round(Number(n || 0) * 100) / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' kg'; };

  function revisarCantidadDisp(){
    const hint = $('dispHint');
    if (dispActual === null) { hint.textContent = ''; hint.style.color = ''; return; }
    const cant = Number($('cantidad').value);
    const editando = typeof editandoId !== 'undefined' && editandoId !== null;
    if (!editando && cant > 0 && cant > dispActual) {
      hint.style.color = '#C2302B';
      hint.textContent = 'Stock insuficiente: disponible ' + fmtKgDisp(dispActual);
    } else {
      hint.style.color = '#12804F';
      hint.textContent = 'Disponible: ' + fmtKgDisp(dispActual) + (editando ? ' (sin contar esta venta)' : '');
    }
  }

  async function cargarDisponible(){
    const pid = $('producto').value;
    dispActual = null;
    if (!pid || !supabaseClient) { revisarCantidadDisp(); return; }
    try {
      const { data, error } = await supabaseClient.from('inventario_productos')
        .select('disponible').eq('producto_id', pid).maybeSingle();
      if (!error && data) dispActual = Number(data.disponible);
    } catch (e) { /* sin inventario: no se muestra */ }
    revisarCantidadDisp();
  }

  $('cantidad').addEventListener('input', revisarCantidadDisp);

})();
