/* Vista del administrador — Deep Sea Intelligence
 * Solo afecta a la cuenta con rol "administrador". Para esa cuenta:
 *  - oculta los botones de crear, editar y eliminar;
 *  - muestra un aviso de "solo consulta";
 *  - agrega en cada registro quién lo registró.
 * Para los demás usuarios no cambia nada.
 * Se agrega a cada página con: <script src="vista-administrador.js"></script>
 */
(function(){
  'use strict';

  // Tabla de la base de datos que corresponde a cada página
  const TABLA_DE_PAGINA = {
    'productos.html': 'productos',
    'proveedores.html': 'proveedores',
    'recepciones.html': 'recepciones',
    'almacenamiento.html': 'almacenamientos',
    'ventas.html': 'ventas'
  };
  const pagina = (window.location.pathname.split('/').pop() || '').toLowerCase();
  const tabla = TABLA_DE_PAGINA[pagina];

  const SUPABASE_URL = 'https://lohxgdeuohhczejyxwgr.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_QpRophkYS0o554DGxKBWmQ_P1fs8NPW';

  let cliente = null;
  let esAdmin = false;
  let dueno = new Map();   // id del registro -> id del establecimiento
  let nombre = new Map();  // id del establecimiento -> nombre

  const estilo = document.createElement('style');
  estilo.textContent =
    '.vadm-oculto{display:none!important}' +
    '.vadm-aviso{margin:12px 0 0;padding:11px 16px;border-radius:14px;background:#E8F1FF;border:1px solid #C5DAFB;color:#1B4FB0;font-size:14px;font-weight:600}' +
    '.vadm-por{display:block;font-size:12px;color:#5B7089;margin-top:2px}';
  document.head.appendChild(estilo);

  function escapar(t){
    return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  // Botones de crear, editar, eliminar y ajustar
  const PATRON_CREAR = /^\s*(\+\s*)?(nuev[oa]|nuevo|registrar|agregar|guardar|ajustar|registrar ajuste)/i;
  function ocultarAcciones(){
    document.querySelectorAll('button, a').forEach(function(el){
      const txt = (el.textContent || '').trim();
      const accion = el.getAttribute('data-action') || el.getAttribute('data-accion') || '';
      const esRowAccion = /editar|eliminar|aprobar|rechazar/.test(accion) ||
        el.classList.contains('action-btn') || el.classList.contains('edit-btn') || el.classList.contains('delete-btn');
      const esCrear = (el.classList.contains('b1') || el.classList.contains('bp') || el.id === 'fabNuevo' || el.id === 'btnNuevo' || el.id === 'btnAjuste' || el.classList.contains('fab'))
        && PATRON_CREAR.test(txt) || el.id === 'fabNuevo' || el.id === 'btnNuevo' || el.id === 'btnAjuste' || el.classList.contains('fab');
      if (esRowAccion || esCrear) el.classList.add('vadm-oculto');
    });
  }

  function aviso(){
    if (document.getElementById('vadm-aviso')) return;
    const main = document.querySelector('main');
    if (!main) return;
    const d = document.createElement('div');
    d.id = 'vadm-aviso';
    d.className = 'vadm-aviso';
    d.textContent = 'Vista de administrador: solo consulta de los registros de todos los establecimientos.';
    main.insertBefore(d, main.firstChild);
  }

  // Filas (tabla o tarjetas) con su id de registro
  function filas(){
    const out = [];
    document.querySelectorAll('tbody tr, .pcard, .card-item, [data-id].tarjeta').forEach(function(fila){
      const ref = fila.matches('[data-id]') ? fila : fila.querySelector('[data-id]');
      if (ref) out.push({ fila: fila, id: String(ref.dataset.id) });
    });
    return out;
  }

  function quienRegistro(){
    if (!tabla) return;
    filas().forEach(function(x){
      const d = dueno.get(x.id);
      const n = d && nombre.get(d);
      const existente = x.fila.querySelector('.vadm-por');
      if (!n) { if (existente) existente.remove(); return; }
      const texto = 'Registrado por: ' + n;
      if (existente && existente.textContent === texto) return;
      if (existente) existente.remove();
      const celda = x.fila.matches('tr') ? x.fila.querySelector('td') : x.fila;
      if (celda) {
        const s = document.createElement('small');
        s.className = 'vadm-por';
        s.textContent = texto;
        celda.appendChild(s);
      }
    });
  }

  async function cargarDatos(){
    if (!tabla) return;
    const [r, p] = await Promise.all([
      cliente.from(tabla).select('id,creado_por'),
      cliente.from('perfiles').select('id,nombre,nombre_establecimiento')
    ]);
    if (!r.error && Array.isArray(r.data)) dueno = new Map(r.data.map(function(x){ return [String(x.id), x.creado_por]; }));
    if (!p.error && Array.isArray(p.data)) nombre = new Map(p.data.map(function(x){ return [x.id, x.nombre_establecimiento || x.nombre || 'Sin nombre']; }));
  }

  function ciclo(){
    if (!esAdmin) return;
    ocultarAcciones();
    quienRegistro();
  }

  // En vez de revisar toda la página cada 1,2 s (gasta batería y CPU), se revisa solo cuando la
  // página cambia (se pintan filas, se abre una ventana...), como máximo una vez cada 200 ms.
  let pendiente = false;
  function programar(){
    if (pendiente) return;
    pendiente = true;
    setTimeout(function(){
      pendiente = false;
      ciclo();
    }, 200);
  }
  function vigilar(){
    if (!('MutationObserver' in window)) { setInterval(ciclo, 1500); return; }
    new MutationObserver(programar).observe(document.body, { childList: true, subtree: true });
  }

  // El rol se recuerda mientras dure la pestaña: así no se consulta "perfiles" en cada página.
  const CLAVE_ROL = 'dsi_perfil_rol';
  function rolGuardado(uid){
    try {
      const v = (sessionStorage.getItem(CLAVE_ROL) || '').split(':');
      return v[0] === uid ? v[1] : null;
    } catch (e) { return null; }
  }
  function guardarRol(uid, rol){
    try { sessionStorage.setItem(CLAVE_ROL, uid + ':' + rol); } catch (e) {}
  }

  async function iniciar(){
    if (window.DSI && typeof window.DSI.cliente === 'function') cliente = window.DSI.cliente();
    else if (window.supabase) cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!cliente) return;

    const sesion = await cliente.auth.getSession();   // lectura local, sin red
    const user = sesion.data && sesion.data.session && sesion.data.session.user;
    if (!user) return;

    let rol = rolGuardado(user.id);
    if (!rol) {
      const perfil = await cliente.from('perfiles').select('rol').eq('id', user.id).maybeSingle();
      rol = (perfil.data && perfil.data.rol) || 'otro';
      guardarRol(user.id, rol);
    }
    esAdmin = rol === 'administrador';
    if (!esAdmin) return;

    aviso();
    ocultarAcciones();          // de inmediato, sin esperar los datos
    vigilar();
    await cargarDatos();
    ciclo();
  }

  // Arranca en cuanto el documento está listo (antes esperaba 600 ms de más).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
