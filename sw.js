/* Service worker — Deep Sea Intelligence
 * Guarda en el dispositivo los archivos de la app (páginas, estilos, scripts, imágenes y el SDK de Supabase)
 * y los entrega al instante, actualizándolos en segundo plano ("stale-while-revalidate").
 * Los datos NUNCA pasan por aquí: las peticiones a Supabase (y cualquier POST/PUT/DELETE) van directo a la red.
 * Al publicar una versión nueva, cambia VERSION para que todos los dispositivos limpien lo anterior.
 */
const VERSION = 'dsi-v6';
const ESTATICOS = ['estilos.css', 'supabase-config.js', 'menu-usuario.js', 'campana.js', 'sesion-inactividad.js', 'logo-emblema.png'];
const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(VERSION).then(function(c){ return c.addAll(ESTATICOS); }).catch(function(){}).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys()
      .then(function(ks){ return Promise.all(ks.filter(function(k){ return k !== VERSION; }).map(function(k){ return caches.delete(k); })); })
      .then(function(){ return self.clients.claim(); })
  );
});

function esCacheable(req, url){
  if (req.method !== 'GET' || req.headers.has('range')) return false;
  if (url.origin === self.location.origin) return /\.(?:html|css|js|png|jpe?g|webp|svg|ico|woff2?)$/i.test(url.pathname) || url.pathname.endsWith('/');
  return url.href === SDK;
}

self.addEventListener('fetch', function(e){
  const req = e.request;
  const url = new URL(req.url);
  if (!esCacheable(req, url)) return;   // todo lo demás (Supabase, etc.) va directo a la red

  e.respondWith(
    caches.open(VERSION).then(function(cache){
      return cache.match(req, { ignoreSearch: false }).then(function(guardado){
        const red = fetch(req).then(function(r){
          if (r && r.ok && (r.type === 'basic' || r.type === 'cors')) cache.put(req, r.clone());
          return r;
        }).catch(function(){ return guardado; });
        // Con copia guardada: responde ya y actualiza detrás. Sin copia: espera a la red.
        if (guardado) { e.waitUntil(red.catch(function(){})); return guardado; }
        return red;
      });
    })
  );
});
