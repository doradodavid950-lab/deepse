/* ==========================================================
   Lógica del módulo: normas.html
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

  // ---------------------------------------------------------------
  // CONFIGURACIÓN (cámbiala aquí si tus reglas son otras)
  // ---------------------------------------------------------------
  const RESULTADOS = ['Pendiente', 'Aprobado', 'Rechazado'];
  const OBS_OBLIGATORIA_SI_RECHAZADO = true;   // un control rechazado debe explicar el motivo
  const POR_PAGINA = 20;
  const CAMPOS = ['producto', 'lote', 'color', 'olor', 'textura', 'resultado', 'observaciones'];

  // ---------------------------------------------------------------
  // ESTADO
  // ---------------------------------------------------------------
  let usuarioActual = null;
  let datos = { productos: [], controles: [], recepciones: [] };
  let mapaProd = new Map();
  let datosListos = false;
  let errorCarga = false;
  let cargando = false;
  let ultimaActualizacion = 0;
  let notifsActuales = [];
  let firmaPintada = '';
  let visibles = POR_PAGINA;
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
  //   letras   → solo letras y espacios (color, olor, textura)
  //   entero   → solo dígitos
  //   numero   → número con negativo y 1 decimal
  //   busqueda → letras, números, espacios y guion
  //   texto    → texto normal con puntuación básica (sin símbolos raros)
  // ---------------------------------------------------------------
  const L = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
  const FILTROS = {
    letras:   v => v.replace(new RegExp('[^' + L + '\\s]', 'g'), '').replace(/\s{2,}/g, ' '),
    entero:   v => v.replace(/\D/g, '').replace(/^0+(?=\d)/, ''),
    numero:   v => {
      let s = v.replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
      const negativo = s.charAt(0) === '-';
      s = s.replace(/-/g, '');
      const i = s.indexOf('.');
      if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, 1);
      return (negativo ? '-' : '') + s;
    },
    busqueda: v => v.replace(new RegExp('[^' + L + '0-9\\s\\-]', 'g'), '').replace(/\s{2,}/g, ' '),
    texto:    v => v.replace(new RegExp('[^' + L + '0-9\\s.,;:()%°¿?¡!/\\-]', 'g'), '').replace(/[ \t]{2,}/g, ' ')
  };

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
  const RE_PALABRAS = new RegExp('^[' + L + ']+(\\s[' + L + ']+)*$');

  function marcarError(idCampo, mensaje){
    const campo = $(idCampo);
    const grupo = campo.closest('.field');
    const caja  = grupo.querySelector('.field-error');
    grupo.classList.remove('invalid');
    if (mensaje) { void grupo.offsetWidth; grupo.classList.add('invalid'); }
    caja.textContent = mensaje || '';
    campo.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
  }
  function limpiarErrores(){ CAMPOS.forEach(id => marcarError(id, '')); }

  function validarCaracteristica(valor, nombre){
    if (!valor) return '';                                         // es opcional
    if (valor.length < 2) return `${nombre}: escribe al menos 2 letras.`;
    if (!RE_PALABRAS.test(valor)) return `${nombre}: solo letras y espacios (sin números ni símbolos).`;
    return '';
  }

  function validarFormulario(){
    const errores = {};

    const productoId = $('producto').value;
    if (!productoId) errores.producto = 'Selecciona un producto.';
    else if (!datos.productos.some(p => String(p.id) === productoId)) errores.producto = 'El producto seleccionado ya no existe.';

    const loteId = $('lote').value;
    if (editandoId === null && !errores.producto) {
      if (!loteId) errores.lote = 'Elige el lote que vas a controlar.';
      else {
        const rec = datos.recepciones.find(x => String(x.id) === String(loteId));
        if (!rec || String(rec.producto_id) !== String(productoId)) errores.lote = 'Ese lote no corresponde al producto elegido.';
        else if (lotesBloqueados().has(String(loteId))) errores.lote = 'Ese lote ya tiene un control.';
      }
    }

    const color   = $('color').value.trim();
    const olor    = $('olor').value.trim();
    const textura = $('textura').value.trim();
    const eColor = validarCaracteristica(color, 'Color');     if (eColor) errores.color = eColor;
    const eOlor  = validarCaracteristica(olor, 'Olor');       if (eOlor)  errores.olor = eOlor;
    const eTex   = validarCaracteristica(textura, 'Textura'); if (eTex)   errores.textura = eTex;

    const resultado = $('resultado').value;
    if (!RESULTADOS.includes(resultado)) errores.resultado = 'Selecciona un resultado válido.';

    const obs = $('observaciones').value.trim();
    if (obs.length > 300) errores.observaciones = 'Máximo 300 caracteres.';
    else if (OBS_OBLIGATORIA_SI_RECHAZADO && resultado === 'Rechazado' && obs.length < 5) {
      errores.observaciones = 'Un control rechazado debe indicar el motivo en las observaciones.';
    }

    limpiarErrores();
    const ids = Object.keys(errores);
    ids.forEach(id => marcarError(id, errores[id]));
    if (ids.length) {
      $(CAMPOS.find(id => errores[id])).focus();
      return null;
    }

    const reg = {
      producto_id: productoId,
      color: color || null,
      olor: olor || null,
      textura: textura || null,
      resultado: resultado,
      observaciones: obs || null
    };
    if (editandoId === null) reg.recepcion_id = loteId;   // el control queda ligado a su lote
    return reg;
  }

  CAMPOS.forEach(id => {
    const el = $(id);
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => marcarError(id, ''));
  });
  $('observaciones').addEventListener('input', () => { $('obsCount').textContent = $('observaciones').value.length; });
  $('resultado').addEventListener('change', actualizarObligatoriedad);

  function actualizarObligatoriedad(){
    $('obsObligatoria').style.display = (OBS_OBLIGATORIA_SI_RECHAZADO && $('resultado').value === 'Rechazado') ? '' : 'none';
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
    const nombre = (u.user_metadata?.full_name || u.user_metadata?.name || (u.email || '').split('@')[0] || 'Usuario').trim() || 'Usuario';
    const inicial = nombre.charAt(0).toUpperCase();
    $('topUserName').textContent = nombre;
    $('topAvatar').textContent   = inicial;
  }

  // ---------------------------------------------------------------
  // CACHÉ LOCAL
  // ---------------------------------------------------------------
  const claveCache = () => 'dsi_nor_' + usuarioActual.id;

  function leerCache(){
    try {
      const c = JSON.parse(localStorage.getItem(claveCache()) || 'null');
      if (c && Array.isArray(c.productos) && Array.isArray(c.controles) && Array.isArray(c.recepciones)) return c;
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
      const [prod, con, rec] = await Promise.race([Promise.all([
        supabaseClient.from('productos').select('id,nombre,estado').order('nombre', { ascending: true }),
        supabaseClient
          .from('controles_calidad')
          .select('id,producto_id,recepcion_id,color,olor,textura,resultado,observaciones,fecha_control,creado_por,productos(nombre)')
          .order('fecha_control', { ascending: false, nullsFirst: false }),
        // Solo para las notificaciones
        supabaseClient
          .from('recepciones')
          .select('id,codigo_lote,producto_id,proveedor_id,peso,estado_producto,fecha_recepcion,proveedores(nombre)')
          .order('fecha_recepcion', { ascending: false, nullsFirst: false })
          .limit(500)
      ]), tiempoAgotado]);

      if (prod.error) { hayError = true; console.error('Error productos:', prod.error); }
      else datos.productos = prod.data || [];

      if (con.error) { hayError = true; console.error('Error controles de calidad:', con.error); }
      else datos.controles = con.data || [];

      if (rec.error) console.error('Error recepciones (notificaciones):', rec.error);
      else datos.recepciones = rec.data || [];
    } catch (err) {
      hayError = true;
      console.error('Error cargando normas y calidad:', err);
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

    mapaProd = new Map(datos.productos.map(p => [String(p.id), p.nombre]));

    const c = datos.controles;
    const total = c.length;
    const aprob = c.filter(x => normalizar(x.resultado).includes('aprob')).length;
    const rech  = c.filter(x => normalizar(x.resultado).includes('rechaz')).length;
    const pend  = c.filter(x => normalizar(x.resultado).includes('pendiente')).length;

    animarNumero($('totalControles'), total, fmtNumero);
    animarNumero($('totalAprobados'), aprob, fmtNumero);
    animarNumero($('totalRechazados'), rech, fmtNumero);
    animarNumero($('totalPendientes'), pend, fmtNumero);

    const pct = n => total ? Math.round((n / total) * 100) + '% del total' : 'Sin controles';
    $('dAprobados').textContent = pct(aprob);
    $('dRechazados').textContent = rech ? pct(rech) + ' · requieren seguimiento' : 'Sin rechazos';
    $('dPendientes').textContent = pend ? pct(pend) + ' · por revisar' : 'Nada por revisar';

    pintarTabla(true);
    renderNotificaciones();
  }

  function nombreProducto(c){
    const p = Array.isArray(c.productos) ? c.productos[0] : c.productos;
    return p?.nombre || mapaProd.get(String(c.producto_id)) || 'Sin producto';
  }

  function filtrarControles(){
    const q = normalizar($('buscar').value);
    const filtro = normalizar($('filtroResultado').value);
    return datos.controles.filter(c =>
      (!filtro || normalizar(c.resultado) === filtro) &&
      (!q || normalizar(nombreProducto(c)).includes(q))
    );
  }

  function pintarTabla(animar){
    const tbody = $('tablaControles');
    const lista = filtrarControles();

    if (!lista.length) {
      let msg = 'No hay controles de calidad registrados.';
      if (errorCarga && !datos.controles.length) msg = 'No se pudieron cargar los controles.';
      else if (datos.controles.length) msg = 'No se encontraron resultados para la búsqueda.';
      tbody.innerHTML = `<tr class="vacio"><td colspan="8" class="empty">${msg}</td></tr>`;
      $('tablaPie').style.display = 'none';
      return;
    }

    const mostrar = lista.slice(0, visibles);
    tbody.innerHTML = mostrar.map((c, i) => {
      const hora = formatearHora(c.fecha_control);
      const anim = animar && !reducirMovimiento ? ` class="row-in" style="animation-delay:${Math.min(i, 10) * 25}ms"` : '';
      const id = escapeHTML(c.id);
      const obs = c.observaciones
        ? `<td class="solo-movil" data-label="Observaciones">${escapeHTML(c.observaciones)}</td>` : '';

      return `<tr${anim}>
        <td data-label="Producto"><strong>${escapeHTML(nombreProducto(c))}</strong></td>
        <td data-label="Proveedor / Lote">${proveedorLoteDe(c)}</td>
        <td data-label="Color">${escapeHTML(c.color || '-')}</td>
        <td data-label="Olor">${escapeHTML(c.olor || '-')}</td>
        <td data-label="Textura">${escapeHTML(c.textura || '-')}</td>
        <td data-label="Resultado"><span class="pill ${clasificarEstado(c.resultado)}">${escapeHTML(c.resultado || '-')}</span></td>
        <td data-label="Fecha" class="td-fecha"><span>${formatearFecha(c.fecha_control)}</span>${hora ? `<small>${hora}</small>` : ''}</td>
        ${obs}
        <td data-label="Acciones">
          <button class="action-btn edit-btn" type="button" data-accion="editar" data-id="${id}">Editar</button>
          <button class="action-btn delete-btn" type="button" data-accion="eliminar" data-id="${id}">Eliminar</button>
        </td>
      </tr>`;
    }).join('');

    $('tablaPie').style.display = 'flex';
    $('tablaInfo').textContent = `Mostrando ${mostrar.length} de ${lista.length}`;
    $('verMas').style.display = lista.length > mostrar.length ? '' : 'none';
  }

  let temporizadorBusqueda;
  $('buscar').addEventListener('input', function(){
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => { visibles = POR_PAGINA; pintarTabla(false); }, 120);
  });
  $('filtroResultado').addEventListener('change', () => { visibles = POR_PAGINA; pintarTabla(true); });
  $('verMas').addEventListener('click', () => { visibles += POR_PAGINA; pintarTabla(false); });

  $('tablaControles').addEventListener('click', function(e){
    const btn = e.target.closest('button[data-accion]');
    if (!btn) return;
    const item = datos.controles.find(c => String(c.id) === btn.dataset.id);
    if (!item) return;
    if (btn.dataset.accion === 'editar') abrirModal(item);
    else eliminar(item, btn.closest('tr'));
  });

  // ---------------------------------------------------------------
  // BLOQUEO DE SCROLL
  // ---------------------------------------------------------------
  function actualizarScroll(){
    const abierto = $('modal').classList.contains('show')
      || $('confirmModal').classList.contains('show')
      || $('fan').classList.contains('open');
    document.body.style.overflow = abierto ? 'hidden' : '';
  }

  // ---------------------------------------------------------------
  // MODAL DE FORMULARIO
  // ---------------------------------------------------------------
  const modal = $('modal');

  function llenarProductos(item){
    const select = $('producto');
    if (!datos.productos.length) {
      select.innerHTML = '<option value="">No hay productos registrados</option>';
      return;
    }
    select.innerHTML = '<option value="">Seleccionar producto</option>' + datos.productos.map(p => {
      const inactivo = normalizar(p.estado) === 'inactivo';
      const actual = item && String(item.producto_id) === String(p.id);
      const bloqueado = inactivo && !actual;
      return `<option value="${escapeHTML(p.id)}"${bloqueado ? ' disabled' : ''}>${escapeHTML(p.nombre)}${inactivo ? ' (inactivo)' : ''}</option>`;
    }).join('');
  }

  // ---------- lotes: cada recepción se controla una vez ----------
  const HINT_LOTE = 'Cada lote recibido se controla una vez. Si el auditor lo rechaza, podrás repetirlo.';
  function estadoRevisionDe(id){ const x = revMap.get(String(id)); return x ? x.estado_revision : 'Pendiente'; }
  // lotes que ya tienen un control vigente (pendiente o aprobado); un control rechazado libera el lote
  function lotesBloqueados(){
    const s = new Set();
    datos.controles.forEach(c => { if (c.recepcion_id && estadoRevisionDe(c.id) !== 'Rechazado') s.add(String(c.recepcion_id)); });
    return s;
  }
  // agrupa por proveedor y numera los lotes (Lote 1, Lote 2...) según la fecha de recepción
  function agruparLotes(recs, bloqueados){
    const grupos = new Map();
    recs.slice().sort((a, b) => String(a.fecha_recepcion || '').localeCompare(String(b.fecha_recepcion || ''))).forEach(r => {
      const k = String(r.proveedor_id || '');
      if (!grupos.has(k)) grupos.set(k, { proveedor: (r.proveedores && r.proveedores.nombre) || '', lotes: [] });
      const g = grupos.get(k);
      g.lotes.push({ r: r, n: g.lotes.length + 1, bloqueado: bloqueados.has(String(r.id)) });
    });
    return Array.from(grupos.values());
  }
  // Proveedor y número de lote de un control (según la recepción a la que está ligado)
  function proveedorLoteDe(c){
    if (!c.recepcion_id) return '—';
    const rec = datos.recepciones.find(x => String(x.id) === String(c.recepcion_id));
    if (!rec) return '—';
    const grupos = agruparLotes(datos.recepciones.filter(r => String(r.producto_id) === String(rec.producto_id)), new Set());
    let n = '';
    grupos.forEach(g => g.lotes.forEach(l => { if (String(l.r.id) === String(rec.id)) n = l.n; }));
    const prov = (rec.proveedores && rec.proveedores.nombre) || 'Sin proveedor';
    return escapeHTML(prov) + ((rec.codigo_lote || n) ? '<br><small>' + escapeHTML(rec.codigo_lote || ('Lote ' + n)) + '</small>' : '');
  }
  function llenarLotes(pid, item){
    const sel = $('lote'), hint = $('loteHint');
    const editando = !!item;
    if (editando && !item.recepcion_id) {
      sel.innerHTML = '<option value="">Sin lote (control anterior)</option>';
      sel.disabled = true;
      hint.textContent = 'Este control se registró antes de ligar los controles a un lote.';
      return;
    }
    if (!pid) {
      sel.innerHTML = '<option value="">Primero elige el producto</option>';
      sel.disabled = true;
      hint.textContent = HINT_LOTE;
      return;
    }
    const grupos = agruparLotes(datos.recepciones.filter(r => String(r.producto_id) === String(pid)), lotesBloqueados());
    const prod = datos.productos.find(p => String(p.id) === String(pid));
    const nombre = prod ? prod.nombre : 'Producto';
    const libres = [];
    let html = editando ? '' : '<option value="">Elige un lote</option>';
    grupos.forEach(g => {
      html += '<optgroup label="' + escapeHTML(nombre + ' (' + (g.proveedor || 'Sin proveedor') + ')') + '">' +
        g.lotes.map(l => {
          const actual = editando && String(l.r.id) === String(item.recepcion_id);
          const bloq = l.bloqueado && !actual;
          if (!bloq) libres.push(String(l.r.id));
          return '<option value="' + escapeHTML(l.r.id) + '"' + (bloq ? ' disabled' : '') + '>' + escapeHTML(l.r.codigo_lote || ('Lote ' + l.n)) + ' · ' +
            escapeHTML(formatearFecha(l.r.fecha_recepcion)) + ' · ' + escapeHTML(fmtPeso(Number(l.r.peso) || 0)) +
            (bloq ? ' — ya tiene control' : '') + '</option>';
        }).join('') + '</optgroup>';
    });
    if (!grupos.length && !editando) html = '<option value="">Sin recepciones</option>';
    sel.innerHTML = html;
    if (editando) {
      if (!Array.prototype.some.call(sel.options, o => o.value === String(item.recepcion_id))) {
        sel.insertAdjacentHTML('afterbegin', '<option value="' + escapeHTML(item.recepcion_id) + '">Lote registrado</option>');
      }
      sel.value = String(item.recepcion_id);
      sel.disabled = true;
      hint.textContent = 'El lote de un control ya guardado no se puede cambiar.';
      return;
    }
    sel.disabled = !libres.length;
    if (libres.length === 1) sel.value = libres[0];
    hint.textContent = !grupos.length ? 'Este producto aún no tiene recepciones. Regístrala en Recepciones para poder controlarla.'
      : (!libres.length ? 'Todos los lotes de este producto ya tienen control.' : HINT_LOTE);
  }
  function iniciarLotes(item){
    $('producto').disabled = !!(item && item.recepcion_id);
    llenarLotes($('producto').value, item);
  }
  $('producto').addEventListener('change', function(){
    if (editandoId === null) llenarLotes($('producto').value, null);
    marcarError('lote', '');
  });

  // ---------- opciones guiadas para color, olor y textura ----------
  const OPCIONES_CAR = {
    color:   ['Característico', 'Brillante', 'Opaco', 'Con manchas', 'Decolorado', 'Alterado'],
    olor:    ['Fresco', 'Marino suave', 'Neutro', 'Fuerte', 'Amoniacal', 'Pútrido'],
    textura: ['Firme', 'Elástica', 'Blanda', 'Viscosa', 'Pastosa', 'Desmenuzable']
  };
  function mostrarOtroCar(id, visible){
    $(id).style.display = visible ? '' : 'none';
    $(id + 'Hint').style.display = visible ? '' : 'none';
  }
  Object.keys(OPCIONES_CAR).forEach(function(id){
    const sel = $(id + 'Sel');
    sel.innerHTML = '<option value="">Elige una opción</option>' +
      OPCIONES_CAR[id].map(function(o){ return '<option value="' + o + '">' + o + '</option>'; }).join('') +
      '<option value="__otro">Otro (escribir)</option>';
    sel.addEventListener('change', function(){
      if (sel.value === '__otro') { $(id).value = ''; mostrarOtroCar(id, true); $(id).focus(); }
      else { $(id).value = sel.value; mostrarOtroCar(id, false); }
      marcarError(id, '');
    });
  });
  // al abrir el formulario: refleja el valor guardado en la lista (o en "Otro")
  function iniciarCaracteristicas(){
    Object.keys(OPCIONES_CAR).forEach(function(id){
      const sel = $(id + 'Sel'), val = $(id).value.trim();
      const coincide = OPCIONES_CAR[id].filter(function(o){ return normalizar(o) === normalizar(val); })[0];
      if (!val) { sel.value = ''; $(id).value = ''; mostrarOtroCar(id, false); }
      else if (coincide) { sel.value = coincide; $(id).value = coincide; mostrarOtroCar(id, false); }
      else { sel.value = '__otro'; mostrarOtroCar(id, true); }
    });
  }

  function abrirModal(item){
    editandoId = item ? item.id : null;
    $('formControl').reset();
    limpiarErrores();
    llenarProductos(item);

    if (item) {
      $('producto').value      = item.producto_id ?? '';
      $('color').value         = item.color || '';
      $('olor').value          = item.olor || '';
      $('textura').value       = item.textura || '';
      $('resultado').value     = RESULTADOS.includes(item.resultado) ? item.resultado : 'Pendiente';
      $('observaciones').value = item.observaciones || '';
      $('modalTitulo').textContent = 'Editar control de calidad';
      $('guardar').textContent = 'Actualizar control';
    } else {
      $('resultado').value = 'Pendiente';
      $('modalTitulo').textContent = 'Nuevo control de calidad';
      $('guardar').textContent = 'Guardar control';
    }

    $('obsCount').textContent = $('observaciones').value.length;
    actualizarObligatoriedad();
    iniciarCaracteristicas();
    iniciarLotes(item);
    modal.classList.add('show');
    actualizarScroll();
    setTimeout(() => $('producto').focus(), 60);
  }

  function cerrarModal(){
    modal.classList.remove('show');
    actualizarScroll();
  }

  $('btnNuevo').addEventListener('click', () => abrirModal(null));
  $('btnNuevoFab').addEventListener('click', () => abrirModal(null));
  $('cerrarModal').addEventListener('click', cerrarModal);
  $('cancelar').addEventListener('click', cerrarModal);
  modal.addEventListener('mousedown', e => { if (e.target === modal) cerrarModal(); });

  // ---------------------------------------------------------------
  // GUARDAR
  // ---------------------------------------------------------------
  $('formControl').addEventListener('submit', async function(e){
    e.preventDefault();
    if (guardando) return;

    const registro = validarFormulario();
    if (!registro) { mostrarToast('Revisa los campos marcados en rojo', 'error'); return; }

    const eraEdicion = editandoId !== null;
    // En un control nuevo se registra la fecha y hora actual
    if (!eraEdicion) registro.fecha_control = new Date().toISOString();

    guardando = true;
    const btn = $('guardar');
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = 'Guardando...';

    let resultado;
    try {
      resultado = eraEdicion
        ? await supabaseClient.from('controles_calidad').update(registro).eq('id', editandoId)
        : await supabaseClient.from('controles_calidad').insert([registro]);
    } catch (err) {
      resultado = { error: err };
    }

    guardando = false;
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = textoOriginal;

    if (resultado.error) {
      console.error('Error al guardar el control:', {
        mensaje: resultado.error.message, codigo: resultado.error.code,
        detalles: resultado.error.details, sugerencia: resultado.error.hint, datos: registro
      });
      mostrarToast('No se pudo guardar el control de calidad', 'error');
      return;
    }

    cerrarModal();
    mostrarToast(eraEdicion ? 'Control actualizado correctamente' : 'Control registrado correctamente', 'success');
    await refrescar();
  });

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
  $('confirmClose').addEventListener('click', () => cerrarConfirmacion(false));
  $('confirmModal').addEventListener('mousedown', e => { if (e.target === $('confirmModal')) cerrarConfirmacion(false); });

  async function eliminar(item, fila){
    const ok = await confirmar(`¿Deseas eliminar el control de calidad de <strong>${escapeHTML(nombreProducto(item))}</strong>? Esta acción no se puede deshacer.`);
    if (!ok) return;

    let error = null;
    try {
      const res = await supabaseClient.from('controles_calidad').delete().eq('id', item.id);
      error = res.error;
    } catch (err) { error = err; }

    if (error) {
      console.error('Error al eliminar el control:', { mensaje: error.message, codigo: error.code });
      mostrarToast('No se pudo eliminar el control', 'error');
      return;
    }

    if (fila && !reducirMovimiento) {
      fila.classList.add('removing');
      await new Promise(r => setTimeout(r, 230));
    }
    mostrarToast('Control eliminado correctamente', 'success');
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

    const prods = datos.productos
      .filter(p => normalizar(p.nombre).includes(q) || normalizar(p.nombre_cientifico).includes(q))
      .slice(0, 5);
    const provs = []
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

  // Escape: cierra lo más reciente que esté abierto
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    if ($('confirmModal').classList.contains('show')) { cerrarConfirmacion(false); return; }
    if ($('modal').classList.contains('show')) { cerrarModal(); return; }
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
  // REVISIÓN POR AUDITOR
  // El auditor aprueba o rechaza; el establecimiento solo edita lo pendiente.
  // La base de datos hace cumplir estas reglas (no depende de esta pantalla).
  // ---------------------------------------------------------------
  let esAuditor = false;
  let revMap = new Map();

  function mostrarToastRev(texto, tipo){
    const t = $('toast');
    t.textContent = texto;
    t.className = 'toast show' + (tipo ? ' ' + tipo : '');
    clearTimeout(mostrarToastRev.timer);
    mostrarToastRev.timer = setTimeout(function(){ t.className = 'toast'; }, 3400);
  }

  function pillRevision(estado){
    if (estado === 'Aprobado') return '<span class="rev-linea">Verificación: <b class="r-ok">Aprobada por auditor</b></span>';
    if (estado === 'Rechazado') return '<span class="rev-linea">Verificación: <b class="r-bad">Rechazada por auditor</b></span>';
    return '<span class="rev-linea">Verificación: <b class="r-pend">Pendiente</b></span>';
  }

  function textoRevisado(c){
    const motivo = (c.estado_revision === 'Rechazado' && c.comentario_revision)
      ? '<small class="rev-motivo">Motivo: ' + escapeHTML(c.comentario_revision) + '</small>' : '';
    return '<span class="rev-texto">Revisado</span>' + motivo;
  }

  function decorarRevision(){
    const tbody = $('tablaControles');
    if (!tbody || !revMap.size) return;
    tbody.querySelectorAll('tr').forEach(function(tr){
      const ref = tr.querySelector('[data-id]');
      if (!ref) return;
      const id = String(ref.dataset.id);
      const c = revMap.get(id);
      if (!c) return;
      const pendiente = c.estado_revision === 'Pendiente';

      const res = tr.querySelector('td[data-label="Resultado"]');
      if (res) {
        res.querySelectorAll('.rev-linea').forEach(function(p){ p.remove(); });
        res.insertAdjacentHTML('beforeend', pillRevision(c.estado_revision));
      }

      const acc = tr.querySelector('td[data-label="Acciones"]');
      if (!acc) return;
      if (esAuditor) {
        acc.innerHTML = pendiente
          ? '<button class="action-btn ok-btn" type="button" data-accion="aprobar" data-id="' + id + '">Aprobar</button>' +
            '<button class="action-btn delete-btn" type="button" data-accion="rechazar" data-id="' + id + '">Rechazar</button>'
          : textoRevisado(c);
      } else {
        acc.innerHTML = pendiente
          ? '<button class="action-btn edit-btn" type="button" data-accion="editar" data-id="' + id + '">Editar</button>' +
            '<button class="action-btn delete-btn" type="button" data-accion="eliminar" data-id="' + id + '">Eliminar</button>'
          : textoRevisado(c);
      }
    });
  }

  async function revisar(id, decision){
    let comentario;
    if (decision === 'Rechazado') {
      comentario = window.prompt('Motivo del rechazo (obligatorio):', '');
      if (comentario === null) return;
      if (!comentario.trim()) { mostrarToastRev('El motivo del rechazo es obligatorio.', 'error'); return; }
    } else {
      comentario = window.prompt('Motivo de la aprobación (obligatorio):', '');
      if (comentario === null) return;
      if (!comentario.trim()) { mostrarToastRev('El motivo de la aprobación es obligatorio.', 'error'); return; }
    }
    const { error } = await supabaseClient.from('controles_calidad')
      .update({ estado_revision: decision, comentario_revision: comentario.trim() || null })
      .eq('id', id);
    if (error) { mostrarToastRev('No se pudo guardar la revisión. Intenta de nuevo.', 'error'); return; }
    mostrarToastRev(decision === 'Aprobado' ? 'Control aprobado.' : 'Control rechazado.', 'success');
    await cargarRevision();
  }

  async function cargarRevision(){
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (user) {
        const { data: perf } = await supabaseClient.from('perfiles').select('rol').eq('id', user.id).maybeSingle();
        esAuditor = !!(perf && (perf.rol === 'auditor' || perf.rol === 'administrador'));
      }
      const { data: cs, error } = await supabaseClient.from('controles_calidad').select('id,estado_revision,comentario_revision');
      if (!error && cs) revMap = new Map(cs.map(function(c){ return [String(c.id), c]; }));
    } catch (e) {
      console.warn('No se pudo cargar la revisión:', e);
    }
    $('btnNuevo').hidden = esAuditor;
    $('btnNuevoFab').hidden = esAuditor;
    decorarRevision();
  }

  $('tablaControles').addEventListener('click', function(e){
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    if (b.dataset.accion === 'aprobar') revisar(b.dataset.id, 'Aprobado');
    else if (b.dataset.accion === 'rechazar') revisar(b.dataset.id, 'Rechazado');
  });

  new MutationObserver(decorarRevision).observe($('tablaControles'), { childList: true });

  supabaseClient.auth.onAuthStateChange(function(evento){
    if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN') cargarRevision();
  });


  // ===============================================================
  // PESTAÑAS · CATÁLOGO DE NORMAS · NORMAS DE CADA PRODUCTO
  // Las reglas de verdad (quién puede declarar, verificar o rechazar)
  // las hace cumplir la base de datos; esta pantalla solo las muestra.
  // ===============================================================
  const TABS = ['catalogo', 'productos', 'controles'];
  let miRol = null;
  let rolPromesa = null;
  const soyAuditor = () => miRol === 'auditor' || miRol === 'administrador';

  function obtenerRol(){
    if (rolPromesa) return rolPromesa;
    rolPromesa = (async function(){
      try {
        const res = await supabaseClient.auth.getSession();
        const uid = res.data.session && res.data.session.user.id;
        if (!uid) return null;
        const r = await supabaseClient.from('perfiles').select('rol').eq('id', uid).maybeSingle();
        miRol = r.data ? r.data.rol : null;
      } catch (e) { miRol = null; }
      return miRol;
    })();
    return rolPromesa;
  }

  function hoyISO(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fechaISO(s){ return s ? String(s).slice(0, 10).split('-').reverse().join('/') : ''; }

  function textoError(e){
    const m = (e && e.message) || '';
    if (/^(Para declarar|La fecha de|Una norma|Solo el|Solo un|No se puede|Un rechazo|El auditor)/.test(m)) return m;
    return 'No se pudo guardar. Intenta de nuevo.';
  }

  // ---------- ventanas ----------
  function bloquearScroll(){
    document.body.style.overflow = document.querySelector('.modal.show') ? 'hidden' : '';
  }
  function abrirVentana(id){
    $(id).classList.add('show');
    bloquearScroll();
  }
  function cerrarVentana(id){
    $(id).classList.remove('show');
    bloquearScroll();
  }
  document.addEventListener('click', function(e){
    const b = e.target.closest('[data-cerrar]');
    if (b) cerrarVentana(b.dataset.cerrar);
  });
  ['modalNorma', 'modalDecl', 'modalRev', 'modalDet'].forEach(function(id){
    $(id).addEventListener('mousedown', function(e){ if (e.target === $(id)) cerrarVentana(id); });
  });
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    ['modalNorma', 'modalDecl', 'modalRev', 'modalDet'].forEach(function(id){ if ($(id).classList.contains('show')) cerrarVentana(id); });
  });

  // ---------- pestañas ----------
  function irTab(nombre, actualizarHash){
    if (TABS.indexOf(nombre) < 0) nombre = 'catalogo';
    TABS.forEach(function(t){
      const activo = t === nombre;
      $('panel-' + t).hidden = !activo;
      const b = $('tab-' + t);
      b.classList.toggle('on', activo);
      b.setAttribute('aria-selected', activo ? 'true' : 'false');
      b.tabIndex = activo ? 0 : -1;
    });
    document.body.classList.toggle('tab-controles', nombre === 'controles');
    if (actualizarHash !== false) {
      try { if (location.hash !== '#' + nombre) history.replaceState(null, '', '#' + nombre); } catch (e) { /* sin historial */ }
    }
    if (nombre === 'catalogo') cargarCatalogo();
    if (nombre === 'productos') cargarProductosNormas();
  }

  document.querySelector('.tabs').addEventListener('click', function(e){
    const b = e.target.closest('[data-tab]');
    if (b) irTab(b.dataset.tab);
  });
  document.querySelector('.tabs').addEventListener('keydown', function(e){
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const actual = TABS.findIndex(function(t){ return $('tab-' + t).classList.contains('on'); });
    const sig = (actual + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    irTab(TABS[sig]);
    $('tab-' + TABS[sig]).focus();
  });
  window.addEventListener('hashchange', function(){ irTab(location.hash.slice(1), false); });

  // ===============================================================
  // CATÁLOGO
  // ===============================================================
  const CLAVE_CAT = 'dsi_catalogo_normas_v1';
  const CLAVE_REGLAS = 'dsi_reglas_normas_v1';
  const CLASE_TIPO = { Sanitaria: 'tp-san', Legal: 'tp-leg', Calidad: 'tp-cal', Ambiental: 'tp-amb', Internacional: 'tp-int' };
  const CAT_POR_PAGINA = 30;
  let catalogo = [];
  let reglas = [];
  let mapaCat = new Map();
  let catalogoListo = false;
  let catCargando = null;
  let catUltima = 0;
  let catVisibles = CAT_POR_PAGINA;

  function leerJSON(clave){
    try { const s = localStorage.getItem(clave); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function guardarJSON(clave, valor){
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin espacio */ }
  }

  function cargarCatalogo(forzar){
    if (catCargando) return catCargando;
    if (!forzar && catalogoListo && Date.now() - catUltima < 60000) return Promise.resolve();

    catCargando = (async function(){
      // 1) al instante: lo último guardado
      if (!catalogoListo) {
        const c = leerJSON(CLAVE_CAT);
        if (c && c.length) {
          catalogo = c;
          reglas = leerJSON(CLAVE_REGLAS) || [];
          mapaCat = new Map(catalogo.map(function(n){ return [n.id, n]; }));
          catalogoListo = true;
          pintarCatalogo();
        }
      }
      // 2) en segundo plano: lo más reciente
      try {
        const res = await Promise.all([
          supabaseClient.from('normas_catalogo').select('id,codigo,nombre,tipo,entidad,descripcion,explicacion_usuario,evidencia_requerida,orientacion_documento,estado,actualizado').order('codigo', { ascending: false }),
          supabaseClient.from('norma_categoria').select('norma_id,categoria,obligatoria')
        ]);
        if (res[0].error) throw res[0].error;
        catalogo = res[0].data || [];
        if (!res[1].error) reglas = res[1].data || [];
        mapaCat = new Map(catalogo.map(function(n){ return [n.id, n]; }));
        catalogoListo = true;
        catUltima = Date.now();
        guardarJSON(CLAVE_CAT, catalogo);
        guardarJSON(CLAVE_REGLAS, reglas);
        pintarCatalogo();
      } catch (e) {
        if (!catalogoListo) {
          $('tablaCatalogo').innerHTML = '<tr class="vacio"><td colspan="6" class="empty">No se pudo cargar el catálogo. <button class="lk" type="button" id="catReintentar">Reintentar</button></td></tr>';
        }
      } finally {
        catCargando = null;
      }
    })();
    return catCargando;
  }

  function pintarCatalogo(){
    const total = catalogo.length;
    $('catTotal').textContent = total;
    $('catVigentes').textContent = catalogo.filter(function(n){ return n.estado === 'Vigente'; }).length;
    $('catSanitarias').textContent = catalogo.filter(function(n){ return n.tipo === 'Sanitaria'; }).length;
    let ultima = '';
    catalogo.forEach(function(n){ if (n.actualizado && n.actualizado > ultima) ultima = n.actualizado; });
    $('catActualizado').textContent = ultima ? formatearFecha(ultima) : '–';

    // entidades disponibles (se conserva la elegida)
    const selEnt = $('catEntidad');
    const previa = selEnt.value;
    const entidades = Array.from(new Set(catalogo.map(function(n){ return n.entidad; }))).sort(function(a, b){ return a.localeCompare(b, 'es'); });
    selEnt.innerHTML = '<option value="">Todas las entidades</option>' +
      entidades.map(function(e){ return '<option>' + escapeHTML(e) + '</option>'; }).join('');
    selEnt.value = entidades.indexOf(previa) >= 0 ? previa : '';

    const q = normalizar($('catBuscar').value);
    const tipo = $('catTipo').value;
    const ent = selEnt.value;
    const est = $('catEstado').value;
    const lista = catalogo.filter(function(n){
      if (tipo && n.tipo !== tipo) return false;
      if (ent && n.entidad !== ent) return false;
      if (est && n.estado !== est) return false;
      if (q && normalizar(n.codigo + ' ' + n.nombre + ' ' + n.entidad + ' ' + (n.descripcion || '')).indexOf(q) < 0) return false;
      return true;
    });

    const mostrar = lista.slice(0, catVisibles);
    $('tablaCatalogo').innerHTML = mostrar.length ? mostrar.map(function(n){
      return '<tr>' +
        '<td data-label="Código"><strong>' + escapeHTML(n.codigo) + '</strong></td>' +
        '<td data-label="Norma"><span>' + escapeHTML(n.nombre) + (n.descripcion ? '<span class="sub">' + escapeHTML(n.descripcion) + '</span>' : '') + '</span></td>' +
        '<td data-label="Tipo"><span class="pill ' + (CLASE_TIPO[n.tipo] || 'tp-int') + '">' + escapeHTML(n.tipo) + '</span></td>' +
        '<td data-label="Entidad">' + escapeHTML(n.entidad) + '</td>' +
        '<td data-label="Estado"><span class="pill ' + (n.estado === 'Vigente' ? 'ok' : 'bad') + '">' + (n.estado === 'Vigente' ? 'Vigente' : 'Inactiva') + '</span></td>' +
        '<td><button class="lk" type="button" data-ver="' + escapeHTML(n.id) + '">Ver detalle</button></td>' +
        '</tr>';
    }).join('') : '<tr class="vacio"><td colspan="6" class="empty">' + (total ? 'Ninguna norma coincide con tu búsqueda.' : 'Todavía no hay normas en el catálogo.') + '</td></tr>';

    const hayMas = lista.length > mostrar.length;
    $('catPie').style.display = lista.length ? 'flex' : 'none';
    $('catInfo').textContent = 'Mostrando ' + mostrar.length + ' de ' + lista.length;
    $('catMas').style.display = hayMas ? '' : 'none';
  }

  let temporizadorCat = null;
  $('catBuscar').addEventListener('input', function(){
    clearTimeout(temporizadorCat);
    temporizadorCat = setTimeout(function(){ catVisibles = CAT_POR_PAGINA; pintarCatalogo(); }, 120);
  });
  ['catTipo', 'catEntidad', 'catEstado'].forEach(function(id){
    $(id).addEventListener('change', function(){ catVisibles = CAT_POR_PAGINA; pintarCatalogo(); });
  });
  $('catMas').addEventListener('click', function(){ catVisibles += CAT_POR_PAGINA; pintarCatalogo(); });
  $('tablaCatalogo').addEventListener('click', function(e){
    if (e.target.id === 'catReintentar') { cargarCatalogo(true); return; }
    const b = e.target.closest('[data-ver]');
    if (b) abrirDetalle(b.dataset.ver);
  });

  function abrirDetalle(id){
    const n = mapaCat.get(id);
    if (!n) return;
    $('dNombre').textContent = n.nombre;
    $('dCodigo').textContent = n.codigo;
    $('dEntidad').textContent = n.entidad;
    $('dTipo').innerHTML = '<span class="pill ' + (CLASE_TIPO[n.tipo] || 'tp-int') + '">' + escapeHTML(n.tipo) + '</span>';
    $('dEstado').innerHTML = '<span class="pill ' + (n.estado === 'Vigente' ? 'ok' : 'bad') + '">' + (n.estado === 'Vigente' ? 'Vigente' : 'Inactiva') + '</span>';
    $('dDesc').textContent = n.descripcion || 'Sin descripción.';
    const ob = reglas.filter(function(r){ return r.norma_id === id && r.obligatoria; }).map(function(r){ return r.categoria; });
    const rec = reglas.filter(function(r){ return r.norma_id === id && !r.obligatoria; }).map(function(r){ return r.categoria; });
    $('dObl').textContent = ob.length ? ob.join(', ') : 'Ninguna categoría';
    $('dRec').textContent = rec.length ? rec.join(', ') : 'Ninguna categoría';
    $('dAct').textContent = n.actualizado ? formatearFecha(n.actualizado) : '–';
    abrirVentana('modalNorma');
  }

  // ===============================================================
  // NORMAS DE CADA PRODUCTO
  // ===============================================================
  const ETIQ_ESTADO = { 'Sin declarar': 'Sin declarar', 'Declarada': 'En revisión', 'Verificada': 'Verificada', 'Rechazada': 'Rechazada', 'No aplica': 'No aplica' };
  const CLASE_ESTADO = { 'Sin declarar': 'neutro', 'Declarada': 'info', 'Verificada': 'ok', 'Rechazada': 'bad', 'No aplica': 'neutro' };
  const CLASE_CUMPL = { 'Aprobado': 'ok', 'Rechazado': 'bad', 'Pendiente': 'pend', 'Sin normas': 'neutro' };
  // La base puede devolver "Cumple" / "No cumple"; la pantalla los muestra como Aprobado / Rechazado
  function estadoCump(c){
    const e = normalizar((c && c.estado_cumplimiento) || '');
    if (e === 'cumple') return 'Aprobado';
    if (e === 'no cumple') return 'Rechazado';
    if (e === 'en revision' || e === 'por revisar') return 'Pendiente';
    return (c && c.estado_cumplimiento) || '';
  }

  let pd = { productos: [], cumpl: new Map(), normas: new Map(), duenos: new Map() };
  let pdListo = false;
  let pdCargando = false;
  let pdUltima = 0;
  const abiertos = new Set();
  let filtroPreparado = false;

  function prepararFiltroProductos(){
    if (filtroPreparado) return;
    filtroPreparado = true;
    const aud = soyAuditor();
    $('tabProductosTxt').textContent = aud ? 'Normas por revisar' : 'Mis normas';
    $('pdTitulo').textContent = aud ? 'Normas declaradas por los establecimientos' : 'Normas de mis productos';
    $('pdNota').textContent = aud
      ? 'Verifica o rechaza cada norma declarada. Un producto queda aprobado solo cuando todas sus normas obligatorias están verificadas.'
      : 'Declara cada norma obligatoria con su certificado. Tu producto queda aprobado cuando el auditor verifica todas.';
    $('pdFiltro').innerHTML = aud
      ? '<option value="revisar">Por revisar</option><option value="todos">Todos los productos</option>'
      : '<option value="">Todos mis productos</option><option value="Aprobado">Aprobados</option><option value="Pendiente">Pendientes</option><option value="Rechazado">Rechazados</option>';
  }

  // Número de PRODUCTOS con algo pendiente: el auditor, los que tienen normas por revisar; el establecimiento, los que tienen normas
  // por redactar sus normas OBLIGATORIAS (sin declarar, rechazadas o con el certificado vencido). Las recomendadas no cuentan. El mismo número enciende el punto rojo del mapa de navegación.
  async function actualizarBadgeRevision(){
    await obtenerRol();
    prepararFiltroProductos();
    try {
      const aud = soyAuditor();
      const r = await supabaseClient.from('producto_normas').select('producto_id,obligatoria,estado,fecha_vencimiento').limit(5000);
      if (r.error) return;
      const hoy = hoyISO();
      const productos = new Set();
      (r.data || []).forEach(function(pn){
        const pendiente = aud
          ? pn.estado === 'Declarada'
          : (pn.obligatoria && (pn.estado === 'Sin declarar' || pn.estado === 'Rechazada' || (pn.estado === 'Verificada' && pn.fecha_vencimiento && pn.fecha_vencimiento < hoy)));
        if (pendiente) productos.add(pn.producto_id);
      });
      const n = productos.size;
      const b = $('tabBadge');
      b.textContent = n > 99 ? '99+' : String(n);
      b.classList.toggle('show', n > 0);
      b.setAttribute('aria-label', aud ? 'Productos con normas por revisar' : 'Productos con normas pendientes');
      if (window.dsiShell) window.dsiShell.setPendientes({ normas: n });
    } catch (e) { /* el contador es opcional */ }
  }

  async function cargarProductosNormas(forzar){
    if (pdCargando) return;
    if (!forzar && pdListo && Date.now() - pdUltima < 30000) return;
    pdCargando = true;
    if (!pdListo) $('pdLista').innerHTML = '<div class="vacio-n">Cargando…</div>';
    try {
      await obtenerRol();
      prepararFiltroProductos();
      const aud = soyAuditor();
      const consultas = [
        cargarCatalogo(),
        supabaseClient.from('productos').select('id,nombre,categoria,creado_por').order('created_at', { ascending: false }).limit(500),
        supabaseClient.from('productos_cumplimiento').select('producto_id,obligatorias,cumplidas,por_revisar,rechazadas,vencidas,estado_cumplimiento'),
        supabaseClient.from('producto_normas').select('id,producto_id,norma_id,obligatoria,estado,certificado,entidad_emisora,fecha_emision,fecha_vencimiento,comentario_revision').limit(5000)
      ];
      if (aud) consultas.push(supabaseClient.from('perfiles').select('id,nombre,nombre_establecimiento,email'));
      const r = await Promise.all(consultas);
      const fallo = r.slice(1).find(function(x){ return x && x.error; });
      if (fallo) throw fallo.error;

      pd.productos = r[1].data || [];
      pd.cumpl = new Map((r[2].data || []).map(function(c){ return [c.producto_id, c]; }));
      pd.normas = new Map();
      (r[3].data || []).forEach(function(n){
        if (!pd.normas.has(n.producto_id)) pd.normas.set(n.producto_id, []);
        pd.normas.get(n.producto_id).push(n);
      });
      pd.duenos = new Map(aud && r[4] ? (r[4].data || []).map(function(p){ return [p.id, p.nombre_establecimiento || p.nombre || p.email || 'Usuario']; }) : []);
      pdListo = true;
      pdUltima = Date.now();
      pintarProductos();
      actualizarBadgeRevision();
    } catch (e) {
      if (!pdListo) $('pdLista').innerHTML = '<div class="vacio-n">No se pudieron cargar tus normas. <button class="lk" type="button" id="pdReintentar">Reintentar</button></div>';
      else mostrarToast('No se pudo actualizar. Revisa tu conexión.', 'error');
    } finally {
      pdCargando = false;
    }
  }

  function normasOrdenadas(idProducto){
    const lista = (pd.normas.get(idProducto) || []).slice();
    lista.sort(function(a, b){
      if (a.obligatoria !== b.obligatoria) return a.obligatoria ? -1 : 1;
      const ca = (mapaCat.get(a.norma_id) || {}).codigo || '';
      const cb = (mapaCat.get(b.norma_id) || {}).codigo || '';
      return ca.localeCompare(cb);
    });
    return lista;
  }

  function filaNorma(pn, aud){
    const n = mapaCat.get(pn.norma_id) || { nombre: 'Norma', entidad: '', codigo: '' };
    const vencida = pn.estado === 'Verificada' && pn.fecha_vencimiento && pn.fecha_vencimiento < hoyISO();
    const etiqueta = vencida ? 'Vencida' : (aud && pn.estado === 'Declarada' ? 'Por revisar' : ETIQ_ESTADO[pn.estado]);
    const clase = vencida ? 'bad' : CLASE_ESTADO[pn.estado];

    let detalle = '<small>' + escapeHTML(n.codigo) + (n.entidad ? ' · ' + escapeHTML(n.entidad) : '') + '</small>';
    if (pn.certificado) {
      detalle += '<small>Certificado ' + escapeHTML(pn.certificado) +
        (pn.entidad_emisora ? ' · ' + escapeHTML(pn.entidad_emisora) : '') +
        (pn.fecha_vencimiento ? ' · vence ' + fechaISO(pn.fecha_vencimiento) : '') + '</small>';
    }
    if (pn.estado === 'Rechazada' && pn.comentario_revision) {
      detalle += '<small class="mot">Motivo del rechazo: ' + escapeHTML(pn.comentario_revision) + '</small>';
    }

    let acciones = '';
    if (aud) {
      if (pn.estado === 'Declarada') {
        acciones = '<button class="mini p" type="button" data-acc="detalle" data-pn="' + pn.id + '">Ver detalles y valorar</button>' +
                   '<button class="mini v" type="button" data-acc="verificar" data-pn="' + pn.id + '">Verificar</button>' +
                   '<button class="mini d" type="button" data-acc="rechazar" data-pn="' + pn.id + '">Rechazar</button>';
      }
    } else {
      if (pn.estado === 'Sin declarar' || pn.estado === 'Rechazada') {
        acciones += '<button class="mini p" type="button" data-acc="declarar" data-pn="' + pn.id + '">' + (pn.estado === 'Rechazada' ? 'Corregir y volver a declarar' : 'Subir mi certificado') + '</button>';
      } else if (pn.estado === 'Declarada') {
        acciones += '<button class="mini g" type="button" data-acc="declarar" data-pn="' + pn.id + '">Editar declaración</button>';
      } else if (vencida) {
        acciones += '<button class="mini p" type="button" data-acc="declarar" data-pn="' + pn.id + '">Renovar certificado</button>';
      }
      if (!pn.obligatoria && pn.estado !== 'Verificada') {
        acciones += '<button class="mini d" type="button" data-acc="quitar" data-pn="' + pn.id + '">Quitar</button>';
      }
    }

    return '<div class="nrow">' +
      '<div class="nm"><b>' + escapeHTML(n.nombre) + '</b>' + detalle + '</div>' +
      '<div class="st"><span class="pill ' + (pn.obligatoria ? 'info' : 'neutro') + '">' + (pn.obligatoria ? 'Obligatoria' : 'Recomendada') + '</span>' +
      '<span class="pill ' + clase + '">' + etiqueta + '</span></div>' +
      (acciones ? '<div class="ac">' + acciones + '</div>' : '') +
      '</div>';
  }

  function tarjetaProducto(p, aud){
    const c = pd.cumpl.get(p.id) || { obligatorias: 0, cumplidas: 0, por_revisar: 0, rechazadas: 0, vencidas: 0, estado_cumplimiento: 'Sin normas' };
    const abierto = abiertos.has(p.id);
    const dueno = aud ? ' · ' + escapeHTML(pd.duenos.get(p.creado_por) || 'Usuario') : '';
    let progreso = c.obligatorias ? c.cumplidas + ' de ' + c.obligatorias + ' obligatorias verificadas' : 'Sin normas obligatorias para esta categoría';
    if (aud && c.por_revisar) progreso += ' · ' + c.por_revisar + ' por revisar';
    if (c.vencidas) progreso += ' · ' + c.vencidas + ' vencida' + (c.vencidas > 1 ? 's' : '');

    const filas = normasOrdenadas(p.id).map(function(pn){ return filaNorma(pn, aud); }).join('');

    let agregar = '';
    if (!aud) {
      const tiene = new Set((pd.normas.get(p.id) || []).map(function(n){ return n.norma_id; }));
      const opciones = catalogo.filter(function(n){ return n.estado === 'Vigente' && !tiene.has(n.id); })
        .map(function(n){ return '<option value="' + escapeHTML(n.id) + '">' + escapeHTML(n.codigo + ' · ' + n.nombre) + '</option>'; }).join('');
      if (opciones) {
        agregar = '<div class="agregar"><select aria-label="Agregar otra norma del catálogo" data-sel="' + p.id + '"><option value="">Agregar otra norma del catálogo…</option>' + opciones + '</select>' +
                  '<button class="mini g" type="button" data-acc="agregar" data-id="' + p.id + '">Agregar</button></div>';
      }
    }

    return '<article class="pcard' + (abierto ? ' open' : '') + '" data-card="' + p.id + '">' +
      '<button class="pcard-h" type="button" data-acc="toggle" data-id="' + p.id + '" aria-expanded="' + (abierto ? 'true' : 'false') + '">' +
        '<div class="t"><b>' + escapeHTML(p.nombre) + '</b><small>' + escapeHTML(p.categoria || '') + dueno + ' · ' + progreso + '</small></div>' +
        '<span class="pill ' + (CLASE_CUMPL[estadoCump(c)] || 'neutro') + '">' + estadoCump(c) + '</span>' +
        '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>' +
      '</button>' +
      '<div class="pcard-b">' + (filas || '<div class="vacio-n">Este producto no tiene normas asignadas.</div>') + agregar + '</div>' +
    '</article>';
  }

  function pintarProductos(){
    const aud = soyAuditor();
    const q = normalizar($('pdBuscar').value);
    const f = $('pdFiltro').value;

    const lista = pd.productos.filter(function(p){
      const c = pd.cumpl.get(p.id) || {};
      if (q && normalizar(p.nombre + ' ' + (p.categoria || '') + ' ' + (aud ? (pd.duenos.get(p.creado_por) || '') : '')).indexOf(q) < 0) return false;
      if (aud) return f === 'todos' ? true : (c.por_revisar > 0);
      return !f || estadoCump(c) === f;
    });

    const cuenta = { Aprobado: 0, Pendiente: 0, Rechazado: 0 };
    pd.productos.forEach(function(p){ const c = pd.cumpl.get(p.id); if (c && cuenta[estadoCump(c)] !== undefined) cuenta[estadoCump(c)]++; });
    $('pdChips').innerHTML = aud
      ? '<span class="pill info">' + lista.length + ' por revisar</span>'
      : '<span class="pill ok">' + cuenta.Aprobado + ' aprobados</span><span class="pill pend">' + cuenta.Pendiente + ' pendientes</span><span class="pill bad">' + cuenta.Rechazado + ' rechazados</span>';

    if (!lista.length) {
      $('pdLista').innerHTML = '<div class="vacio-n">' + (pd.productos.length
        ? (aud && f !== 'todos' ? 'No hay normas por revisar. 🎉' : 'Ningún producto coincide con tu búsqueda.')
        : (aud ? 'Todavía no hay productos registrados.' : 'Aún no tienes productos. Crea uno en Productos y aquí verás sus normas.')) + '</div>';
      return;
    }
    $('pdLista').innerHTML = lista.map(function(p){ return tarjetaProducto(p, aud); }).join('');
  }

  let temporizadorPd = null;
  $('pdBuscar').addEventListener('input', function(){
    clearTimeout(temporizadorPd);
    temporizadorPd = setTimeout(pintarProductos, 120);
  });
  $('pdFiltro').addEventListener('change', pintarProductos);

  function buscarPN(id){
    let hallada = null;
    pd.normas.forEach(function(lista){ lista.forEach(function(n){ if (n.id === id) hallada = n; }); });
    return hallada;
  }
  function nombreProductoDe(idProducto){
    const p = pd.productos.find(function(x){ return x.id === idProducto; });
    return p ? p.nombre : 'Producto';
  }

  $('pdLista').addEventListener('click', async function(e){
    if (e.target.id === 'pdReintentar') { cargarProductosNormas(true); return; }
    const b = e.target.closest('[data-acc]');
    if (!b) return;
    const acc = b.dataset.acc;

    if (acc === 'toggle') {
      const card = b.closest('.pcard');
      const abierto = card.classList.toggle('open');
      b.setAttribute('aria-expanded', abierto ? 'true' : 'false');
      if (abierto) abiertos.add(b.dataset.id); else abiertos.delete(b.dataset.id);
      return;
    }
    if (acc === 'declarar') { abrirDeclaracion(b.dataset.pn); return; }
    if (acc === 'detalle') { abrirDetalleNorma(b.dataset.pn); return; }
    if (acc === 'verificar' || acc === 'rechazar') { abrirRevision(b.dataset.pn, acc === 'verificar' ? 'Verificada' : 'Rechazada'); return; }
    if (acc === 'quitar') { quitarNorma(b.dataset.pn, b); return; }
    if (acc === 'agregar') { agregarNorma(b.dataset.id, b); return; }
  });

  async function agregarNorma(idProducto, boton){
    const sel = document.querySelector('select[data-sel="' + idProducto + '"]');
    if (!sel || !sel.value) { mostrarToast('Elige una norma del catálogo.', 'error'); return; }
    boton.disabled = true;
    const { error } = await supabaseClient.from('producto_normas').insert({ producto_id: idProducto, norma_id: sel.value, obligatoria: false, estado: 'Sin declarar' });
    boton.disabled = false;
    if (error) { mostrarToast(textoError(error), 'error'); return; }
    mostrarToast('Norma agregada al producto.', 'success');
    await cargarProductosNormas(true);
  }

  async function quitarNorma(id, boton){
    const pn = buscarPN(id);
    if (!pn) return;
    const n = mapaCat.get(pn.norma_id) || { nombre: 'esta norma' };
    const tituloPrevio = $('confirmTitle').textContent;
    const botonPrevio = $('confirmYes').textContent;
    $('confirmTitle').textContent = 'Quitar norma';
    $('confirmYes').textContent = 'Quitar';
    const si = await confirmar('¿Quitar <strong>' + escapeHTML(n.nombre) + '</strong> de este producto?');
    $('confirmTitle').textContent = tituloPrevio;
    $('confirmYes').textContent = botonPrevio;
    if (!si) return;
    boton.disabled = true;
    const { error } = await supabaseClient.from('producto_normas').delete().eq('id', id);
    boton.disabled = false;
    if (error) { mostrarToast(textoError(error), 'error'); return; }
    mostrarToast('Norma quitada.', 'success');
    await cargarProductosNormas(true);
  }

  // ---------- declarar cumplimiento (establecimiento) ----------
  let declarandoId = null;
  let declarandoRenueva = false;
  // Recuerda preferencias no sensibles para evitar repetir selecciones en cada declaración.
  // Nunca guarda números de certificados ni fechas, porque pertenecen a cada documento real.
  const CLAVE_PREF_DECLARACION = 'dsi_preferencias_declaracion_normas_v1';
  function leerPreferenciasDeclaracion(){
    try { return JSON.parse(localStorage.getItem(CLAVE_PREF_DECLARACION) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function guardarPreferenciasDeclaracion(datos){
    try { localStorage.setItem(CLAVE_PREF_DECLARACION, JSON.stringify(datos)); }
    catch (e) { /* almacenamiento local no disponible */ }
  }
  // Preferencias separadas por norma para no reutilizar un tipo o emisor incorrecto.
  function preferenciasDeNorma(normaId){
    const datos = leerPreferenciasDeclaracion();
    return datos.normas && datos.normas[normaId] ? datos.normas[normaId] : {};
  }
  function marcarCampo(idCampo, mensaje){
    const campo = $(idCampo).closest('.field');
    campo.classList.toggle('invalid', !!mensaje);
    const err = campo.querySelector('.field-error');
    if (err) err.textContent = mensaje || '';
  }

  function tipoSugeridoDeNorma(n){
    const texto = ((n.codigo || '') + ' ' + (n.nombre || '') + ' ' + (n.evidencia_requerida || '')).toLowerCase();
    if (/iso\s*22000/.test(texto)) return 'Certificado ISO 22000';
    if (/5109|etiquetado|etiqueta del producto/.test(texto)) return 'Etiqueta del producto';
    if (/235 de 2021|ica|referencia normativa/.test(texto)) return 'Documento sanitario por validar';
    if (/codex|higiene|limpieza y desinfección/.test(texto)) return 'Procedimientos y registros de higiene';
    return 'Otro documento';
  }

  function abrirDeclaracion(id){
    const pn = buscarPN(id);
    if (!pn) return;
    declarandoId = id;
    const n = mapaCat.get(pn.norma_id) || { nombre: 'Norma' };
    $('dcInfo').textContent = n.nombre + ' · ' + nombreProductoDe(pn.producto_id);
    llenarGuiaDeclaracion(pn, n);
    // Si el certificado ya venció, se renueva: se pide el certificado nuevo con sus fechas
    declarandoRenueva = pn.estado === 'Verificada' && !!pn.fecha_vencimiento && pn.fecha_vencimiento < hoyISO();
    $('dcTitulo').textContent = declarandoRenueva ? 'Renovar certificado' : 'Subir mi certificado';
    if (declarandoRenueva) $('dcCert').value = '';
    // Sugiere el tipo de evidencia según la norma; el usuario debe confirmar que corresponde a su documento real.
    $('dcTipo').value = tipoSugeridoDeNorma(n);
    const preferencias = preferenciasDeNorma(pn.norma_id);
    // Reutiliza solo las preferencias de esta misma norma; nunca copia certificados ni fechas.
    if (!pn.certificado && preferencias.tipo && Array.prototype.some.call($('dcTipo').options, function(o){ return o.value === preferencias.tipo; })) {
      $('dcTipo').value = preferencias.tipo;
    }
    if (!pn.entidad_emisora && preferencias.emisora) {
      const selEntidad = $('dcEmisoraSel');
      const existeEntidad = Array.prototype.some.call(selEntidad.options, function(o){ return o.value === preferencias.emisora; });
      selEntidad.value = existeEntidad ? preferencias.emisora : '__otra';
      $('dcEmisora').value = existeEntidad ? '' : preferencias.emisora;
      $('dcEmisora').style.display = existeEntidad ? 'none' : '';
    }
    $('dcEmision').value = declarandoRenueva ? '' : (pn.fecha_emision || '');
    $('dcVence').value = declarandoRenueva ? '' : (pn.fecha_vencimiento || '');
    $('dcVence').disabled = false;
    $('dcEmision').max = hoyISO();
    $('dcEmision').placeholder = '';
    $('dcVence').placeholder = '';
    iniciarVigencia();
    ['dcCert', 'dcEmision', 'dcVence'].forEach(function(c){ marcarCampo(c, ''); });
    abrirVentana('modalDecl');
    setTimeout(function(){ $('dcCert').focus(); }, 60);
  }

  $('formDecl').addEventListener('submit', async function(e){
    e.preventDefault();
    if (!declarandoId) return;
    const numeroCert = $('dcCert').value.trim();
    const tipoCert = $('dcTipo').value;
    const cert = numeroCert ? (tipoCert ? tipoCert + ' ' + numeroCert : numeroCert) : '';
    const emisora = valorEmisora();
    const emision = $('dcEmision').value;
    const vence = $('dcVence').value;
    let ok = true;
    marcarCampo('dcCert', cert ? '' : 'Completa este campo con el número, código o nombre real de la evidencia sugerida.'); if (!cert) ok = false;
    marcarCampo('dcEmision', !emision ? 'Indica la fecha de emisión.' : (emision > hoyISO() ? 'La emisión no puede ser futura.' : '')); if (!emision || emision > hoyISO()) ok = false;
    let msgVence = '';
    if (!vence) msgVence = 'Indica la fecha de vencimiento.';
    else if (emision && vence <= emision) msgVence = 'Debe ser posterior a la emisión.';
    else if (vence < hoyISO()) msgVence = 'El documento ya está vencido.';
    marcarCampo('dcVence', msgVence); if (msgVence) ok = false;
    if (!ok) return;

    const chipVigencia = $('dcVig').querySelector('.gd-chip.on');
    const datosPreferencias = leerPreferenciasDeclaracion();
    if (!datosPreferencias.normas) datosPreferencias.normas = {};
    const pnActual = buscarPN(declarandoId);
    const idNormaActual = pnActual ? pnActual.norma_id : null;
    const preferencias = preferenciasDeNorma(idNormaActual);
    preferencias.tipo = tipoCert;
    preferencias.emisora = emisora || '';
    if (chipVigencia && ['1','2','3','5'].indexOf(chipVigencia.dataset.a) >= 0) preferencias.vigencia = Number(chipVigencia.dataset.a);
    if (idNormaActual) {
      datosPreferencias.normas[idNormaActual] = preferencias;
      guardarPreferenciasDeclaracion(datosPreferencias);
    }

    const btn = $('dcGuardar');
    btn.disabled = true;
    const { error } = await supabaseClient.from('producto_normas')
      .update({ estado: 'Declarada', certificado: cert, entidad_emisora: emisora || null, fecha_emision: emision || null, fecha_vencimiento: vence })
      .eq('id', declarandoId);
    btn.disabled = false;
    if (error) { mostrarToast(textoError(error), 'error'); return; }
    cerrarVentana('modalDecl');
    mostrarToast(declarandoRenueva ? 'Renovación enviada al auditor.' : 'Declaración enviada al auditor.', 'success');
    await cargarProductosNormas(true);
  });

  // ---------- verificar o rechazar (solo auditor) ----------
  let revisandoId = null;
  let revisandoDecision = null;

  function abrirRevision(id, decision){
    const pn = buscarPN(id);
    if (!pn) return;
    revisandoId = id;
    revisandoDecision = decision;
    const n = mapaCat.get(pn.norma_id) || { nombre: 'Norma' };
    const rechazo = decision === 'Rechazada';
    $('rvTitulo').textContent = rechazo ? 'Rechazar norma' : 'Verificar norma';
    $('rvInfo').textContent = n.nombre + ' · ' + nombreProductoDe(pn.producto_id);
    $('rvLabel').textContent = rechazo ? 'Motivo del rechazo *' : 'Comentario (opcional)';
    $('rvTexto').value = '';
    $('rvOk').textContent = rechazo ? 'Rechazar' : 'Verificar';
    $('rvOk').className = rechazo ? 'bd' : 'bp';
    marcarCampo('rvTexto', '');
    abrirVentana('modalRev');
    setTimeout(function(){ $('rvTexto').focus(); }, 60);
  }

  $('formRev').addEventListener('submit', async function(e){
    e.preventDefault();
    if (!revisandoId) return;
    const texto = $('rvTexto').value.trim();
    if (revisandoDecision === 'Rechazada' && texto.length < 3) { marcarCampo('rvTexto', 'Explica el motivo del rechazo.'); return; }
    marcarCampo('rvTexto', '');
    const btn = $('rvOk');
    btn.disabled = true;
    const { error } = await supabaseClient.from('producto_normas')
      .update({ estado: revisandoDecision, comentario_revision: texto || null })
      .eq('id', revisandoId);
    btn.disabled = false;
    if (error) { mostrarToast(textoError(error), 'error'); return; }
    cerrarVentana('modalRev');
    mostrarToast(revisandoDecision === 'Verificada' ? 'Norma verificada.' : 'Norma rechazada.', 'success');
    await cargarProductosNormas(true);
    actualizarBadgeRevision();
  });

  // ---------- ayuda guiada para declarar (opciones en vez de escribir) ----------
  const TIPOS_DOC = ['Procedimientos y registros de higiene', 'Certificado ISO 22000', 'Etiqueta del producto', 'Documento sanitario por validar', 'BPM', 'Registro sanitario', 'HACCP', 'Análisis de laboratorio', 'Otro documento'];

  // Sugerencias por norma: ayudan a completar el formulario, pero nunca inventan número ni fechas.
  const SUGERENCIAS_DOC = {
    'NOR-0011': { tipo: 'Procedimientos y registros de higiene', entidad: 'Fabricante / empresa',
      numero: 'Ej. código del procedimiento o registro que vas a presentar',
      emision: 'Fecha de elaboración o última revisión del registro',
      vence: 'Si el documento no vence, consulta al auditor antes de registrar una fecha' },
    'NOR-0014': { tipo: 'Documento sanitario por validar', entidad: '',
      numero: 'No declares hasta confirmar la referencia normativa y el documento aplicable',
      emision: 'Fecha real indicada en el documento, si corresponde',
      vence: 'Fecha real de vencimiento, si corresponde' },
    'NOR-0016': { tipo: 'Certificado ISO 22000', entidad: '',
      numero: 'Número que aparece en el certificado ISO 22000',
      emision: 'Fecha de emisión que aparece en el certificado',
      vence: 'Fecha de vencimiento que aparece en el certificado' },
    'NOR-0018': { tipo: 'Etiqueta del producto', entidad: 'Fabricante / empresa',
      numero: 'Código o versión de la etiqueta aprobada por calidad',
      emision: 'Fecha de aprobación o revisión de la etiqueta',
      vence: 'Si no tiene vencimiento, confirma con el auditor cómo registrarlo' }
  };

  function llenarGuiaDeclaracion(pn, n){
    $('dcIntro').innerHTML = 'Esta norma es <b>' + (pn.obligatoria ? 'obligatoria' : 'recomendada') +
      '</b> para este producto. Revisa qué exige antes de declarar su cumplimiento.';
    $('dcExplicacion').textContent = n.explicacion_usuario || n.descripcion || 'Aún no se ha registrado una explicación sencilla para esta norma. Consulta su texto oficial antes de declarar cumplimiento.';
    $('dcEvidencia').textContent = n.evidencia_requerida || 'El documento exacto aún no está configurado para esta norma. No adjuntes un documento al azar: confirma la evidencia exigida en el texto oficial.';
    $('dcOrientacion').textContent = n.orientacion_documento || '';
    // documento + número (se guardan juntos en "certificado", ej. "BPM 12345")
    let tipo = '', numero = pn.certificado || '';
    TIPOS_DOC.forEach(function(t){
      if (!tipo && (numero === t || numero.indexOf(t + ' ') === 0)) { tipo = t; numero = numero.slice(t.length).trim(); }
    });
    const sugerencia = SUGERENCIAS_DOC[n.codigo] || {};
    if (!pn.certificado && !tipo) {
      const ref = ((n.nombre || '') + ' ' + (n.codigo || '')).toLowerCase();
      if (sugerencia.tipo) tipo = sugerencia.tipo;
      else if (ref.indexOf('bpm') >= 0) tipo = 'BPM';
      else if (ref.indexOf('haccp') >= 0) tipo = 'HACCP';
      else if (ref.indexOf('sanitari') >= 0) tipo = 'Registro sanitario';
      else tipo = 'Otro documento';
    }
    $('dcTipo').value = tipo;
    $('dcCert').value = numero;
    $('dcCert').placeholder = sugerencia.numero || 'Escribe el número, código o nombre real que aparece en la evidencia';
    $('dcEmision').title = sugerencia.emision || 'Usa la fecha real que aparece en el documento';
    $('dcVence').title = sugerencia.vence || 'Usa la fecha real que aparece en el documento';
    // No confundimos la entidad que publica la norma con quien emitió la evidencia.
    const ent = pn.entidad_emisora || sugerencia.entidad || '';
    const sel = $('dcEmisoraSel');
    const hay = Array.prototype.some.call(sel.options, function(o){ return o.value === ent && o.value !== '__otra'; });
    sel.value = hay ? ent : (ent ? '__otra' : '');
    $('dcEmisora').value = hay ? '' : ent;
    $('dcEmisora').style.display = sel.value === '__otra' ? '' : 'none';
  }
  $('dcEmisoraSel').addEventListener('change', function(){
    const otra = $('dcEmisoraSel').value === '__otra';
    $('dcEmisora').style.display = otra ? '' : 'none';
    if (otra) $('dcEmisora').focus(); else $('dcEmisora').value = '';
  });
  function valorEmisora(){
    const v = $('dcEmisoraSel').value;
    return v === '__otra' ? $('dcEmisora').value.trim() : v;
  }

  // vigencia rápida: calcula el vencimiento a partir de la emisión
  function sumarAnios(iso, a){
    const p = iso.split('-').map(Number);
    const f = new Date(p[0] + a, p[1] - 1, p[2]);
    if (f.getMonth() !== p[1] - 1) f.setDate(0);   // 29 de feb. en año no bisiesto
    return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
  }
  function marcarChip(a){
    Array.prototype.forEach.call($('dcVig').querySelectorAll('.gd-chip'), function(c){
      c.classList.toggle('on', a !== null && c.dataset.a === String(a));
    });
  }
  function textoVigencia(){
    const v = $('dcVence').value;
    $('dcVigTxt').textContent = v ? 'Vence el ' + fechaISO(v) + '. Te avisaremos 30 días antes.' : 'Elige la fecha de emisión y cuánto dura el documento.';
  }
  function iniciarVigencia(){
    let act = null;
    const e = $('dcEmision').value, v = $('dcVence').value;
    if (e && v) [1, 2, 3, 5].forEach(function(a){ if (sumarAnios(e, a) === v) act = a; });
    if (act === null && !e && !v) {
      const pnVigencia = buscarPN(declarandoId);
      const preferida = Number(preferenciasDeNorma(pnVigencia && pnVigencia.norma_id).vigencia);
      if ([1, 2, 3, 5].indexOf(preferida) >= 0) act = preferida;
    }
    marcarChip(act);
    textoVigencia();
  }
  $('dcVig').addEventListener('click', function(ev){
    const c = ev.target.closest('.gd-chip');
    if (!c) return;
    const a = Number(c.dataset.a);
    marcarChip(a);
    if (a === 0) { $('dcVence').focus(); return; }
    const e = $('dcEmision').value;
    if (!e) { marcarCampo('dcEmision', 'Primero indica la fecha de emisión.'); marcarChip(null); $('dcEmision').focus(); return; }
    $('dcVence').value = sumarAnios(e, a);
    marcarCampo('dcVence', '');
    textoVigencia();
  });
  $('dcEmision').addEventListener('change', function(){
    const on = $('dcVig').querySelector('.gd-chip.on');
    if (on && on.dataset.a !== '0' && $('dcEmision').value) $('dcVence').value = sumarAnios($('dcEmision').value, Number(on.dataset.a));
    textoVigencia();
  });
  $('dcVence').addEventListener('change', function(){
    const e = $('dcEmision').value, v = $('dcVence').value;
    let act = null;
    if (e && v) [1, 2, 3, 5].forEach(function(a){ if (sumarAnios(e, a) === v) act = a; });
    marcarChip(act);
    textoVigencia();
  });
  // ---------- detalles y valoración (auditor) ----------
  let detId = null;
  function abrirDetalleNorma(id){
    const pn = buscarPN(id);
    if (!pn) return;
    detId = id;
    const n = mapaCat.get(pn.norma_id) || { nombre: 'Norma', codigo: '', entidad: '' };
    $('dtInfo').textContent = n.nombre + ' · ' + nombreProductoDe(pn.producto_id);
    const dato = function(k, v){ return '<div><span>' + k + '</span>' + (v ? escapeHTML(v) : '—') + '</div>'; };
    $('dtDatos').innerHTML =
      dato('Producto', nombreProductoDe(pn.producto_id)) +
      dato('Norma', n.nombre + (n.codigo ? ' (' + n.codigo + ')' : '')) +
      dato('Documento', pn.certificado) +
      dato('Entidad emisora', pn.entidad_emisora) +
      dato('Fecha de emisión', fechaISO(pn.fecha_emision)) +
      dato('Fecha de vencimiento', fechaISO(pn.fecha_vencimiento));
    const hoy = hoyISO();
    const caja = $('dtVig');
    if (!pn.fecha_vencimiento) { caja.className = 'gd-vig pend'; caja.textContent = 'No tiene fecha de vencimiento.'; }
    else if (pn.fecha_vencimiento < hoy) { caja.className = 'gd-vig bad'; caja.textContent = 'Vencido: la fecha de vencimiento ya pasó.'; }
    else {
      const dias = Math.round((new Date(pn.fecha_vencimiento + 'T00:00:00') - new Date(hoy + 'T00:00:00')) / 86400000);
      caja.className = 'gd-vig ' + (dias <= 30 ? 'pend' : 'ok');
      caja.textContent = 'Vigente: faltan ' + dias + (dias === 1 ? ' día' : ' días') + ' para que venza.';
    }
    Array.prototype.forEach.call($('modalDet').querySelectorAll('.gd-ck input'), function(c){ c.checked = false; });
    $('dtTexto').value = '';
    marcarCampo('dtTexto', '');
    abrirVentana('modalDet');
  }
  async function decidirDetalle(decision){
    if (!detId) return;
    const texto = $('dtTexto').value.trim();
    if (decision === 'Rechazada' && texto.length < 3) { marcarCampo('dtTexto', 'Explica el motivo del rechazo.'); return; }
    marcarCampo('dtTexto', '');
    const b1 = $('dtVerificar'), b2 = $('dtRechazar');
    b1.disabled = true; b2.disabled = true;
    const { error } = await supabaseClient.from('producto_normas')
      .update({ estado: decision, comentario_revision: texto || null })
      .eq('id', detId);
    b1.disabled = false; b2.disabled = false;
    if (error) { mostrarToast(textoError(error), 'error'); return; }
    cerrarVentana('modalDet');
    mostrarToast(decision === 'Verificada' ? 'Norma verificada.' : 'Norma rechazada.', 'success');
    await cargarProductosNormas(true);
    actualizarBadgeRevision();
  }
  $('dtVerificar').addEventListener('click', function(){ decidirDetalle('Verificada'); });
  $('dtRechazar').addEventListener('click', function(){ decidirDetalle('Rechazada'); });

  // ---------- arranque ----------
  obtenerRol().then(actualizarBadgeRevision);
  const parametrosNotificacion = new URLSearchParams(window.location.search);
  const controlNotificado = parametrosNotificacion.get('control');
  const productoNotificado = parametrosNotificacion.get('producto');
  irTab(controlNotificado ? 'controles' : (productoNotificado ? 'productos' : (location.hash.slice(1) || 'catalogo')), false);

  // Al llegar desde una notificación, lleva directamente a la fila o producto afectado.
  if (controlNotificado) {
    const tablaNotificada = $('tablaControles');
    const buscarControl = function(){
      const botones = Array.from(tablaNotificada.querySelectorAll('[data-id]'));
      const boton = botones.find(function(el){ return String(el.dataset.id) === String(controlNotificado); });
      if (!boton) return false;
      const fila = boton.closest('tr');
      if (!fila) return false;
      fila.classList.add('resaltado');
      fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { history.replaceState(null, '', window.location.pathname + '#controles'); } catch (e) {}
      return true;
    };
    if (!buscarControl()) {
      const obsControl = new MutationObserver(function(){ if (buscarControl()) obsControl.disconnect(); });
      obsControl.observe(tablaNotificada, { childList: true, subtree: true });
      setTimeout(function(){ obsControl.disconnect(); }, 12000);
    }
  }
  if (productoNotificado) {
    const listaNotificada = $('pdLista');
    const buscarProducto = function(){
      const botones = Array.from(listaNotificada.querySelectorAll('.pcard-h[data-id]'));
      const boton = botones.find(function(el){ return String(el.dataset.id) === String(productoNotificado); });
      if (!boton) return false;
      if (boton.getAttribute('aria-expanded') !== 'true') boton.click();
      boton.closest('.pcard')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { history.replaceState(null, '', window.location.pathname + '#productos'); } catch (e) {}
      return true;
    };
    if (!buscarProducto()) {
      const obsProducto = new MutationObserver(function(){ if (buscarProducto()) obsProducto.disconnect(); });
      obsProducto.observe(listaNotificada, { childList: true, subtree: true });
      setTimeout(function(){ obsProducto.disconnect(); }, 12000);
    }
  }


  // ===================== ADMINISTRACIÓN DEL CATÁLOGO (solo administrador) =====================
  let cmEsAdmin = false;
  const cmQ = function(id){ return document.getElementById(id); };

  async function cmRevisarRol(){
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) return;
      const { data: p } = await supabaseClient.from('perfiles').select('rol').eq('id', user.id).maybeSingle();
      cmEsAdmin = !!(p && p.rol === 'administrador');
      cmQ('catAdminBar').hidden = !cmEsAdmin;
      if (cmEsAdmin) cmCargarDuenos();
    } catch (e) { /* sin sesión: no se muestra */ }
  }

  function cmLlenarSelect(){
    cmQ('cmSelect').innerHTML = '<option value="">— Nueva norma —</option>' + catalogo.map(function(n){
      return '<option value="' + n.id + '">' + escapeHTML(n.codigo + ' · ' + n.nombre) + '</option>';
    }).join('');
  }

  function cmCargarNorma(id){
    const n = id ? catalogo.find(function(x){ return String(x.id) === String(id); }) : null;
    cmQ('cmSelect').value = n ? n.id : '';
    cmQ('cmCodigo').value = n ? n.codigo : '';
    cmQ('cmCodigo').disabled = !!n;
    cmQ('cmNombre').value = n ? n.nombre : '';
    cmQ('cmEntidad').value = n ? n.entidad : '';
    cmQ('cmTipo').value = n ? n.tipo : 'Sanitaria';
    cmQ('cmEstado').value = n ? n.estado : 'Vigente';
    cmQ('cmDesc').value = n ? (n.descripcion || '') : '';
    cmQ('cmExplicacion').value = n ? (n.explicacion_usuario || '') : '';
    cmQ('cmEvidencia').value = n ? (n.evidencia_requerida || '') : '';
    cmQ('cmOrientacion').value = n ? (n.orientacion_documento || '') : '';
    cmEditando = n ? n.id : null;
    cmQ('cmTitulo').textContent = n ? 'Editar norma' : 'Nueva norma';
    document.querySelectorAll('#cmForm [data-cat]').forEach(function(s){
      const r = n && reglas.find(function(x){ return x.norma_id === n.id && x.categoria === s.dataset.cat; });
      s.value = r ? (r.obligatoria ? 'Obligatoria' : 'Recomendada') : '';
    });
    document.querySelectorAll('#cmForm .cm-err').forEach(function(e){ e.remove(); });
  }
  let cmEditando = null;

  function cmAbrir(id){
    cmLlenarSelect();
    cmCargarNorma(id || null);
    cmQ('catModal').classList.add('show');
  }
  function cmCerrar(){ cmQ('catModal').classList.remove('show'); }

  cmQ('btnCatNueva').addEventListener('click', function(){ cmAbrir(null); });
  cmQ('cmCerrar').addEventListener('click', cmCerrar);
  cmQ('cmCancelar').addEventListener('click', cmCerrar);
  cmQ('catModal').addEventListener('click', function(e){ if (e.target === cmQ('catModal')) cmCerrar(); });
  cmQ('cmSelect').addEventListener('change', function(){ cmCargarNorma(this.value || null); });

  cmQ('cmForm').addEventListener('submit', async function(e){
    e.preventDefault();
    if (!cmEsAdmin) { mostrarToastRev('Solo el administrador puede cambiar el catálogo.', 'error'); return; }
    document.querySelectorAll('#cmForm .cm-err').forEach(function(x){ x.remove(); });
    const codigo = cmQ('cmCodigo').value.trim().toUpperCase();
    const nombre = cmQ('cmNombre').value.trim().replace(/\s+/g, ' ');
    const entidad = cmQ('cmEntidad').value.trim();
    const errores = [];
    if (!/^NOR-\d{4}$/.test(codigo)) errores.push('El código debe tener el formato NOR-0019.');
    if (nombre.length < 3) errores.push('Escribe el nombre de la norma.');
    if (!entidad) errores.push('Escribe la entidad que la emite.');
    if (errores.length) { errores.forEach(function(t){ const p = document.createElement('p'); p.className='cm-err'; p.textContent=t; cmQ('cmForm').prepend(p); }); return; }

    const datos = { codigo: codigo, nombre: nombre, entidad: entidad, tipo: cmQ('cmTipo').value,
      estado: cmQ('cmEstado').value, descripcion: cmQ('cmDesc').value.trim() || null,
      explicacion_usuario: cmQ('cmExplicacion').value.trim() || null,
      evidencia_requerida: cmQ('cmEvidencia').value.trim() || null,
      orientacion_documento: cmQ('cmOrientacion').value.trim() || null };
    const reglasNuevas = [];
    document.querySelectorAll('#cmForm [data-cat]').forEach(function(s){
      if (s.value) reglasNuevas.push({ categoria: s.dataset.cat, obligatoria: s.value === 'Obligatoria' });
    });

    cmQ('cmGuardar').disabled = true;
    let id = cmEditando, error = null;
    if (cmEditando) {
      ({ error } = await supabaseClient.from('normas_catalogo').update(datos).eq('id', cmEditando));
    } else {
      const res = await supabaseClient.from('normas_catalogo').insert(datos).select('id').single();
      error = res.error; id = res.data && res.data.id;
    }
    if (!error && id) {
      await supabaseClient.from('norma_categoria').delete().eq('norma_id', id);
      if (reglasNuevas.length) {
        ({ error } = await supabaseClient.from('norma_categoria').insert(
          reglasNuevas.map(function(r){ return { norma_id: id, categoria: r.categoria, obligatoria: r.obligatoria }; })));
      }
    }
    cmQ('cmGuardar').disabled = false;

    if (error) {
      mostrarToastRev(/duplicate|unique/i.test(String(error.message)) ? 'Ya existe una norma con ese código.' : 'No se pudo guardar la norma.', 'error');
      return;
    }
    cmCerrar();
    mostrarToastRev('Norma guardada.', 'success');
    await cargarCatalogo();
  });

  supabaseClient.auth.onAuthStateChange(function(evento){
    if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN') cmRevisarRol();
  });

  // ===================== QUIÉN REGISTRÓ CADA CONTROL (vista del administrador) =====================
  let ctlDueno = new Map();      // id del control -> id del establecimiento
  let perfilNombre = new Map();  // id del establecimiento -> nombre

  async function cmCargarDuenos(){
    try {
      const [c, p] = await Promise.all([
        supabaseClient.from('controles_calidad').select('id,creado_por'),
        supabaseClient.from('perfiles').select('id,nombre,nombre_establecimiento')
      ]);
      if (!c.error && c.data) ctlDueno = new Map(c.data.map(function(x){ return [String(x.id), x.creado_por]; }));
      if (!p.error && p.data) perfilNombre = new Map(p.data.map(function(x){
        return [x.id, x.nombre_establecimiento || x.nombre || 'Sin nombre']; }));
      decorarRegistradoPor();
    } catch (e) { /* sin permiso: no se muestra */ }
  }

  function decorarRegistradoPor(){
    if (!cmEsAdmin) return;
    const tbody = cmQ('tablaControles');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(function(tr){
      const ref = tr.querySelector('[data-id]');
      if (!ref) return;
      const dueno = ctlDueno.get(String(ref.dataset.id));
      const nombre = dueno && perfilNombre.get(dueno);
      const celda = tr.querySelector('td');
      if (!celda) return;
      celda.querySelectorAll('.reg-por').forEach(function(x){ x.remove(); });
      if (nombre) celda.insertAdjacentHTML('beforeend', '<small class="reg-por" style="display:block;color:var(--texto-2)">Registrado por: ' + escapeHTML(nombre) + '</small>');
    });
  }
  new MutationObserver(decorarRegistradoPor).observe(cmQ('tablaControles'), { childList: true });
})();
