/*
 * Cierre automático de sesión por inactividad — Deep Sea Intelligence
 *
 * Si el usuario no usa el sistema durante LIMITE_MIN minutos, se cierra la sesión
 * y vuelve al inicio de sesión. Cinco minutos antes muestra un aviso.
 *
 * Se revisa al mover el mouse, tocar la pantalla, al volver a la pestaña
 * y cada minuto. Requiere que la página ya haya cargado el SDK de Supabase.
 */
(function(){
  'use strict';

  const LIMITE_MIN = 120;   // 2 horas sin actividad
  const AVISO_MIN  = 5;     // aviso 5 minutos antes del cierre

  const CLAVE = 'deepsea_ultima_actividad';
  const CLAVE_MOTIVO = 'deepsea_motivo_cierre';
  if (!window.DSI) return;   // requiere supabase-config.js

  // El SDK puede cargar después (p. ej. recepciones.html lo carga en async): se espera al cliente único.
  let intentos = 0;
  (function esperar(){
    const cliente = window.DSI.cliente();
    if (cliente) { iniciar(cliente); return; }
    if (intentos++ < 200) setTimeout(esperar, 50);
  })();

  function iniciar(cliente){
  const enLogin = /login\.html$/i.test(window.location.pathname) || window.location.pathname === '/';
  const minutosEnMs = m => m * 60 * 1000;

  let ultimaEscritura = 0;
  let avisoEl = null;

  function leerUltima(){
    try { return Number(localStorage.getItem(CLAVE)) || 0; } catch (e) { return 0; }
  }

  // Registra actividad. No se escribe a cada movimiento, y una sesión ya vencida
  // NO se renueva: así, al volver tarde, la revisión la cierra en lugar de reactivarla.
  function marcar(){
    const ahora = Date.now();
    const ultima = leerUltima();
    if (ultima && ahora - ultima >= minutosEnMs(LIMITE_MIN)) return;
    if (ahora - ultimaEscritura < 15000) return;
    ultimaEscritura = ahora;
    try { localStorage.setItem(CLAVE, String(ahora)); } catch (e) {}
    ocultarAviso();
  }

  function mostrarAviso(texto){
    if (!avisoEl) {
      avisoEl = document.createElement('div');
      avisoEl.setAttribute('role', 'alert');
      avisoEl.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));' +
        'transform:translateX(-50%);z-index:9999;max-width:calc(100% - 32px);padding:13px 18px;border-radius:14px;' +
        'background:#062B5B;color:#fff;font:600 14px/1.4 "Segoe UI",Roboto,Arial,sans-serif;' +
        'box-shadow:0 14px 30px rgba(2,16,42,.4);text-align:center;';
      document.body.appendChild(avisoEl);
    }
    avisoEl.textContent = texto;
    avisoEl.style.display = 'block';
  }
  function ocultarAviso(){
    if (avisoEl && avisoEl.dataset.tipo !== 'motivo') avisoEl.style.display = 'none';
  }

  async function cerrarPorInactividad(){
    try {
      localStorage.removeItem(CLAVE);
      sessionStorage.setItem(CLAVE_MOTIVO, 'inactividad');
    } catch (e) {}
    try { await cliente.auth.signOut(); } catch (e) {}
    window.location.replace('login.html');
  }

  async function revisar(){
    let sesion = null;
    try {
      const { data } = await cliente.auth.getSession();
      sesion = data.session;
    } catch (e) { return; }
    if (!sesion) return;                 // sin sesión no hay nada que cerrar

    const ultima = leerUltima();
    if (!ultima) { marcar(); return; }   // primera vez: empieza a contar

    const pasado = Date.now() - ultima;
    if (pasado >= minutosEnMs(LIMITE_MIN)) {
      cerrarPorInactividad();
    } else if (pasado >= minutosEnMs(LIMITE_MIN - AVISO_MIN)) {
      const restantes = Math.max(1, Math.ceil((minutosEnMs(LIMITE_MIN) - pasado) / 60000));
      mostrarAviso('Tu sesión se cerrará en ' + restantes + ' min por inactividad. Toca la pantalla para continuar.');
    } else {
      ocultarAviso();
    }
  }

  // ---- Actividad del usuario ----
  ['mousemove', 'keydown', 'pointerdown', 'touchstart', 'scroll', 'click'].forEach(function(ev){
    window.addEventListener(ev, marcar, { passive: true });
  });

  // ---- Volver a la pestaña: primero se revisa, luego se registra actividad ----
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) revisar(); });
  window.addEventListener('focus', revisar);
  window.addEventListener('pageshow', revisar);

  // ---- Estado de la sesión ----
  cliente.auth.onAuthStateChange(function(evento){
    if (evento === 'SIGNED_OUT') {
      try { localStorage.removeItem(CLAVE); } catch (e) {}
    }
    // Solo cuenta como inicio de sesión real cuando se hace desde la pantalla de login
    if (evento === 'SIGNED_IN' && enLogin) {
      ultimaEscritura = 0;
      try { localStorage.setItem(CLAVE, String(Date.now())); } catch (e) {}
    }
  });

  // ---- Aviso en el login si la sesión se cerró por inactividad ----
  if (enLogin) {
    let motivo = null;
    try { motivo = sessionStorage.getItem(CLAVE_MOTIVO); sessionStorage.removeItem(CLAVE_MOTIVO); } catch (e) {}
    if (motivo === 'inactividad') {
      document.addEventListener('DOMContentLoaded', function(){
        mostrarAviso('Tu sesión se cerró por inactividad. Vuelve a iniciar sesión.');
        if (avisoEl) avisoEl.dataset.tipo = 'motivo';
      });
    }
  }

  // ---- Arranque ----
  setInterval(revisar, 60 * 1000);
  revisar();
  }
})();
