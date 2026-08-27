'use strict';

/*
==========================================================
 VOBIXCHAT DATABASE SCHEMA
 database/schema.js

 Prepara automáticamente PostgreSQL para:

 - Usuarios
 - Sesiones
 - Contactos
 - Bloqueos
 - Conversaciones privadas
 - Participantes
 - Mensajes
 - VOBIX ID
 - Preferencias básicas
 - Base futura para VOBIX TRUST / CORE / ADMIN
==========================================================
*/

const database = require('./db');


// ========================================================
// CREAR ESTRUCTURA
// ========================================================

async function initializeDatabase() {

  console.log(
    'VOBIXCHAT DATABASE: comprobando estructura...'
  );

  try {

    // ====================================================
    // USUARIOS
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS users (

        id BIGSERIAL PRIMARY KEY,

        username VARCHAR(80) NOT NULL,

        vobix_id VARCHAR(40),

        phone VARCHAR(30) UNIQUE NOT NULL,

        avatar_url TEXT,

        bio VARCHAR(250),

        language VARCHAR(20) DEFAULT 'es',

        verified BOOLEAN DEFAULT FALSE,

        online BOOLEAN DEFAULT FALSE,

        last_seen TIMESTAMPTZ,

        discover_by_phone BOOLEAN DEFAULT TRUE,

        discover_by_vobix_id BOOLEAN DEFAULT TRUE,

        show_last_seen BOOLEAN DEFAULT TRUE,

        created_at TIMESTAMPTZ DEFAULT NOW(),

        updated_at TIMESTAMPTZ DEFAULT NOW()

      );
    `);


    // ====================================================
    // VOBIX ID ÚNICO
    // ====================================================

    await database.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      users_vobix_id_unique

      ON users (LOWER(vobix_id))

      WHERE vobix_id IS NOT NULL;
    `);


    // ====================================================
    // SESIONES
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS sessions (

        id BIGSERIAL PRIMARY KEY,

        user_id BIGINT NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,

        token_hash TEXT UNIQUE NOT NULL,

        device_name VARCHAR(150),

        platform VARCHAR(80),

        created_at TIMESTAMPTZ DEFAULT NOW(),

        last_used_at TIMESTAMPTZ DEFAULT NOW(),

        expires_at TIMESTAMPTZ,

        revoked BOOLEAN DEFAULT FALSE

      );
    `);


    // ====================================================
    // CONTACTOS
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS contacts (

        id BIGSERIAL PRIMARY KEY,

        owner_user_id BIGINT NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,

        contact_user_id BIGINT NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,

        alias VARCHAR(100),

        created_at TIMESTAMPTZ DEFAULT NOW(),

        UNIQUE (
          owner_user_id,
          contact_user_id
        ),

        CHECK (
          owner_user_id <> contact_user_id
        )

      );
    `);


    // ====================================================
    // BLOQUEOS
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS user_blocks (

        id BIGSERIAL PRIMARY KEY,

        blocker_user_id BIGINT NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,

        blocked_user_id BIGINT NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,

        created_at TIMESTAMPTZ DEFAULT NOW(),

        UNIQUE (
          blocker_user_id,
          blocked_user_id
        ),

        CHECK (
          blocker_user_id <> blocked_user_id
        )

      );
    `);


    // ====================================================
    // CONVERSACIONES
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS conversations (

        id BIGSERIAL PRIMARY KEY,

        type VARCHAR(30)
          NOT NULL
          DEFAULT 'private',

        title VARCHAR(150),

        created_by BIGINT
          REFERENCES users(id)
          ON DELETE SET NULL,

        created_at TIMESTAMPTZ DEFAULT NOW(),

        updated_at TIMESTAMPTZ DEFAULT NOW()

      );
    `);


    // ====================================================
    // PARTICIPANTES
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS conversation_members (

        id BIGSERIAL PRIMARY KEY,

        conversation_id BIGINT NOT NULL
          REFERENCES conversations(id)
          ON DELETE CASCADE,

        user_id BIGINT NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,

        role VARCHAR(30)
          DEFAULT 'member',

        joined_at TIMESTAMPTZ DEFAULT NOW(),

        last_read_message_id BIGINT,

        muted BOOLEAN DEFAULT FALSE,

        archived BOOLEAN DEFAULT FALSE,

        UNIQUE (
          conversation_id,
          user_id
        )

      );
    `);


    // ====================================================
    // MENSAJES
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS messages (

        id BIGSERIAL PRIMARY KEY,

        conversation_id BIGINT NOT NULL
          REFERENCES conversations(id)
          ON DELETE CASCADE,

        sender_user_id BIGINT
          REFERENCES users(id)
          ON DELETE SET NULL,

        message_type VARCHAR(30)
          NOT NULL
          DEFAULT 'text',

        content TEXT,

        reply_to_message_id BIGINT
          REFERENCES messages(id)
          ON DELETE SET NULL,

        edited BOOLEAN DEFAULT FALSE,

        deleted BOOLEAN DEFAULT FALSE,

        created_at TIMESTAMPTZ DEFAULT NOW(),

        updated_at TIMESTAMPTZ DEFAULT NOW()

      );
    `);


    // ====================================================
    // ÍNDICES PARA VELOCIDAD
    // ====================================================

    await database.query(`
      CREATE INDEX IF NOT EXISTS
      messages_conversation_created_idx

      ON messages (
        conversation_id,
        created_at DESC
      );
    `);


    await database.query(`
      CREATE INDEX IF NOT EXISTS
      conversation_members_user_idx

      ON conversation_members (
        user_id
      );
    `);


    await database.query(`
      CREATE INDEX IF NOT EXISTS
      contacts_owner_idx

      ON contacts (
        owner_user_id
      );
    `);


    await database.query(`
      CREATE INDEX IF NOT EXISTS
      blocks_blocker_idx

      ON user_blocks (
        blocker_user_id
      );
    `);


    await database.query(`
      CREATE INDEX IF NOT EXISTS
      sessions_user_idx

      ON sessions (
        user_id
      );
    `);


    // ====================================================
    // BASE DE VOBIX TRUST
    //
    // IMPORTANTE:
    // Esto NO bloquea automáticamente usuarios.
    // Solo almacena señales técnicas futuras.
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS trust_signals (

        id BIGSERIAL PRIMARY KEY,

        user_id BIGINT NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,

        signal_type VARCHAR(80) NOT NULL,

        signal_value TEXT,

        source VARCHAR(80),

        confidence NUMERIC(5,4),

        created_at TIMESTAMPTZ DEFAULT NOW()

      );
    `);


    // ====================================================
    // AUDITORÍA
    //
    // Preparación para VOBIX CORE / VOBIX ADMIN
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS audit_events (

        id BIGSERIAL PRIMARY KEY,

        user_id BIGINT
          REFERENCES users(id)
          ON DELETE SET NULL,

        event_type VARCHAR(100) NOT NULL,

        entity_type VARCHAR(80),

        entity_id VARCHAR(100),

        metadata JSONB,

        created_at TIMESTAMPTZ DEFAULT NOW()

      );
    `);


    await database.query(`
      CREATE INDEX IF NOT EXISTS
      audit_events_created_idx

      ON audit_events (
        created_at DESC
      );
    `);


    console.log(
      'VOBIXCHAT DATABASE: estructura preparada correctamente'
    );

    return true;

  } catch (error) {

    console.error(
      'VOBIXCHAT DATABASE SCHEMA ERROR:',
      error.message
    );

    return false;

  }

}


// ========================================================
// EXPORTACIÓN
// ========================================================

module.exports = {
  initializeDatabase
};