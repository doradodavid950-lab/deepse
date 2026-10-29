/* Menú del avatar — Deep Sea Intelligence
 * Un solo archivo para TODAS las páginas con encabezado. Se agrega antes de </body>:
 *   <script src="menu-usuario.js" defer></script>
 *
 * Qué hace:
 *  - Computador: al tocar el avatar (#userChip) se despliega un panel con Mi cuenta, Ayuda y Cerrar sesión.
 *  - Celular: el avatar pequeño (#userMini) abre una hoja desde abajo con el mismo contenido (Mi cuenta, Ayuda y Cerrar sesión).
 *  - Cerrar sesión pide confirmación, cierra en Supabase y limpia los datos guardados del dispositivo.
 *  - Registra el service worker (sw.js) para que las visitas siguientes carguen casi al instante.
 * No depende de la página: crea su propio HTML y estilos (los estilos del panel están en estilos.css).
 */
(function(){
  'use strict';
  if (window.__dsiMenuUsuario) return;
  window.__dsiMenuUsuario = true;

  const chip = document.getElementById('userChip');
  const mini = document.getElementById('userMini');
  if (chip || mini) montarMenu();
  registrarSW();

  function montarMenu(){
    const movil = window.matchMedia('(max-width:1000px)');
    const ic = {
      user: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
      help: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.7.4-1.1.9-1.1 1.8"/><circle cx="12" cy="17" r=".6"/></svg>',
      out:  '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M16 8l4 4-4 4M20 12H9"/></svg>'
    };

    const fondo = document.createElement('div');
    fondo.className = 'um-fondo';
    fondo.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'um-panel';
    panel.id = 'userMenu';
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', 'Menú de usuario');
    panel.hidden = true;
    panel.innerHTML =
      '<div class="um-cab">' +
        '<div class="um-av av" id="umAv">C</div>' +
        '<div class="um-quien"><b id="umNombre">Usuario</b><span id="umCorreo"></span></div>' +
      '</div>' +
      '<a class="um-item" role="menuitem" href="cuenta.html"><span class="um-ic um-ic-az">' + ic.user + '</span><span class="um-tx"><b>Mi cuenta</b><small>Datos, seguridad y sistema</small></span></a>' +
      '<a class="um-item" role="menuitem" href="ayuda.html"><span class="um-ic um-ic-vi">' + ic.help + '</span><span class="um-tx"><b>Ayuda</b><small>Guías y preguntas frecuentes</small></span></a>' +
      '<div class="um-sep"></div>' +
      '<button class="um-item um-salir" role="menuitem" type="button" id="umSalir"><span class="um-ic um-ic-ro">' + ic.out + '</span><span class="um-tx"><b>Cerrar sesión</b></span></button>';

    document.body.appendChild(fondo);
    document.body.appendChild(panel);

    const $ = id => document.getElementById(id);
    const disparadores = [chip, mini].filter(Boolean);
    let abierto = false, ultimoDisparador = null;

    function leerSesionLocal(){
      // getSession() lee el almacenamiento local: no hace petición de red.
      const c = window.DSI && window.DSI.cliente && window.DSI.cliente();
      if (!c) return;
      c.auth.getSession().then(function(r){
        const u = r && r.data && r.data.session && r.data.session.user;
        if (u && u.email) $('umCorreo').textContent = u.email;
      }).catch(function(){});
    }

    function sincronizar(){
      const nombre = ($('topUserName') && $('topUserName').textContent || '').trim();
      const letra = ($('topAvatar') && $('topAvatar').textContent || '').trim();
      $('umNombre').textContent = nombre && nombre !== 'Cargando...' ? nombre : 'Usuario';
      $('umAv').textContent = letra || 'C';
      if (mini) { const m = mini.querySelector('.av'); if (m) m.textContent = letra || 'C'; }
      if (!$('umCorreo').textContent) leerSesionLocal();
    }

    function posicionar(){
      if (movil.matches || !ultimoDisparador) { panel.style.top = panel.style.right = ''; return; }
      const r = ultimoDisparador.getBoundingClientRect();
      panel.style.top = Math.round(r.bottom + 10) + 'px';
      panel.style.right = Math.max(12, Math.round(window.innerWidth - r.right)) + 'px';
    }

    function abrir(disparador){
      // Si la campana está abierta, se cierra para no apilar paneles
      const np = $('notificationPanel');
      if (np) np.classList.remove('show');
      ultimoDisparador = disparador;
      sincronizar();
      posicionar();
      panel.hidden = false; fondo.hidden = false;
      // un frame después para que corra la animación de entrada
      requestAnimationFrame(function(){ panel.classList.add('abierto'); fondo.classList.add('abierto'); });
      disparadores.forEach(function(d){ d.setAttribute('aria-expanded', d === disparador ? 'true' : 'false'); });
      abierto = true;
      const primero = panel.querySelector('.um-item');
      if (primero && !movil.matches) primero.focus({ preventScroll: true });
    }

    function cerrar(devolverFoco){
      if (!abierto) return;
      abierto = false;
      panel.classList.remove('abierto'); fondo.classList.remove('abierto');
      disparadores.forEach(function(d){ d.setAttribute('aria-expanded', 'false'); });
      setTimeout(function(){ if (!abierto) { panel.hidden = true; fondo.hidden = true; } }, 220);
      if (devolverFoco && ultimoDisparador) ultimoDisparador.focus({ preventScroll: true });
    }

    disparadores.forEach(function(d){
      d.setAttribute('aria-haspopup', 'menu');
      d.setAttribute('aria-expanded', 'false');
      d.setAttribute('aria-controls', 'userMenu');
      d.addEventListener('click', function(e){
        e.stopPropagation();
        abierto ? cerrar(false) : abrir(d);
      });
    });
    fondo.addEventListener('click', function(){ cerrar(false); });
    document.addEventListener('click', function(e){
      if (abierto && !panel.contains(e.target) && !disparadores.some(function(d){ return d.contains(e.target); })) cerrar(false);
    });
    document.addEventListener('keydown', function(e){
      if (!abierto) return;
      if (e.key === 'Escape') { cerrar(true); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.prototype.filter.call(panel.querySelectorAll('.um-item'), function(el){ return el.offsetParent !== null; });
        if (!items.length) return;
        const i = items.indexOf(document.activeElement);
        const n = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
        items[n].focus(); e.preventDefault();
      }
    });
    window.addEventListener('resize', function(){ if (abierto) { movil.matches ? posicionar() : cerrar(false); } }, { passive: true });
    window.addEventListener('scroll', function(){ if (abierto && !movil.matches) cerrar(false); }, { passive: true });
    // Al volver con el botón "atrás" del navegador la página puede quedar con el panel abierto
    window.addEventListener('pageshow', function(){ abierto = true; cerrar(false); });

    // El avatar y el nombre los pinta cada página; el pequeño del celular se mantiene igual
    const av = $('topAvatar');
    if (av && mini && 'MutationObserver' in window) {
      new MutationObserver(function(){ const m = mini.querySelector('.av'); if (m) m.textContent = av.textContent; })
        .observe(av, { childList: true, characterData: true, subtree: true });
      const m0 = mini.querySelector('.av'); if (m0 && av.textContent.trim()) m0.textContent = av.textContent;
    }

    // ---------- Cerrar sesión ----------
    let dialogo = null, saliendo = false;
    function crearDialogo(){
      dialogo = document.createElement('div');
      dialogo.className = 'um-modal';
      dialogo.hidden = true;
      dialogo.setAttribute('role', 'dialog');
      dialogo.setAttribute('aria-modal', 'true');
      dialogo.setAttribute('aria-labelledby', 'umModalTitulo');
      dialogo.innerHTML =
        '<div class="um-modal-card">' +
          '<h4 id="umModalTitulo">¿Cerrar sesión?</h4>' +
          '<p id="umModalTexto">Tendrás que iniciar sesión de nuevo para volver a entrar.</p>' +
          '<div class="um-modal-btns">' +
            '<button type="button" class="um-b-gris" id="umCancelar">Cancelar</button>' +
            '<button type="button" class="um-b-rojo" id="umConfirmar">Cerrar sesión</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(dialogo);
      $('umCancelar').addEventListener('click', cerrarDialogo);
      dialogo.addEventListener('click', function(e){ if (e.target === dialogo) cerrarDialogo(); });
      document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !dialogo.hidden) cerrarDialogo(); });
      $('umConfirmar').addEventListener('click', cerrarSesion);
    }
    function abrirDialogo(){
      if (!dialogo) crearDialogo();
      $('umModalTexto').textContent = 'Tendrás que iniciar sesión de nuevo para volver a entrar.';
      dialogo.hidden = false;
      requestAnimationFrame(function(){ dialogo.classList.add('abierto'); $('umCancelar').focus(); });
    }
    function cerrarDialogo(){
      if (saliendo || !dialogo) return;
      dialogo.classList.remove('abierto');
      setTimeout(function(){ dialogo.hidden = true; }, 180);
    }
    function limpiarCaches(){
      try {
        const claves = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf('dsi_') === 0 && k.indexOf('dsi_notif_leidas_') !== 0 && k.indexOf('dsi_notif_vistas_') !== 0) claves.push(k);
        }
        claves.forEach(function(k){ localStorage.removeItem(k); });
        sessionStorage.removeItem('dsi_perfil_rol');
      } catch (e) { /* almacenamiento bloqueado */ }
    }
    async function cerrarSesion(){
      if (saliendo) return;
      saliendo = true;
      const btn = $('umConfirmar');
      btn.disabled = true; btn.textContent = 'Cerrando sesión...';
      try {
        const c = window.DSI && window.DSI.cliente && window.DSI.cliente();
        if (c) {
          let t;
          const limite = new Promise(function(_, no){ t = setTimeout(function(){ no(new Error('Tiempo de espera agotado')); }, 12000); });
          const r = await Promise.race([c.auth.signOut(), limite]);
          clearTimeout(t);
          if (r && r.error) throw r.error;
        }
        limpiarCaches();
        window.location.replace('login.html');
      } catch (err) {
        console.error('Error al cerrar sesión:', err);
        saliendo = false;
        btn.disabled = false; btn.textContent = 'Cerrar sesión';
        $('umModalTexto').textContent = 'No se pudo cerrar la sesión. Revisa tu internet e intenta de nuevo.';
      }
    }
    $('umSalir').addEventListener('click', function(){ cerrar(false); abrirDialogo(); });
  }

  // Service worker: guarda los archivos estáticos para que la app abra casi al instante.
  function registrarSW(){
    if (!('serviceWorker' in navigator)) return;
    // Solo en https (publicado). En local no se registra, para que al programar siempre veas la última versión.
    if (location.protocol !== 'https:') return;
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').catch(function(){ /* sin soporte o bloqueado: la app funciona igual */ });
    });
  }
})();
