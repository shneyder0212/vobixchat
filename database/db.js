'use strict';
const { Pool } = require('pg');

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

if (!process.env.DATABASE_URL) {
  console.error('VOBIXCHAT DATABASE: DATABASE_URL no está configurada');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // El pool de producción usa un proxy en modo sesión con un máximo de 15.
  // Dejamos margen para migraciones, tareas internas y despliegues solapados.
  max: boundedInteger(process.env.DATABASE_POOL_MAX, 6, 2, 8),
  min: boundedInteger(process.env.DATABASE_POOL_MIN, 0, 0, 2),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  maxUses: 7500
});

pool.on('error', error => {
  console.error('VOBIXCHAT DATABASE - Error inesperado:', error.message);
});

async function testConnection() {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW() AS server_time');
    console.log('VOBIXCHAT DATABASE CONECTADA:', result.rows[0].server_time);
    return true;
  } catch (error) {
    console.error('VOBIXCHAT DATABASE - NO SE PUDO CONECTAR:', error.message);
    return false;
  } finally {
    if (client) client.release();
  }
}

async function query(text, params = []) { return pool.query(text, params); }
async function closeDatabase() { await pool.end(); }
module.exports = { boundedInteger, pool, query, testConnection, closeDatabase };
