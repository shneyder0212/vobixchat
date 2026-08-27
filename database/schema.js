'use strict';

/*
==========================================================
 VOBIXCHAT DATABASE SCHEMA
 database/schema.js

 Inicialización y actualización automática de PostgreSQL.

 IMPORTANTE:
 - NO borra usuarios existentes.
 - NO borra mensajes.
 - NO elimina tablas.
 - Añade columnas nuevas de forma segura.
 - Preparado para futuras actualizaciones de VOBIXCHAT.
==========================================================
*/

const database = require('./db');


// ========================================================
// INICIALIZAR BASE DE DATOS
// ========================================================

async function initializeDatabase() {

  console.log(
    'VOBIXCHAT DATABASE: comprobando estructura...'
  );

  try {

    // ====================================================
    // EXTENSIÓN UUID
    // ====================================================

    await database.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    `);


    // ====================================================
    // USUARIOS
    //
    // Esta tabla puede existir de versiones anteriores.
    // Por eso primero garantizamos su existencia y después
    // añadimos las columnas que falten.
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS users (

        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),

        username TEXT NOT NULL,

        phone TEXT UNIQUE NOT NULL,

        verified BOOLEAN DEFAULT FALSE,

        online BOOLEAN DEFAULT FALSE,

        created_at TIMESTAMPTZ DEFAULT NOW(),

        updated_at TIMESTAMPTZ DEFAULT NOW()

      );
    `);


    // ====================================================
    // ACTUALIZAR USERS SIN BORRAR DATOS
    // ====================================================

    await database.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS vobix_id VARCHAR(40);
    `);

    await database.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    `);

    await database.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS bio VARCHAR(250);
    `);

    await database.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS language VARCHAR(20)
      DEFAULT 'es';
    `);

    await database.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;
    `);

    await database.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS discover_by_phone BOOLEAN
      DEFAULT TRUE;
    `);

    await database.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS discover_by_vobix_id BOOLEAN
      DEFAULT TRUE;
    `);

    await database.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS show_last_seen BOOLEAN
      DEFAULT TRUE;
    `);

    await database.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ
      DEFAULT NOW();
    `);

    await database.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
      DEFAULT NOW();
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
    // ÍNDICE TELÉFONO
    // ====================================================

    await database.query(`
      CREATE INDEX IF NOT EXISTS
      users_phone_idx

      ON users (phone);
    `);


    // ====================================================
    // SESIONES PERSISTENTES
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS sessions (

        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),

        user_id UUID NOT NULL
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


    await database.query(`
      CREATE INDEX IF NOT EXISTS
      sessions_user_idx

      ON sessions(user_id);
    `);


    // ====================================================
    // CONTACTOS
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS contacts (

        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),

        owner_user_id UUID NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,

        contact_user_id UUID NOT NULL
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


    await database.query(`
      CREATE INDEX IF NOT EXISTS
      contacts_owner_idx

      ON contacts(owner_user_id);
    `);


    // ====================================================
    // BLOQUEOS
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS user_blocks (

        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),

        blocker_user_id UUID NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,

        blocked_user_id UUID NOT NULL
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


    await database.query(`
      CREATE INDEX IF NOT EXISTS
      blocks_blocker_idx

      ON user_blocks(blocker_user_id);
    `);


    // ====================================================
    // CONVERSACIONES
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS conversations (

        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),

        type VARCHAR(30)
          NOT NULL
          DEFAULT 'private',

        title VARCHAR(150),

        created_by UUID
          REFERENCES users(id)
          ON DELETE SET NULL,

        created_at TIMESTAMPTZ DEFAULT NOW(),

        updated_at TIMESTAMPTZ DEFAULT NOW()

      );
    `);


    // ====================================================
    // PARTICIPANTES
    //
    // Usamos el nombre conversation_participants porque
    // tu proyecto ya venía trabajando con esa estructura.
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS conversation_participants (

        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),

        conversation_id UUID NOT NULL
          REFERENCES conversations(id)
          ON DELETE CASCADE,

        user_id UUID NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,

        role VARCHAR(30)
          DEFAULT 'member',

        joined_at TIMESTAMPTZ DEFAULT NOW(),

        muted BOOLEAN DEFAULT FALSE,

        archived BOOLEAN DEFAULT FALSE,

        UNIQUE (
          conversation_id,
          user_id
        )

      );
    `);


    await database.query(`
      CREATE INDEX IF NOT EXISTS
      conversation_participants_user_idx

      ON conversation_participants(user_id);
    `);


    // ====================================================
    // MENSAJES
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS messages (

        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),

        conversation_id UUID NOT NULL
          REFERENCES conversations(id)
          ON DELETE CASCADE,

        sender_user_id UUID
          REFERENCES users(id)
          ON DELETE SET NULL,

        message_type VARCHAR(30)
          NOT NULL
          DEFAULT 'text',

        content TEXT,

        reply_to_message_id UUID,

        edited BOOLEAN DEFAULT FALSE,

        deleted BOOLEAN DEFAULT FALSE,

        created_at TIMESTAMPTZ DEFAULT NOW(),

        updated_at TIMESTAMPTZ DEFAULT NOW()

      );
    `);


    // ====================================================
    // ACTUALIZAR MENSAJES ANTIGUOS
    // ====================================================

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS message_type VARCHAR(30)
      DEFAULT 'text';
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS reply_to_message_id UUID;
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS edited BOOLEAN
      DEFAULT FALSE;
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS deleted BOOLEAN
      DEFAULT FALSE;
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
      DEFAULT NOW();
    `);


    await database.query(`
      CREATE INDEX IF NOT EXISTS
      messages_conversation_created_idx

      ON messages(
        conversation_id,
        created_at DESC
      );
    `);


    // ====================================================
    // RECIBOS / ESTADO DE MENSAJES
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS message_receipts (

        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),

        message_id UUID NOT NULL
          REFERENCES messages(id)
          ON DELETE CASCADE,

        user_id UUID NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,

        delivered_at TIMESTAMPTZ,

        read_at TIMESTAMPTZ,

        created_at TIMESTAMPTZ DEFAULT NOW(),

        UNIQUE (
          message_id,
          user_id
        )

      );
    `);


    // ====================================================
    // VOBIX TRUST
    //
    // Guarda señales.
    // NO bloquea automáticamente a nadie.
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS trust_signals (

        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),

        user_id UUID NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,

        signal_type VARCHAR(80)
          NOT NULL,

        signal_value TEXT,

        source VARCHAR(80),

        confidence NUMERIC(5,4),

        created_at TIMESTAMPTZ DEFAULT NOW()

      );
    `);


    await database.query(`
      CREATE INDEX IF NOT EXISTS
      trust_signals_user_idx

      ON trust_signals(user_id);
    `);


    // ====================================================
    // AUDITORÍA
    //
    // Base futura:
    // VOBIX CORE
    // VOBIX ADMIN
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS audit_events (

        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),

        user_id UUID
          REFERENCES users(id)
          ON DELETE SET NULL,

        event_type VARCHAR(100)
          NOT NULL,

        entity_type VARCHAR(80),

        entity_id VARCHAR(100),

        metadata JSONB,

        created_at TIMESTAMPTZ DEFAULT NOW()

      );
    `);


    await database.query(`
      CREATE INDEX IF NOT EXISTS
      audit_events_created_idx

      ON audit_events(
        created_at DESC
      );
    `);


    // ====================================================
    // TERMINADO
    // ====================================================

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
