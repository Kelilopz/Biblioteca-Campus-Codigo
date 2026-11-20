# Biblioteca Campus

Aplicación web académica de circulación bibliotecaria. Esta versión funcional local usa HTML, CSS y JavaScript en el navegador, una API HTTP en Node.js y almacenamiento JSON persistente por defecto. Todos los perfiles y datos iniciales son ficticios.

## Arrancar en Windows

1. Abre la carpeta en VS Code.
2. Abre Terminal > Nueva terminal, y ejecuta:
   ```powershell
   node server.mjs
   ```
3. Abre **http://127.0.0.1:3000** en tu navegador. No uses Live Server para esta versión: la página necesita la API del servidor.
4. Para cerrar la aplicación vuelve a la terminal y pulsa Ctrl+C. Si 3000 está ocupado, ejecuta `$env:PORT='3001'; node server.mjs` y abre http://127.0.0.1:3001.

Requiere Node.js 20 o superior. No hay que instalar dependencias para el modo local JSON. Si usas la carpeta que ya se preparó en Descargas, abre PowerShell y ejecuta `cd "$HOME\Downloads\Biblioteca-Campus-Entrega"` antes de arrancar.

## Demostración sugerida

- **Lector:** entra como Lucía Navarro, busca «La ciudad que habitamos» y únete a la lista de espera. En un estado recién iniciado, verás la posición 3. Revisa la reserva en «Mi cuenta».
- **Límite:** entra como Valeria Ortiz (bibliotecario). Hugo Vera comienza con seis préstamos activos, incluido uno vencido sin devolver. Presta a Hugo los ejemplares disponibles EJ-001 y EJ-002, uno a la vez. El primero debe llevarlo a siete, con devolución en ocho días; el segundo debe bloquearse.
- **Cola:** como bibliotecario, devuelve el ejemplar EJ-003 (Mateo). La primera reserva pasa a «Lista para recoger» durante dos días. En «Reloj de demostración» adelanta dos días y comprueba que la primera oferta vence y el ejemplar pasa a la siguiente persona. La cancelación de la reserva ofrecida también avanza la cola.
- **Persistencia:** cierra la terminal y abre el servidor de nuevo. Los datos guardados deben mantenerse. Para repetir desde el comienzo sin perder tu evidencia, detén el servidor y mueve la carpeta `datos` a otra ubicación antes de reiniciarlo.

## Pruebas automáticas

Ejecuta `npm.cmd test` desde la carpeta del proyecto. Para probar la API de Express también, instala las dependencias con `npm.cmd ci` y ejecuta `npm.cmd run test:express`. Las pruebas usan datos temporales, no modifican la sesión de la demostración. Para el informe, distingue las capturas de Figma (diseño previo) de tus capturas de la aplicación en el navegador (resultado funcional).

## Archivos y alcance

- `public/`: interfaz del lector y del bibliotecario.
- `server.mjs`: servidor y rutas de la API local.
- `domain.mjs`: reglas de préstamos, disponibilidad y reservas.
- `database/`: esquema de MySQL, adaptador y guía.
- `tests/`: pruebas automáticas.

Los perfiles se seleccionan para demostrar los roles sin contraseñas reales. No es un sistema de autenticación para producción, ni envía notificaciones externas. No usa datos de estudiantes reales ni modifica el proyecto Java de la otra entrega.

El alcance funcional de esta versión es **circulación**: consultar el catálogo, registrar préstamos, devolver ejemplares y gestionar reservas. El panel incluye consultas de libros, ejemplares y usuarios (solo lectura) y reportes básicos calculados sobre los datos. La edición de inventario, administración de usuarios y reportes avanzados siguen siendo parte del diseño previsto de Figma.

Las vistas principales se adaptaron del Figma de Biblioteca Campus. Los contadores y los estados de la aplicación se calculan con sus propios datos, no se fijan para repetir las cifras de las capturas. El ingreso usa perfiles ficticios, a diferencia del formulario ilustrativo de Figma.

## MySQL opcional

El modo MySQL se probó con un servidor MySQL 8.0 aislado, Express y mysql2. Se verificaron dos solicitudes concurrentes (séptimo aprobado y octavo bloqueado), devolución a ocho días, oferta y reasignación de reserva, y persistencia consultada por SQL. No se usó la instancia habitual de Windows. Este modo usa un esquema independiente, `biblioteca_campus`.

1. En tu servidor de pruebas, ejecuta `database/schema.sql` con un usuario autorizado para crear el esquema y sus tablas. No uses el esquema de la entrega Java.
2. Instala las dependencias exactas del proyecto: `npm.cmd ci`. Esto instala Express y el controlador mysql2.
3. En PowerShell selecciona el modo y un usuario de pruebas con permisos limitados al esquema. Introduce su clave en privado:
   ```powershell
   $env:BIBLIOTECA_STORAGE = 'mysql'
   $env:BIBLIOTECA_MYSQL_USER = 'usuario_de_biblioteca'
   $clave = Read-Host 'Contraseña del usuario MySQL de pruebas' -AsSecureString
   $env:BIBLIOTECA_MYSQL_PASSWORD = [System.Net.NetworkCredential]::new('', $clave).Password
   try { node server.mjs } finally { Remove-Item Env:BIBLIOTECA_MYSQL_PASSWORD -ErrorAction SilentlyContinue }
   ```
4. Si tu servidor usa otro puerto, define `BIBLIOTECA_MYSQL_PORT` antes de arrancar. Abre la misma URL local y verifica persistencia tras reiniciar.
