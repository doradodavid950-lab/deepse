/* ==========================================================
   Lógica del módulo: configuracion.html
   Extraída del HTML sin cambios: mismo código y mismo orden de ejecución.
   ========================================================== */
(function(){
  'use strict';
  const CLAVE = 'dsi_prefs_v1';
  const DEF = { campana:true, stock:true, resultados:true, nuevos:true, revisar:true, auto:true, ventaTipo:'', ventaCanal:'', ventaDestinoAuto:true, papel:'a4' };
  // Las pantallas leen estos dos interruptores con su propia clave; se mantienen iguales a los de aquí
  const K_NOTIF = 'deepsea_notificaciones', K_AUTO = 'deepsea_actualizacion';
  const $ = function(id){ return document.getElementById(id); };

  function leer(){
    let p;
    try { p = Object.assign({}, DEF, JSON.parse(localStorage.getItem(CLAVE) || '{}')); }
    catch (e) { p = Object.assign({}, DEF); }
    try {
      const n = localStorage.getItem(K_NOTIF), a = localStorage.getItem(K_AUTO);
      if (n !== null) p.campana = n !== 'off';
      if (a !== null) p.auto = a !== 'off';
    } catch (e) {}
    return p;
  }
  function guardar(p){
    try {
      localStorage.setItem(CLAVE, JSON.stringify(p));
      localStorage.setItem(K_NOTIF, p.campana ? 'on' : 'off');
      localStorage.setItem(K_AUTO, p.auto ? 'on' : 'off');
    } catch (e) {}
  }
  function avisar(t){
    const el = $('cfOk'); el.textContent = t; el.classList.add('on');
    clearTimeout(avisar.t); avisar.t = setTimeout(function(){ el.classList.remove('on'); }, 1800);
  }
  function pintar(){
    const p = leer();
    document.querySelectorAll('[data-pref]').forEach(function(el){ el.checked = !!p[el.dataset.pref]; });
    document.querySelectorAll('[data-pref-sel]').forEach(function(el){ el.value = p[el.dataset.prefSel] || ''; });
  }

  document.querySelectorAll('[data-pref]').forEach(function(el){
    el.addEventListener('change', function(){
      const p = leer(); p[el.dataset.pref] = el.checked; guardar(p); avisar('Cambio guardado');
    });
  });

  document.querySelectorAll('[data-pref-sel]').forEach(function(el){
    el.addEventListener('change', function(){
      const p = leer(); p[el.dataset.prefSel] = el.value; guardar(p); avisar('Cambio guardado');
    });
  });

  function red(){
    const on = navigator.onLine;
    $('cfRed').textContent = on ? 'En línea' : 'Sin conexión';
    $('cfRedPunto').classList.toggle('off', !on);
  }
  window.addEventListener('online', red);
  window.addEventListener('offline', red);
  red();

  $('cfRestablecer').addEventListener('click', function(){
    guardar(Object.assign({}, DEF)); pintar(); avisar('Valores restablecidos');
  });

  function tamano(){
    if (!navigator.storage || !navigator.storage.estimate) { $('cfCache').textContent = 'No disponible'; return; }
    navigator.storage.estimate().then(function(e){
      const mb = (e.usage || 0) / 1048576;
      $('cfCache').textContent = mb < 0.1 ? 'Menos de 0.1 MB' : mb.toFixed(1) + ' MB';
    }).catch(function(){ $('cfCache').textContent = 'No disponible'; });
  }

  $('cfBorrarCache').addEventListener('click', function(){
    if (!('caches' in window)) { avisar('Este navegador no guarda caché'); return; }
    caches.keys().then(function(ks){ return Promise.all(ks.map(function(k){ return caches.delete(k); })); })
      .then(function(){ avisar('Caché borrada. Se recargará la app'); tamano(); setTimeout(function(){ location.reload(); }, 900); })
      .catch(function(){ avisar('No se pudo borrar la caché'); });
  });

  // ---------- Nombre y avatar del encabezado ----------
  // Las demás páginas pintan estos datos; aquí faltaba, por eso se quedaba en "Cargando..."
  function pintarUsuario(u, perfil){
    const meta = u.user_metadata || {};
    const nombre = ((perfil && perfil.nombre) || meta.full_name || meta.name || (u.email || '').split('@')[0] || 'Usuario').trim() || 'Usuario';
    $('topUserName').textContent = nombre;
    $('topAvatar').textContent = nombre.charAt(0).toUpperCase();
  }

  async function cargarUsuario(){
    let cliente = null;
    for (let i = 0; i < 40 && !(cliente = window.DSI && window.DSI.cliente && window.DSI.cliente()); i++) {
      await new Promise(function(r){ setTimeout(r, 50); });   // espera a que cargue el SDK
    }
    if (!cliente) { $('topUserName').textContent = 'Usuario'; return; }
    try {
      const res = await cliente.auth.getSession();
      const session = res.data && res.data.session;
      if (!session) { window.location.replace('login.html'); return; }
      pintarUsuario(session.user, null);                      // al instante, con los datos de la sesión
      const r = await cliente.from('perfiles').select('nombre').eq('id', session.user.id).maybeSingle();
      if (r && r.data && r.data.nombre) pintarUsuario(session.user, r.data);
    } catch (err) {
      console.error('No se pudo cargar el usuario:', err);
      if ($('topUserName').textContent.trim() === 'Cargando...') $('topUserName').textContent = 'Usuario';
    }
  }

  cargarUsuario();
  pintar();
  tamano();
})();
