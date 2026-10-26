/* Configuración y cliente único de Supabase — Deep Sea Intelligence
 * Se carga justo después del SDK de Supabase en cada página:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="supabase-config.js"></script>
 * Así la URL y la llave viven en un solo lugar, y todas las páginas y scripts
 * (campana.js, sesion-inactividad.js) comparten UN solo cliente en vez de crear uno cada uno.
 * Uso:  const supabaseClient = DSI.cliente();
 * (La llave "publishable" es pública por diseño; la protección real son las políticas RLS.)
 */
(function(){
  'use strict';
  const D = window.DSI = window.DSI || {};
  D.SUPABASE_URL = 'https://lohxgdeuohhczejyxwgr.supabase.co';
  D.SUPABASE_ANON_KEY = 'sb_publishable_QpRophkYS0o554DGxKBWmQ_P1fs8NPW';
  let unico = null;
  // Devuelve el cliente único; lo crea la primera vez. Devuelve null si el SDK aún no cargó.
  D.cliente = function(){
    if (unico) return unico;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;
    unico = window.supabase.createClient(D.SUPABASE_URL, D.SUPABASE_ANON_KEY);
    return unico;
  };
})();
