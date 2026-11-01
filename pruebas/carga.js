/* Prueba de carga básica — Deep Sea Intelligence
 * Requiere Node 18+. Ejecútala desde TU computador (no necesita instalar nada):
 *
 *   node pruebas/carga.js                       → 200 consultas públicas (QR), 20 a la vez
 *   LOTE=<uuid-de-un-lote> node pruebas/carga.js 500 50
 *   EMAIL=tu@correo PASS=clave node pruebas/carga.js 300 30   → además prueba las consultas con sesión
 *
 * Argumentos: [total de peticiones] [peticiones simultáneas]
 * Resultado: tiempos (p50/p95/máx) y errores. Sube la carga poco a poco; no la apuntes a otra cosa que tu propio proyecto.
 */
const URL = 'https://lohxgdeuohhczejyxwgr.supabase.co';
const KEY = 'sb_publishable_QpRophkYS0o554DGxKBWmQ_P1fs8NPW';
const total = Number(process.argv[2]) || 200, conc = Number(process.argv[3]) || 20;

async function llamar(ruta, opts, token) {
  const t0 = performance.now();
  try {
    const r = await fetch(URL + ruta, { ...opts, headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts && opts.headers) } });
    await r.arrayBuffer();
    return { ms: performance.now() - t0, status: r.status };
  } catch (e) { return { ms: performance.now() - t0, status: 0 }; }
}
async function ola(nombre, n, c, fn) {
  const res = []; let i = 0;
  await Promise.all(Array.from({ length: c }, async () => { while (i++ < n) res.push(await fn()); }));
  const ms = res.map(x => x.ms).sort((a, b) => a - b), q = p => ms[Math.min(ms.length - 1, Math.floor(ms.length * p))];
  const mal = res.filter(x => x.status < 200 || x.status >= 300);
  const por = {}; mal.forEach(x => por[x.status] = (por[x.status] || 0) + 1);
  console.log(`${nombre.padEnd(34)} n=${n} simult=${c}  p50=${q(.5).toFixed(0)}ms  p95=${q(.95).toFixed(0)}ms  máx=${ms[ms.length - 1].toFixed(0)}ms  errores=${mal.length}${mal.length ? ' ' + JSON.stringify(por) : ''}`);
  return mal.length;
}
(async () => {
  let fallos = 0;
  const lote = process.env.LOTE || '00000000-0000-0000-0000-000000000000';
  fallos += await ola('Consulta pública por QR (anon)', total, conc, () => llamar('/rest/v1/rpc/trazabilidad_publica', { method: 'POST', body: JSON.stringify({ p_lote: lote }) }));
  // Debe estar bloqueado para anónimos (esperado: 401/403/404, nunca 200)
  const x = await llamar('/rest/v1/clientes?select=id', {});
  console.log('clientes sin sesión →', x.status, (x.status === 200 ? '❌ ABIERTO' : '✔ bloqueado'));
  if (process.env.EMAIL && process.env.PASS) {
    const r = await fetch(URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.EMAIL, password: process.env.PASS }) });
    const j = await r.json();
    if (!j.access_token) { console.log('No se pudo iniciar sesión:', j.error_description || j.msg); process.exit(1); }
    const t = j.access_token;
    fallos += await ola('Lista de recepciones (con RLS)', total, conc, () => llamar('/rest/v1/recepciones?select=id,codigo_lote,peso,estado_producto&order=fecha_recepcion.desc&limit=100', {}, t));
    fallos += await ola('Pendientes del menú (RPC)', total, conc, () => llamar('/rest/v1/rpc/pendientes_resumen', { method: 'POST', body: '{}' }, t));
    fallos += await ola('Resumen del inicio (RPC)', total, conc, () => llamar('/rest/v1/rpc/dashboard_resumen', { method: 'POST', body: '{}' }, t));
  }
  console.log(fallos ? `\n⚠ ${fallos} peticiones con error` : '\n✔ Sin errores');
})();
