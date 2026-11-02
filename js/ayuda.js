/* ==========================================================
   Lógica del módulo: ayuda.html
   Extraída del HTML sin cambios: mismo código y mismo orden de ejecución.
   ========================================================== */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const cliente = DSI.cliente();

  // Sesión: se lee del almacenamiento local (sin red). Sin sesión, al login.
  cliente.auth.getSession().then(function(r){
    const s = r.data && r.data.session;
    if (!s) { window.location.replace('login.html'); return; }
    const u = s.user, m = u.user_metadata || {};
    const nombre = (m.full_name || m.name || (u.email || '').split('@')[0] || 'Usuario').trim() || 'Usuario';
    $('topUserName').textContent = nombre;
    $('topAvatar').textContent = nombre.charAt(0).toUpperCase();
  });
  cliente.auth.onAuthStateChange(function(ev){ if (ev === 'SIGNED_OUT') window.location.replace('login.html'); });

  // Buscador de la ayuda (en el propio navegador)
  const norm = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const preguntas = Array.prototype.map.call(document.querySelectorAll('.q'), function(d){ return { el: d, txt: norm(d.textContent) }; });
  let tm;
  $('buscarAyuda').addEventListener('input', function(){
    clearTimeout(tm);
    const v = norm(this.value.trim());
    tm = setTimeout(function(){
      let total = 0;
      preguntas.forEach(function(p){ const ok = !v || p.txt.indexOf(v) !== -1; p.el.hidden = !ok; if (ok) total++; if (v && ok) p.el.open = true; else if (!v) p.el.open = false; });
      document.querySelectorAll('[data-grupo]').forEach(function(g){ g.hidden = !g.querySelector('.q:not([hidden])'); });
      $('vacio').classList.toggle('show', total === 0);
    }, 120);
  });

  // Menú "Más" del celular
  const fan = $('fan'), fanBtn = $('fanBtn');
  function abrirFan(){ fan.classList.add('open'); fanBtn.classList.add('open'); fanBtn.setAttribute('aria-expanded','true'); $('fanBtnLabel').textContent='Cerrar'; document.body.classList.add('sin-scroll'); }
  function cerrarFan(){ fan.classList.remove('open'); fanBtn.classList.remove('open'); fanBtn.setAttribute('aria-expanded','false'); $('fanBtnLabel').textContent='Más'; document.body.classList.remove('sin-scroll'); }
  fanBtn.addEventListener('click', function(){ fan.classList.contains('open') ? cerrarFan() : abrirFan(); });
  $('fanOverlay').addEventListener('click', cerrarFan);
  window.addEventListener('resize', function(){ if (window.innerWidth > 1000) cerrarFan(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') cerrarFan(); });
})();
