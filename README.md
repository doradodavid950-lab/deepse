# Deep Sea Intelligence

Sistema de trazabilidad para pescados y mariscos: sigue cada lote desde que se captura hasta que se vende, con control de calidad revisado por un auditor y una página pública (QR) para que el consumidor verifique el lote.

Tecnología: HTML, CSS y JavaScript sin framework + [Supabase](https://supabase.com) (base de datos PostgreSQL, autenticación y tiempo real). No hay paso de compilación.

## Módulos

| Módulo | Archivo | Para qué sirve |
|---|---|---|
| Inicio | `inicio.html` | Resumen, alertas y flujo del sistema |
| Productos | `productos.html` | Catálogo de especies, origen y captura |
| Proveedores | `proveedores.html` | Quién entrega cada lote |
| Recepciones | `recepciones.html` | Entrada de lotes (genera el código `DS-AAAAMMDD-XXX-NN`) |
| Almacenamiento | `almacenamiento.html` | Ubicación y temperatura por lote |
| Ventas | `ventas.html` | Salidas y clientes, con validación de stock |
| Trazabilidad | `trazabilidad.html` | Recorrido completo, control de calidad y etiqueta/QR |
| Reportes | `reportes.html` | Indicadores y exportaciones |
| Normas y Calidad | `normas.html` | Normas por producto: declaración y revisión del auditor |
| Mi cuenta, Configuración, Ayuda | `cuenta.html`, `configuracion.html`, `ayuda.html` | Desde el avatar |
| Consulta pública | `trazabilidad-publica.html` | Lo que ve quien escanea el QR (sin iniciar sesión) |

Archivos compartidos: `shell.js` / `shell.css` (barra lateral, encabezado y barra inferior del celular), `menu-usuario.js` (menú del avatar), `campana.js` (notificaciones), `sesion-inactividad.js` (cierre por inactividad), `supabase-config.js` (conexión) y `sw.js` (caché de archivos estáticos).

## Cómo ejecutarlo

1. Sube la carpeta a cualquier hosting estático (Netlify, Vercel, GitHub Pages) o sírvela en local: `python3 -m http.server 8000` y abre `http://localhost:8000/login.html`.
2. La URL y la llave del proyecto están en `supabase-config.js`. La llave `publishable` es pública por diseño; **la protección real son las políticas RLS** de la base de datos.
3. Si cambias archivos y quieres que los dispositivos los actualicen, sube el número de `VERSION` en `sw.js`.

## Flujo de datos

```
Producto → Recepción (lote) → Almacenamiento → Control de calidad → Revisión del auditor → Venta
                                                                       ↓
                                                      Consulta pública por QR (solo lectura)
```

## Base de datos

Tablas principales: `productos`, `proveedores`, `recepciones` (los lotes), `almacenamientos`, `controles_calidad`, `ventas`, `clientes`, `ajustes_inventario`, `normas_catalogo`, `norma_categoria`, `producto_normas`, `perfiles`, `presencia_usuarios` y `auditoria`.

**Roles** (columna `perfiles.rol`):

| Rol | Puede |
|---|---|
| Establecimiento (por defecto) | Crear y ver solo sus propios registros |
| Auditor | Leer los registros de todos y decidir Aprobado/Rechazado en controles y normas (siempre con motivo) |
| Administrador | Además, ver ventas y clientes de todos y definir reglas de normas por categoría |

**Reglas que protege la propia base de datos** (no dependen de la pantalla):

- **Lote aprobado = inmutable.** Con un control aprobado por auditor, el lote no se borra y no cambia producto, proveedor, peso, fecha, código ni estado.
- **Un control ya revisado no se modifica** y solo se borra mientras está Pendiente.
- **Stock:** no se puede vender más de lo disponible.
- **Auditoría:** cada inserción, cambio o borrado en las tablas de negocio queda en `auditoria` (quién, cuándo, antes y después). Es de solo lectura para los usuarios.
- **Acceso anónimo:** el rol anónimo no tiene permisos sobre ninguna tabla. Lo único público es la función `trazabilidad_publica`, que devuelve solo lo necesario para el QR y un veredicto (`verificado`, `no_verificado`, `pendiente`).

El detalle de los cambios más recientes está en `base-de-datos/migraciones-v20.sql`.

## Puntos rojos del menú

Un punto rojo en un módulo (con el número al pasar el cursor) indica que hay algo por atender. Todos salen de una sola función de la base, `pendientes_resumen()`:

| Módulo | Cuándo aparece |
|---|---|
| Normas y Calidad | Productos con normas obligatorias sin declarar, rechazadas o vencidas (auditor: normas declaradas por revisar) |
| Recepciones | Lotes pendientes, en evaluación, en revisión u observados |
| Almacenamiento | Productos activos agotados o con stock bajo |
| Trazabilidad | Lotes de los últimos 60 días sin control de calidad aprobado ni pendiente |

En celular, los puntos de los módulos que están dentro de «Más» también se muestran en ese botón. Para agregar otro módulo: añade una clave a `pendientes_resumen()` y su nombre en la lista de `shell.js` (`pedirPend`).

## Rendimiento y carga

- Las consultas periódicas son pocas y livianas: los puntos rojos del menú usan una sola función (`pendientes_resumen`) y las notificaciones se actualizan por tiempo real; el respaldo cada ~3 minutos tiene retraso aleatorio para que muchos usuarios no consulten a la vez, y un cambio frecuente no provoca recargas en cadena (mínimo 5 s entre cargas).
- Probado en la base de datos con ~6.000 lotes nuevos: crear un lote ≈ 2,5 ms, listar 100 lotes con RLS ≈ 3 ms, consulta pública del QR ≈ 1 ms.
- Para probar tu propio despliegue: `node pruebas/carga.js 300 30` (ver instrucciones al inicio del archivo).
- Si el sistema crece mucho: sube el plan de Supabase (conexiones y Realtime tienen límites por plan) y revisa los avisos de *Advisors* en el panel.

## Seguridad: pendiente manual

Activar en Supabase → Authentication → Sign In / Providers → Email la opción **“Prevent use of leaked passwords”** (puede requerir plan Pro). No se puede hacer por SQL.

## Licencia

Ver `LICENSE`.
