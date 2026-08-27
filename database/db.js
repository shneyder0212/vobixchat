
'use strict';

/*
==========================================================
 VOBIXCHAT DATABASE
 db.js

 Conexión privada entre VOBIXCHAT y PostgreSQL/Supabase.

 IMPORTANTE:
 - Este archivo va en /database
 - NO va dentro de /public
 - NO contiene contraseñas
 - La contraseña se obtiene de DATABASE_URL en Render
==========================================================
*/

const { Pool } = require('pg');


// ========================================================
// COMPROBAR CONFIGURACIÓN
// ========================================================

if (!process.env.DATABASE_URL) {
  console.error(
    'VOBIXCHAT DATABASE: DATABASE_URL no está configurada'
  );
}


// ========================================================
// POOL DE CONEXIONES POSTGRESQL
// ========================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false
  },

  max: 10,

  idleTimeoutMillis: 30000,

  connectionTimeoutMillis: 10000
});


// ========================================================
// CONTROL DE ERRORES DEL POOL
// ========================================================

pool.on('error', (error) => {

  console.error(
    'VOBIXCHAT DATABASE - Error inesperado:',
    error.message
  );

});


// ========================================================
// PROBAR CONEXIÓN
// ========================================================

async function testConnection() {

  let client;

  try {

    client = await pool.connect();

    const result =
      await client.query(
        'SELECT NOW() AS server_time'
      );

    console.log(
      'VOBIXCHAT DATABASE CONECTADA:',
      result.rows[0].server_time
    );

    return true;

  } catch (error) {

    console.error(
      'VOBIXCHAT DATABASE - NO SE PUDO CONECTAR:',
      error.message
    );

    return false;

  } finally {

    if (client) {
      client.release();
    }

  }

}


// ========================================================
// CONSULTAS
// ========================================================

async function query(text, params = []) {

  return pool.query(text, params);

}


// ========================================================
// CERRAR CONEXIONES
// ========================================================

async function closeDatabase() {

  await pool.end();

}


// ========================================================
// EXPORTACIONES
// ========================================================

module.exports = {

  pool,

  query,

  testConnection,

  closeDatabase

};
