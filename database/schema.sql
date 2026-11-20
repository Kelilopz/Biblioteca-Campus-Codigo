-- Ejecutar solo para habilitar el modo opcional MySQL.
-- Esquema independiente: no modifica otras bases de datos y no ejecuta DROP.
CREATE DATABASE IF NOT EXISTS biblioteca_campus
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE biblioteca_campus;

CREATE TABLE IF NOT EXISTS control (
  id TINYINT NOT NULL PRIMARY KEY,
  fecha_demo DATE NULL,
  ultima_fecha_real DATE NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO control(id) VALUES (1);

CREATE TABLE IF NOT EXISTS usuario (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  rol ENUM('lector','bibliotecario') NOT NULL,
  orden SMALLINT UNSIGNED NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS libro (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  titulo VARCHAR(250) NOT NULL,
  autor VARCHAR(150) NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  descripcion TEXT NOT NULL,
  color CHAR(7) NOT NULL,
  anio SMALLINT UNSIGNED NULL,
  isbn VARCHAR(25) NULL,
  orden SMALLINT UNSIGNED NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ejemplar (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  libro_id VARCHAR(40) NOT NULL,
  orden SMALLINT UNSIGNED NOT NULL,
  FOREIGN KEY(libro_id) REFERENCES libro(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS prestamo (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  usuario_id VARCHAR(40) NOT NULL,
  ejemplar_id VARCHAR(40) NOT NULL,
  inicio DATE NOT NULL,
  vence DATE NOT NULL,
  devolucion DATE NULL,
  orden INT UNSIGNED NOT NULL,
  FOREIGN KEY(usuario_id) REFERENCES usuario(id),
  FOREIGN KEY(ejemplar_id) REFERENCES ejemplar(id),
  INDEX idx_prestamo_usuario_activo (usuario_id, devolucion),
  INDEX idx_prestamo_ejemplar_activo (ejemplar_id, devolucion)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS reserva (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  usuario_id VARCHAR(40) NOT NULL,
  libro_id VARCHAR(40) NOT NULL,
  ejemplar_id VARCHAR(40) NULL,
  estado ENUM('waiting','held','cancelled','expired','fulfilled') NOT NULL,
  vence DATE NULL,
  creacion DATE NOT NULL,
  orden INT UNSIGNED NOT NULL,
  FOREIGN KEY(usuario_id) REFERENCES usuario(id),
  FOREIGN KEY(libro_id) REFERENCES libro(id),
  FOREIGN KEY(ejemplar_id) REFERENCES ejemplar(id),
  INDEX idx_reserva_cola (libro_id, estado, orden)
) ENGINE=InnoDB;
