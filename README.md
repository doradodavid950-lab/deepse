# Deep Sea Intelligence — estructura del proyecto

Cada módulo se separa en tres partes para que sea fácil de mantener y de probar:

| Carpeta | Qué contiene |
|---|---|
| `*.html` | Solo la estructura (lo que ve el usuario) y los enlaces a sus archivos. |
| `css/` | Estilos de cada módulo. `estilos.css` y `shell.css` son los compartidos. |
| `js/` | Lógica de cada módulo. |
| `supabase-config.js` | Conexión compartida con Supabase (`DSI.cliente()`). |
| `campana.js`, `menu-usuario.js`, `vista-administrador.js`, `sesion-inactividad.js`, `shell.js` | Piezas compartidas por todas las páginas. |
| `sw.js` | Service worker: guarda la app para uso sin conexión. |

## Cómo se mantiene

- Si cambias algún archivo y lo vas a publicar, sube `VERSION` en `sw.js` (por ejemplo `dsi-v3` → `dsi-v4`).
- Si creas un archivo nuevo en `css/` o `js/`, agrégalo a la lista `ESTATICOS` de `sw.js`.
- Los archivos de cada módulo empiezan con un comentario que dice qué contienen.

## Nota

Esta separación no cambió el comportamiento ni el diseño: se comprobó que cada página se ve igual y no muestra errores nuevos antes y después del cambio.
