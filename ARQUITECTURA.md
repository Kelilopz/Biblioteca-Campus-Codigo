# Arquitectura y ejecución del backend

**Lenguajes:** HTML, CSS y JavaScript en la interfaz; JavaScript en Node.js y Express para la API REST; SQL para el esquema y la persistencia en MySQL.

| Archivo | Responsabilidad |
| --- | --- |
| `public/` | Interfaz y experiencia interactiva inspirada en Figma. |
| `server.mjs` | Rutas, JSON, sesiones de demostración, roles y adaptadores HTTP. |
| `domain.mjs` | Reglas de préstamos, devolución, vigencia y prioridad de reservas. |
| `database/schema.sql`, `database/mysql.mjs` | Tablas InnoDB, relaciones, consultas parametrizadas y transacciones. |
| `tests/` | Pruebas del dominio y la API local, incluyendo Express. |

Los dos servidores usan el mismo controlador y las mismas reglas. Express gestiona sus rutas, interpreta JSON y sirve los archivos de la interfaz. El servidor HTTP nativo es una alternativa para demostración sin instalar paquetes.

## Abrir con Express sin MySQL

En PowerShell, desde la carpeta raíz del proyecto:

```powershell
npm ci --ignore-scripts
$env:BIBLIOTECA_HTTP = 'express'
node server.mjs
```

Abre http://127.0.0.1:3000. En este modo se conserva el estado en `datos/estado.json`. Para usar la arquitectura formal completa con MySQL, sigue `database/LEEME.md`; el modo MySQL selecciona Express de forma predeterminada.

## Pruebas automatizadas

- `npm test`: reglas de negocio y API nativa, incluso con solicitudes concurrentes y reinicio.
- `npm run test:express`: integración de rutas, cuerpo JSON, roles y circulación con Express.

Además, se ejecutó una prueba de integración Express + MySQL 8.0 en una instancia de pruebas separada y se consultaron las filas guardadas por una segunda conexión. No se requiere levantar esa instancia para las pruebas que usan JSON.

Usa únicamente los perfiles ficticios suministrados. La sesión de demostración no reemplaza un inicio de sesión real y el servidor solo se abre en el propio dispositivo.
