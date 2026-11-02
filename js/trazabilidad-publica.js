/* ==========================================================
   Lógica del módulo: trazabilidad-publica.html
   Extraída del HTML sin cambios: mismo código y mismo orden de ejecución.
   ========================================================== */
(function(){
  'use strict';

  const $ = id => document.getElementById(id);
  const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function escapeHTML(t){
    return String(t ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }
  function normalizar(t){
    return String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  // Fechas tipo "2026-10-21" se leen como fecha local (evita el día anterior)
  function fecha(v){
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [a, m, d] = v.split('-').map(Number); return new Date(a, m - 1, d); }
    const f = new Date(v);
    return isNaN(f.getTime()) ? null : f;
  }
  function fmtFecha(v){
    const f = fecha(v);
    return f ? f.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  }
  function fmtFechaHora(v){
    const f = fecha(v);
    if (!f) return '—';
    const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(v);
    return soloFecha ? fmtFecha(v) : f.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function fmtPeso(n){
    return (Math.round(Number(n || 0) * 100) / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' kg';
  }
  function fmtTemp(n){
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' °C';
  }

  const ICONO = {
    captura: '<svg class="i" aria-hidden="true"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/></svg>',
    recepcion: '<svg class="i" aria-hidden="true"><rect x="2" y="6" width="12" height="10" rx="1"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
    calidad: '<svg class="i" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    almacen: '<svg class="i" aria-hidden="true"><path d="M3 9.5 12 4l9 5.5V20H3z"/><path d="M8 20v-6h8v6"/></svg>'
  };

  function esAprobado(resultado){
    return normalizar(resultado).includes('aprob');
  }

  function pintar(d){
    const p = d.producto || {}, l = d.lote || {};
    const alm = Array.isArray(d.almacenamiento) ? d.almacenamiento : [];
    const cal = Array.isArray(d.calidad) ? d.calidad : [];

    $('pNombre').textContent = p.nombre || 'Producto';
    $('pCientifico').textContent = p.nombre_cientifico || '';
    $('pCientifico').hidden = !p.nombre_cientifico;
    $('pCategoria').textContent = [p.categoria ? 'Categoría: ' + p.categoria : '', l.codigo ? 'Lote ' + l.codigo : ''].filter(Boolean).join(' · ');
    $('sOrigen').textContent = p.origen || '—';
    $('sPeso').textContent = fmtPeso(l.peso);
    $('sEstado').textContent = l.estado || '—';

    // Verificación: solo cuenta si un auditor la aprobó (no el resultado del laboratorio)
    const verif = $('verif');
    const v = d.verificacion;
    const veredicto = d.veredicto || (v ? 'verificado' : 'pendiente');
    if (veredicto === 'verificado') {
      verif.classList.remove('pend');
      $('verifTitulo').textContent = 'Lote verificado' + (v && v.auditor ? ' por ' + v.auditor : '');
      $('verifTexto').textContent = 'Aprobado por un auditor' + (v && v.fecha ? ' el ' + fmtFecha(v.fecha) : '') + '.';
    } else if (veredicto === 'no_verificado') {
      // Mensaje neutro: el público no necesita el detalle interno de la revisión
      verif.classList.add('pend');
      $('verifTitulo').textContent = 'Lote sin verificación vigente';
      $('verifTexto').textContent = 'Este lote no cuenta con una verificación aprobada. Consulta con el establecimiento antes de consumirlo.';
    } else {
      verif.classList.add('pend');
      $('verifTitulo').textContent = 'Pendiente de verificación';
      $('verifTexto').textContent = 'Este lote aún no ha sido verificado por un auditor.';
    }

    // Recorrido: captura → recepción → calidad → almacenamiento
    const pasos = [];

    pasos.push(`<div class="tl-item"><div class="tl-circle azul">${ICONO.captura}</div>
      <div class="tl-box"><div class="tl-top"><h3>Captura</h3><time>${fmtFecha(p.fecha_captura)}</time></div>
      <p>Producto capturado${p.origen ? ' en <b>' + escapeHTML(p.origen) + '</b>' : ''}.</p></div></div>`);

    pasos.push(`<div class="tl-item"><div class="tl-circle verde">${ICONO.recepcion}</div>
      <div class="tl-box"><div class="tl-top"><h3>Recepción</h3><time>${fmtFechaHora(l.fecha_recepcion)}</time></div>
      <p>${l.proveedor ? 'Proveedor: <b>' + escapeHTML(l.proveedor) + '</b>. ' : ''}Peso recibido: ${fmtPeso(l.peso)}. Estado: ${escapeHTML(l.estado || '—')}.</p></div></div>`);

    pasos.push(`<div class="tl-item"><div class="tl-circle morado">${ICONO.calidad}</div>
      <div class="tl-box"><div class="tl-top"><h3>Control de calidad</h3><time>${cal.length ? fmtFecha(cal[0].fecha) : 'Pendiente'}</time></div>
      ${cal.length
        ? '<ul>' + cal.map(c => `<li><span>${fmtFechaHora(c.fecha)} · ${escapeHTML(c.estado_revision || 'Pendiente')}</span><b>${escapeHTML(c.resultado || '—')}</b></li>`).join('') + '</ul>'
        : '<p>Aún no hay controles registrados para este lote.</p>'}
      </div></div>`);

    pasos.push(`<div class="tl-item"><div class="tl-circle naranja">${ICONO.almacen}</div>
      <div class="tl-box"><div class="tl-top"><h3>Almacenamiento</h3><time>${alm.length ? fmtFecha(alm[0].fecha) : 'Pendiente'}</time></div>
      ${alm.length
        ? '<ul>' + alm.map(a => `<li><span>${escapeHTML(a.ubicacion || 'Ubicación sin registrar')} · ${fmtFechaHora(a.fecha)}</span><b>${fmtTemp(a.temperatura)}</b></li>`).join('') + '</ul>'
        : '<p>Aún no hay registros de almacenamiento.</p>'}
      </div></div>`);

    $('timeline').innerHTML = pasos.join('');
    mostrar('contenido');
    document.title = (p.nombre ? p.nombre + ' — ' : '') + 'Trazabilidad · Deep Sea';
  }

  function mostrar(vista, opciones){
    $('vCargando').hidden = vista !== 'cargando';
    $('vVacio').hidden    = vista !== 'vacio';
    $('vContenido').hidden = vista !== 'contenido';
    if (vista === 'vacio') {
      const o = opciones || {};
      $('vVacioTitulo').textContent = o.titulo || 'No encontramos este lote';
      $('vVacioTexto').textContent  = o.texto || 'Revisa que el código esté completo o pide uno nuevo a quien te vendió el producto.';
      $('btnReintentar').hidden = !o.reintentar;
    }
  }

  let lote = null;

  // Lee el lote SOLO a través de la función pública trazabilidad_publica
  async function consultar(){
    mostrar('cargando');
    if (!lote) {
      mostrar('vacio', { titulo: 'Falta el código del lote', texto: 'Escanea el código QR que está en el empaque del producto.' });
      return;
    }
    if (!REGEX_UUID.test(lote)) {
      mostrar('vacio', { titulo: 'El código no es válido', texto: 'Revisa que el código QR esté completo o escanéalo de nuevo.' });
      return;
    }

    let res;
    try {
      const cliente = DSI.cliente();
      res = await Promise.race([
        cliente.rpc('trazabilidad_publica', { p_lote: lote }),
        new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('tiempo')), 15000))
      ]);
    } catch (err) {
      console.error('Error consultando el lote:', err);
      mostrar('vacio', { titulo: 'No se pudo consultar', texto: 'Revisa tu conexión a internet e intenta de nuevo.', reintentar: true });
      return;
    }

    if (res.error) {
      console.error('Error de la función pública:', res.error);
      mostrar('vacio', { titulo: 'No se pudo consultar', texto: 'Intenta de nuevo en unos minutos.', reintentar: true });
      return;
    }
    if (!res.data) {
      mostrar('vacio', { titulo: 'No encontramos este lote', texto: 'El código no corresponde a ningún lote registrado.' });
      return;
    }
    pintar(res.data);
  }

  $('btnReintentar').addEventListener('click', consultar);

  // El código viene en la dirección: trazabilidad-publica.html?lote=ID
  lote = new URLSearchParams(window.location.search).get('lote');
  if (lote) lote = lote.trim();

  if (typeof window.supabase === 'undefined') {
    mostrar('vacio', { titulo: 'No se pudo cargar la página', texto: 'Revisa tu conexión a internet e intenta de nuevo.', reintentar: true });
    $('btnReintentar').addEventListener('click', () => window.location.reload(), { once: true });
  } else {
    consultar();
  }
})();
