# Modo MySQL (opcional)

La aplicación ejecuta las mismas reglas con dos almacenamientos: el modo JSON predeterminado y el modo MySQL por separado. Los datos de un modo no se copian al otro. La instalación normal no requiere npm ni MySQL.

## Configuración de MySQL

1. Abre y ejecuta `database/schema.sql` en una instancia MySQL 8 de pruebas. El script crea solo el esquema `biblioteca_campus`; no borra bases de datos ni tablas. Si en tu instancia ya existe un esquema con ese nombre para otro trabajo, no reutilices esa instancia para esta demostración.
2. Usa un usuario de aplicación con acceso solo a `biblioteca_campus` y permisos `SELECT`, `INSERT` y `UPDATE`. La cuenta que configura el esquema puede ser distinta. No se necesitan privilegios administrativos para iniciar la aplicación.
3. En PowerShell, abre la raíz del proyecto y ejecuta:

```powershell
npm ci --ignore-scripts
$env:BIBLIOTECA_STORAGE = 'mysql'
$env:BIBLIOTECA_HTTP = 'express'
$env:BIBLIOTECA_MYSQL_USER = 'usuario_de_biblioteca'
$clave = Read-Host 'Contraseña del usuario MySQL de pruebas' -AsSecureString
$env:BIBLIOTECA_MYSQL_PASSWORD = [System.Net.NetworkCredential]::new('', $clave).Password
node server.mjs
```

La contraseña se lee sin eco y dura solo en esa sesión; no la pongas en un archivo ni en un chat. Si no usas el puerto 3306, define también `$env:BIBLIOTECA_MYSQL_PORT` antes de iniciar. Al terminar, pulsa Ctrl+C y cierra la terminal. Para volver a JSON, abre otra terminal y ejecuta `node server.mjs` sin esas variables.

Abre http://127.0.0.1:3000. La primera consulta inicializa los datos ficticios si el esquema está vacío. Las tablas `usuario`, `libro`, `ejemplar`, `prestamo` y `reserva` guardan relaciones y datos de circulación. Las escrituras se serializan con una fila de control bloqueada dentro de cada transacción.

🧪 **Verificación:** se probó una instancia oficial MySQL 8.0 aislada, con un directorio nuevo y un puerto local independiente. Se ejecutó la API con Express y se contrastaron por SQL el séptimo préstamo, el bloqueo concurrente del octavo, la fecha a ocho días y la reasignación de una reserva al vencer su plazo. No se usó ni modificó una base de datos existente.
