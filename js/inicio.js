/* ==========================================================
   Lógica del módulo: inicio.html
   Extraída del HTML sin cambios: mismo código y mismo orden de ejecución.
   ========================================================== */
(function(){
  'use strict';

  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------------
  // Si el SDK de Supabase no cargó (sin internet), se avisa y se
  // ofrece recargar, en vez de dejar la pantalla a medias.
  // ---------------------------------------------------------------
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
    // Si las notificaciones están desactivadas, la campana no se muestra
    $('notifWrap').hidden = leerPref(PREF_NOTIF, 'on') === 'off';
  }

  // ---------------------------------------------------------------
  // ESTADO DE LA PÁGINA
  // ---------------------------------------------------------------
  let usuarioActual = null;
  let datos = { productos: [], proveedores: [], recepciones: [], totalRecepciones: 0, inventario: [] };
  let datosListos = false;        // ya hay algo que mostrar (caché o datos frescos)
  let errorCarga = false;
  let cargando = false;
  let ultimaActualizacion = 0;
  let notifsActuales = [];
  let firmaPintada = '';          // evita volver a dibujar si los datos no cambiaron

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

  // ---------------------------------------------------------------
  // USUARIO Y ENCABEZADO
  // ---------------------------------------------------------------
  function saludar(){
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : (h < 19 ? 'Buenas tardes' : 'Buenas noches');
  }

  function colocarFecha(){
    $('todayDate').textContent = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  function pintarUsuario(){
    const u = usuarioActual;
    const nombre = (u.user_metadata?.full_name || u.user_metadata?.name || (u.email || '').split('@')[0] || 'Usuario').trim() || 'Usuario';
    const inicial = nombre.charAt(0).toUpperCase();
    $('topUserName').textContent = nombre;
    $('topAvatar').textContent   = inicial;
    $('saludo').textContent      = saludar() + ', ' + nombre.split(/\s+/)[0];
  }

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
  // Son solo 3 consultas, en paralelo; todo lo demás (peso, recientes,
  // gráfica, alertas, notificaciones, buscador) se calcula con esos datos.
  // ---------------------------------------------------------------
  async function actualizarDatos(){
    if (cargando) return;
    cargando = true;
    $('syncEstado').textContent = 'Actualizando…';
    let hayError = false;

    // Si la conexión se queda colgada, a los 15 s se considera un error
    // y se puede reintentar (antes la pantalla podía quedar bloqueada).
    let temporizador;
    const tiempoAgotado = new Promise(function(_, rechazar){
      temporizador = setTimeout(function(){ rechazar(new Error('Tiempo de espera agotado')); }, 15000);
    });

    try {
      const [prod, prov, rec, inv] = await Promise.race([Promise.all([
        supabaseClient.from('productos').select('id,nombre,nombre_cientifico,categoria,estado'),
        supabaseClient.from('proveedores').select('id,nombre,estado'),
        supabaseClient
          .from('recepciones')
          .select('id,producto_id,peso,estado_producto,fecha_recepcion,productos(nombre)', { count: 'exact' })
          // nullsFirst:false → las recepciones sin fecha no aparecen como "las más recientes"
          .order('fecha_recepcion', { ascending: false, nullsFirst: false }),
        supabaseClient.from('inventario_productos').select('producto_id,nombre,disponible,estado_stock')
      ]), tiempoAgotado]);

      if (prod.error) { hayError = true; console.error('Error productos:', prod.error); }
      else datos.productos = prod.data || [];

      if (prov.error) { hayError = true; console.error('Error proveedores:', prov.error); }
      else datos.proveedores = prov.data || [];

      if (inv && !inv.error) datos.inventario = inv.data || [];
      else if (inv) console.warn('Error inventario:', inv.error);

      if (rec.error) { hayError = true; console.error('Error recepciones:', rec.error); }
      else {
        datos.recepciones = rec.data || [];
        datos.totalRecepciones = rec.count ?? datos.recepciones.length;
      }
    } catch (err) {
      hayError = true;
      console.error('Error cargando dashboard:', err);
    } finally {
      clearTimeout(temporizador);
    }

    cargando = false;
    errorCarga = hayError;
    datosListos = true;

    if (hayError) {
      mostrarAviso('No se pudieron actualizar algunos datos. Revisa tu conexión.');
      $('syncEstado').textContent = 'Sin actualizar';
    } else {
      ocultarAviso();
      podarLeidas();          // limpia notificaciones leídas que ya no existen
      guardarCache();
      ultimaActualizacion = Date.now();
      $('syncEstado').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    }

    pintarDashboard();
  }

  // ---------------------------------------------------------------
  // PINTAR LA PANTALLA
  // ---------------------------------------------------------------
  function pintarDashboard(){
    if (!datosListos) return;

    // Si los datos son idénticos a los ya dibujados, no se repite el trabajo
    // (ahorra batería y evita parpadeos en celulares y equipos lentos).
    const firma = JSON.stringify(datos) + '|' + errorCarga;
    if (firma === firmaPintada) return;
    firmaPintada = firma;

    const { productos, proveedores, recepciones } = datos;

    animarNumero($('totalProductos'),   productos.length,   fmtNumero);
    animarNumero($('totalProveedores'), proveedores.length, fmtNumero);
    animarNumero($('totalRecepciones'), datos.totalRecepciones || recepciones.length, fmtNumero);

    const peso = recepciones.reduce((t, r) => t + (Number(r.peso) || 0), 0);
    animarNumero($('pesoTotal'), peso, fmtPeso);

    pintarHero();
    pintarSemana();
    pintarActividad();
    pintarDistribucion();
    pintarAlertas();
    renderNotificaciones();
  }

  // Números de la bienvenida: recepciones de hoy y % aprobadas
  function pintarHero(){
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const deHoy = datos.recepciones.filter(r => {
      const f = parsearFecha(r.fecha_recepcion);
      if (!f) return false;
      f.setHours(0, 0, 0, 0);
      return f.getTime() === hoy.getTime();
    }).length;
    $('heroHoy').textContent = fmtNumero(deHoy);

    const total = datos.recepciones.length;
    if (!total) { $('heroOk').textContent = '–'; return; }
    const ok = datos.recepciones.filter(r => clasificarEstado(r.estado_producto || 'Recibido') === 'ok').length;
    $('heroOk').textContent = Math.round((ok / total) * 100) + '%';
  }

  // Gráfica de los últimos 7 días (kilos recibidos por día)
  function pintarSemana(){
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoy); d.setDate(hoy.getDate() - i);
      dias.push({ fecha: d, kg: 0 });
    }
    datos.recepciones.forEach(r => {
      const f = parsearFecha(r.fecha_recepcion);
      if (!f) return;
      f.setHours(0, 0, 0, 0);
      const dia = dias.find(d => d.fecha.getTime() === f.getTime());
      if (dia) dia.kg += Number(r.peso) || 0;
    });

    const totalSemana = dias.reduce((t, d) => t + d.kg, 0);
    $('semanaTotal').textContent = totalSemana ? 'Total: ' + fmtPeso(totalSemana) : '';
    $('chartVacio').classList.toggle('show', !totalSemana);

    const svg = $('chartSvg');
    const W = Math.max(260, Math.round($('chartBox').clientWidth || 600));
    const H = 150, padX = 22, top = 24, base = 118;
    const max = Math.max(...dias.map(d => d.kg), 1);
    const paso = (W - padX * 2) / 6;
    const pts = dias.map((d, i) => ({ x: padX + i * paso, y: base - (d.kg / max) * (base - top) }));

    // Línea suave (curva Catmull-Rom convertida a Bézier)
    let linea = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      linea += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    const area = `${linea} L${pts[6].x.toFixed(1)} ${base} L${pts[0].x.toFixed(1)} ${base} Z`;

    const iMax = dias.findIndex(d => d.kg === max && d.kg > 0);
    const etiquetas = dias.map((d, i) => {
      const nom = d.fecha.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
      return `<text x="${pts[i].x.toFixed(1)}" y="143" text-anchor="middle" font-size="12" fill="#7A90AB">${escapeHTML(capitalizar(nom))}</text>`;
    }).join('');
    const marcador = iMax > -1
      ? `<circle cx="${pts[iMax].x.toFixed(1)}" cy="${pts[iMax].y.toFixed(1)}" r="6" fill="#fff" stroke="#1E66F5" stroke-width="4"/>
         <text x="${pts[iMax].x.toFixed(1)}" y="${(pts[iMax].y - 12).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#062B5B">${escapeHTML(fmtPeso(dias[iMax].kg))}</text>`
      : '';

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <defs>
        <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1E66F5" stop-opacity=".42"/><stop offset="1" stop-color="#3FD0F2" stop-opacity="0"/></linearGradient>
        <linearGradient id="gLinea" x1="0" x2="1"><stop offset="0" stop-color="#1E66F5"/><stop offset="1" stop-color="#3FD0F2"/></linearGradient>
      </defs>
      <g stroke="#E4ECF6"><path d="M0 ${top}H${W}M0 ${(top + base) / 2}H${W}M0 ${base}H${W}"/></g>
      <path d="${area}" fill="url(#gArea)"/>
      <path d="${linea}" fill="none" stroke="url(#gLinea)" stroke-width="4" stroke-linecap="round"/>
      ${marcador}${etiquetas}`;
  }

  function pintarActividad(){
    const tabla = $('recentTable');
    const filas = datos.recepciones.slice(0, 5).map(r => {
      const estado = r.estado_producto || 'Recibido';
      const prod = Array.isArray(r.productos) ? r.productos[0] : r.productos;
      return `<tr>
        <td>${escapeHTML(prod?.nombre || 'Producto')}</td>
        <td>${fmtPeso(Number(r.peso) || 0)}</td>
        <td><span class="pill ${clasificarEstado(estado)}">${escapeHTML(estado)}</span></td>
        <td class="hide-s">${formatearFecha(r.fecha_recepcion)}</td>
      </tr>`;
    }).join('');

    const vacio = errorCarga ? 'No se pudo cargar la información.' : 'No hay recepciones registradas.';
    tabla.innerHTML = filas || `<tr><td colspan="4" class="empty">${vacio}</td></tr>`;
  }

  function pintarDistribucion(){
    const productos = datos.productos;
    const total = productos.length;
    $('donutTotal').textContent = fmtNumero(total);

    const donut  = $('productDonut');
    const legend = $('donutLegend');

    if (!total) {
      donut.style.background = '#D9ECFF';
      legend.innerHTML = '<div><span class="swatch" style="background:#1E66F5"></span><span>Sin productos registrados</span></div>';
      return;
    }

    // Se agrupa sin importar mayúsculas ni tildes ("Peces" = "peces")
    const grupos = new Map();
    productos.forEach(p => {
      const nombre = (p.categoria || '').trim() || 'Otros';
      const clave = normalizar(nombre);
      const g = grupos.get(clave);
      if (g) g.n++; else grupos.set(clave, { nombre: capitalizar(nombre), n: 1 });
    });

    const ordenados = [...grupos.values()].sort((a, b) => b.n - a.n);
    const principales = ordenados.slice(0, 4);
    const resto = ordenados.slice(4).reduce((s, g) => s + g.n, 0);
    if (resto > 0) principales.push({ nombre: 'Otras categorías', n: resto });

    const colores = ['#1E66F5', '#17A673', '#FFA94D', '#7B5CC7', '#9AA8BD'];

    let acumulado = 0;
    const tramos = principales.map((g, i) => {
      const inicio = acumulado;
      acumulado += (g.n / total) * 100;
      return `${colores[i]} ${inicio}% ${acumulado}%`;
    });
    donut.style.background = `conic-gradient(${tramos.join(',')})`;

    legend.innerHTML = principales.map((g, i) => `
      <div>
        <span class="swatch" style="background:${colores[i]}"></span>
        <span>${escapeHTML(g.nombre)} — ${Math.round((g.n / total) * 100)}%</span>
      </div>`).join('');
  }

  function iconoAlerta(tipo){
    if (tipo === 'ok') {
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 10v6" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="7" r=".8" fill="currentColor"/></svg>';
  }

  function pintarAlertas(){
    const { productos, proveedores, recepciones } = datos;
    const alertas = [];

    const problemas   = recepciones.filter(r => clasificarEstado(r.estado_producto) === 'warn').length;
    const pendientes  = recepciones.filter(r => clasificarEstado(r.estado_producto) === 'pend').length;
    const prodInact   = productos.filter(p => normalizar(p.estado) === 'inactivo').length;
    const provInact   = proveedores.filter(p => normalizar(p.estado) === 'inactivo').length;

    if (problemas)  alertas.push({ tipo: 'err',  titulo: 'Recepciones con problemas', texto: `${problemas} recepción(es) rechazada(s) o dañada(s).`, href: 'recepciones.html' });
    if (pendientes) alertas.push({ tipo: 'warn', titulo: 'Recepciones pendientes',    texto: `${pendientes} recepción(es) requieren revisión.`,       href: 'recepciones.html' });
    if (prodInact)  alertas.push({ tipo: 'warn', titulo: 'Productos inactivos',       texto: `${prodInact} producto(s) están marcados como inactivos.`, href: 'productos.html' });
    if (provInact)  alertas.push({ tipo: 'info', titulo: 'Proveedores inactivos',     texto: `${provInact} proveedor(es) están marcados como inactivos.`, href: 'proveedores.html' });
    const inv = datos.inventario || [];
    const agotados = inv.filter(i => i.estado_stock === 'Agotado');
    const bajos    = inv.filter(i => i.estado_stock === 'Bajo');
    if (agotados.length) alertas.push({ tipo: 'err', titulo: 'Productos agotados',
      texto: `${agotados.length} sin stock: ${agotados.slice(0, 3).map(i => i.nombre).join(', ')}${agotados.length > 3 ? '…' : ''}.`,
      href: 'almacenamiento.html' });
    if (bajos.length) alertas.push({ tipo: 'warn', titulo: 'Stock bajo',
      texto: `${bajos.length} producto(s) por debajo del mínimo.`, href: 'almacenamiento.html' });

    if (!alertas.length) {
      if (!productos.length && !proveedores.length && !recepciones.length) {
        alertas.push({ tipo: 'info', titulo: 'Sistema listo', texto: 'Todavía no hay registros. Puedes comenzar desde Productos.', href: 'productos.html' });
      } else {
        alertas.push({ tipo: 'ok', titulo: 'Sistema funcionando', texto: 'No hay alertas pendientes en los registros actuales.', href: 'inicio.html' });
      }
    }

    $('alertsContainer').innerHTML = alertas.slice(0, 4).map(a => `
      <a class="alert-item" href="${escapeHTML(a.href)}">
        <div class="alert-icon a-${a.tipo}">${iconoAlerta(a.tipo)}</div>
        <div class="alert-text">
          <strong>${escapeHTML(a.titulo)}</strong>
          <span>${escapeHTML(a.texto)}</span>
        </div>
      </a>`).join('');
  }

  // La gráfica se ajusta al ancho disponible cuando se gira el celular o cambia la ventana
  let temporizadorAjuste;
  window.addEventListener('resize', function(){
    clearTimeout(temporizadorAjuste);
    temporizadorAjuste = setTimeout(function(){ if (datosListos) pintarSemana(); }, 150);
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
  // SESIÓN
  // ---------------------------------------------------------------
  // Si la sesión se cierra (en esta u otra pestaña), se vuelve al login
  supabaseClient.auth.onAuthStateChange(function(evento){
    if (evento === 'SIGNED_OUT') window.location.replace('login.html');
  });

  // Botón "Reintentar" del aviso
  $('avisoBtn').addEventListener('click', actualizarDatos);

  // ---------------------------------------------------------------
  // REFRESCO AUTOMÁTICO
  // Al volver a la pestaña, al volver desde otro módulo o al recuperar
  // internet, los datos y las notificaciones se actualizan solos.
  // ---------------------------------------------------------------
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
    colocarFecha();

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
      datos = cache;
      datosListos = true;
      pintarDashboard();
    }

    // 2) Se piden los datos frescos en segundo plano
    await actualizarDatos();
  }

  iniciar();
})();
