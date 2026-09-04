'use strict';

/*
==========================================================
 VOBIXCHAT DATABASE SCHEMA
 database/schema.js

 Inicialización y migración automática PostgreSQL.

 OBJETIVOS:
 - NO borrar usuarios
 - NO borrar conversaciones
 - NO borrar mensajes
 - NO eliminar tablas existentes
 - Reparar estructuras antiguas
 - Mantener compatibilidad con columnas legacy
 - Preparar fotos de perfil
 - Preparar Web Push / iPhone / PWA
==========================================================
*/

const database = require('./db');


// ========================================================
// COMPROBAR SI EXISTE UNA COLUMNA
// ========================================================

async function columnExists(
  tableName,
  columnName
) {

  const result =
    await database.query(
      `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS exists
      `,
      [
        tableName,
        columnName
      ]
    );

  return result.rows[0].exists;
}


// ========================================================
// INICIALIZAR / MIGRAR
// ========================================================

async function initializeDatabase() {

  console.log(
    'VOBIXCHAT DATABASE: comprobando estructura...'
  );

  try {

    // ====================================================
    // UUID
    // ====================================================

    await database.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    `);


    // ====================================================
    // USERS
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
    // MIGRACIONES USERS
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
      DEFAULT FALSE;
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

    await database.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS security_reverified_at TIMESTAMPTZ;
    `);

    await database.query(`
      CREATE TABLE IF NOT EXISTS friendships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (requester_id <> addressee_id),
        UNIQUE (requester_id, addressee_id)
      );
    `);

    await database.query(`
      CREATE INDEX IF NOT EXISTS friendships_addressee_status_idx
      ON friendships(addressee_id, status);
    `);


    // ====================================================
    // ÍNDICES USERS
    // ====================================================

    await database.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      users_vobix_id_unique
      ON users (LOWER(vobix_id))
      WHERE vobix_id IS NOT NULL;
    `);

    await database.query(`
      CREATE INDEX IF NOT EXISTS
      users_phone_idx
      ON users(phone);
    `);


    // ====================================================
    // SESSIONS
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
    // PUSH SUBSCRIPTIONS
    //
    // IMPORTANTE:
    // users.id es UUID.
    // Por eso user_id también es UUID.
    //
    // Esta tabla permitirá:
    //
    // iPhone
    // Android
    // PC
    // varios dispositivos del mismo usuario
    //
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (

        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),

        user_id UUID NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,

        endpoint TEXT NOT NULL,

        p256dh TEXT NOT NULL,

        auth TEXT NOT NULL,

        user_agent TEXT,

        device_name VARCHAR(150),

        platform VARCHAR(80),

        enabled BOOLEAN NOT NULL
          DEFAULT TRUE,

        created_at TIMESTAMPTZ NOT NULL
          DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
          DEFAULT NOW(),

        last_used_at TIMESTAMPTZ,

        last_success_at TIMESTAMPTZ,

        last_failure_at TIMESTAMPTZ,

        failure_count INTEGER NOT NULL
          DEFAULT 0
      );
    `);


    // ====================================================
    // MIGRACIONES PUSH
    // ====================================================

    await database.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS user_agent TEXT;
    `);

    await database.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS device_name VARCHAR(150);
    `);

    await database.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS platform VARCHAR(80);
    `);

    await database.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS enabled BOOLEAN
      DEFAULT TRUE;
    `);

    await database.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ
      DEFAULT NOW();
    `);

    await database.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
      DEFAULT NOW();
    `);

    await database.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
    `);

    await database.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;
    `);

    await database.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ;
    `);

    await database.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS failure_count INTEGER
      DEFAULT 0;
    `);


    // ====================================================
    // ENDPOINT PUSH ÚNICO
    // ====================================================

    await database.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      push_subscriptions_endpoint_unique
      ON push_subscriptions(endpoint);
    `);

    await database.query(`
      CREATE INDEX IF NOT EXISTS
      push_subscriptions_user_idx
      ON push_subscriptions(user_id);
    `);
    await database.query(`
      CREATE INDEX IF NOT EXISTS
      push_subscriptions_enabled_idx
      ON push_subscriptions(
        user_id,
        enabled
      );
    `);


    // ====================================================
    // DISPOSITIVOS ANDROID NATIVOS (FIREBASE CLOUD MESSAGING)
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS fcm_devices (

        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),

        user_id UUID NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,

        token TEXT NOT NULL UNIQUE,

        platform VARCHAR(40) NOT NULL
          DEFAULT 'android',

        device_name VARCHAR(150),

        enabled BOOLEAN NOT NULL
          DEFAULT TRUE,

        created_at TIMESTAMPTZ NOT NULL
          DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
          DEFAULT NOW(),

        last_success_at TIMESTAMPTZ,

        last_failure_at TIMESTAMPTZ,

        failure_count INTEGER NOT NULL
          DEFAULT 0
      );
    `);

    await database.query(`
      CREATE INDEX IF NOT EXISTS
      fcm_devices_user_enabled_idx
      ON fcm_devices(user_id, enabled);
    `);


    // ====================================================
    // CONTACTS
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

    // CAPA 3.1 — Favoritos por usuario, sin alterar el contacto ni el chat.
    await database.query(`
      ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await database.query(`
      CREATE INDEX IF NOT EXISTS contacts_owner_favorite_idx
      ON contacts(owner_user_id, is_favorite DESC, created_at DESC);
    `);


    // ====================================================
    // BLOCKS
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
    // CONVERSATIONS
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
    // MIGRACIONES CONVERSATIONS
    // ====================================================

    await database.query(`
      ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS type VARCHAR(30)
      DEFAULT 'private';
    `);

    await database.query(`
      ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS title VARCHAR(150);
    `);

    await database.query(`
      ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS created_by UUID;
    `);

    await database.query(`
      ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ
      DEFAULT NOW();
    `);

    await database.query(`
      ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
      DEFAULT NOW();
    `);

    // CAPA 4.6.1 — Duración para mensajes nuevos; cero significa desactivado.
    await database.query(`
      ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS disappearing_seconds INTEGER NOT NULL DEFAULT 0;
    `);


    // ====================================================
    // FK CONVERSATIONS -> USERS
    // ====================================================

    await database.query(`
      DO $$
      BEGIN

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'conversations'::regclass
            AND conname = 'conversations_created_by_fkey'
        ) THEN

          ALTER TABLE conversations
          ADD CONSTRAINT conversations_created_by_fkey
          FOREIGN KEY (created_by)
          REFERENCES users(id)
          ON DELETE SET NULL;

        END IF;

      END
      $$;
    `);


    // ====================================================
    // CONVERSATION PARTICIPANTS
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

        joined_at TIMESTAMPTZ
          DEFAULT NOW(),

        muted BOOLEAN
          DEFAULT FALSE,

        archived BOOLEAN
          DEFAULT FALSE,

        last_read_at TIMESTAMPTZ,

        UNIQUE (
          conversation_id,
          user_id
        )

      );
    `);


    // ====================================================
    // MIGRACIONES CONVERSATION PARTICIPANTS
    // ====================================================

    await database.query(`
      ALTER TABLE conversation_participants
      ADD COLUMN IF NOT EXISTS role VARCHAR(30)
      DEFAULT 'member';
    `);

    await database.query(`
      ALTER TABLE conversation_participants
      ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ
      DEFAULT NOW();
    `);

    await database.query(`
      ALTER TABLE conversation_participants
      ADD COLUMN IF NOT EXISTS muted BOOLEAN
      DEFAULT FALSE;
    `);

    await database.query(`
      ALTER TABLE conversation_participants
      ADD COLUMN IF NOT EXISTS archived BOOLEAN
      DEFAULT FALSE;
    `);

    /*
    ========================================================
     NUEVO:
     ÚLTIMA LECTURA DE LA CONVERSACIÓN

     Necesario para:
     - mensajes leídos
     - contador de no leídos
     - Socket.IO
     - chat privado 1x1
    ========================================================
    */

    await database.query(`
      ALTER TABLE conversation_participants
      ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;
    `);


    await database.query(`
      CREATE INDEX IF NOT EXISTS
      conversation_participants_user_idx
      ON conversation_participants(user_id);
    `);


    await database.query(`
      CREATE INDEX IF NOT EXISTS
      conversation_participants_conversation_idx
      ON conversation_participants(conversation_id);
    `);


    // ====================================================
    // MESSAGES
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS messages (

        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),

        conversation_id UUID
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
    // MIGRACIONES MESSAGES BÁSICAS
    // ====================================================

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS conversation_id UUID;
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS sender_user_id UUID;
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS message_type VARCHAR(30)
      DEFAULT 'text';
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS content TEXT;
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
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ
      DEFAULT NOW();
    `);
    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
      DEFAULT NOW();
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    `);

    // Capa 109 — identificador generado por el dispositivo. La combinación
    // remitente + identificador evita duplicados cuando una petición se
    // reintenta después de perder cobertura durante la confirmación.
    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS client_message_id VARCHAR(100);
    `);

    await database.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_client_id_unique
      ON messages(sender_user_id, client_message_id)
      WHERE client_message_id IS NOT NULL;
    `);

    await database.query(`
      CREATE INDEX IF NOT EXISTS messages_expires_at_idx
      ON messages(expires_at)
      WHERE expires_at IS NOT NULL AND deleted = FALSE;
    `);

    // CAPA 2.6.1 — Los adjuntos normales mantienen FALSE y no cambian.
    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS view_once BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
    `);


    // ====================================================
    // MULTIMEDIA
    //
    // Fotos
    // Vídeos
    // Notas de voz
    // Documentos
    // ====================================================

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS file_url TEXT;
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS file_public_id TEXT;
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS file_name TEXT;
    `);

    /*
    ========================================================
     COMPATIBILIDAD MIME

     file_mime:
     - Se conserva para código anterior.

     mime_type:
     - Lo utiliza el nuevo chat privado 1x1.

     NO BORRAMOS NINGUNA COLUMNA.
    ========================================================
    */

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS file_mime TEXT;
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS mime_type TEXT;
    `);


    // ====================================================
    // MIGRAR MIME ANTIGUO -> NUEVO
    // ====================================================

    await database.query(`
      UPDATE messages
      SET mime_type = file_mime
      WHERE mime_type IS NULL
        AND file_mime IS NOT NULL;
    `);


    // ====================================================
    // MANTENER COMPATIBILIDAD NUEVO -> ANTIGUO
    // ====================================================

    await database.query(`
      UPDATE messages
      SET file_mime = mime_type
      WHERE file_mime IS NULL
        AND mime_type IS NOT NULL;
    `);


    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS file_size BIGINT;
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS file_resource_type VARCHAR(40);
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS media_duration NUMERIC;
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS media_width INTEGER;
    `);

    await database.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS media_height INTEGER;
    `);


    // ====================================================
    // COMPATIBILIDAD sender_id ANTIGUO
    // ====================================================

    const hasLegacySenderId =
      await columnExists(
        'messages',
        'sender_id'
      );


    if (hasLegacySenderId) {

      console.log(
        'VOBIXCHAT DATABASE: sender_id legacy detectado'
      );

      await database.query(`
        ALTER TABLE messages
        ALTER COLUMN sender_id DROP NOT NULL;
      `);

      await database.query(`
        UPDATE messages
        SET sender_user_id = sender_id
        WHERE sender_user_id IS NULL
          AND sender_id IS NOT NULL;
      `);

      console.log(
        'VOBIXCHAT DATABASE: compatibilidad sender_id preparada'
      );

    }


    // ====================================================
    // COMPATIBILIDAD COLUMNA text ANTIGUA
    // ====================================================

    const hasLegacyText =
      await columnExists(
        'messages',
        'text'
      );


    if (hasLegacyText) {

      await database.query(`
        UPDATE messages
        SET content = text
        WHERE content IS NULL
          AND text IS NOT NULL;
      `);

    }


    // ====================================================
    // FOREIGN KEY conversation_id
    // ====================================================

    await database.query(`
      DO $$
      BEGIN

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'messages'::regclass
            AND conname = 'messages_conversation_id_fkey'
        ) THEN

          ALTER TABLE messages
          ADD CONSTRAINT messages_conversation_id_fkey
          FOREIGN KEY (conversation_id)
          REFERENCES conversations(id)
          ON DELETE CASCADE;

        END IF;

      END
      $$;
    `);


    // ====================================================
    // FOREIGN KEY sender_user_id
    // ====================================================

    await database.query(`
      DO $$
      BEGIN

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'messages'::regclass
            AND conname = 'messages_sender_user_id_fkey'
        ) THEN

          ALTER TABLE messages
          ADD CONSTRAINT messages_sender_user_id_fkey
          FOREIGN KEY (sender_user_id)
          REFERENCES users(id)
          ON DELETE SET NULL;

        END IF;

      END
      $$;
    `);


    // ====================================================
    // ÍNDICE MENSAJES
    // ====================================================

    await database.query(`
      CREATE INDEX IF NOT EXISTS
      messages_conversation_created_idx
      ON messages(
        conversation_id,
        created_at DESC
      );
    `);


    // ====================================================
    // CAPA 2.2 — ENCUESTAS PRIVADAS
    //
    // Las encuestas no se guardan en el navegador. Quedan
    // ligadas al chat y el voto único se impone mediante una
    // restricción de PostgreSQL, no mediante un botón.
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS chat_polls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question VARCHAR(280) NOT NULL,
        closed_at TIMESTAMPTZ,
        closes_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await database.query(`
      CREATE TABLE IF NOT EXISTS chat_poll_options (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        poll_id UUID NOT NULL REFERENCES chat_polls(id) ON DELETE CASCADE,
        label VARCHAR(160) NOT NULL,
        position SMALLINT NOT NULL,
        UNIQUE(poll_id, position)
      );
    `);

    await database.query(`
      CREATE TABLE IF NOT EXISTS chat_poll_votes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        poll_id UUID NOT NULL REFERENCES chat_polls(id) ON DELETE CASCADE,
        option_id UUID NOT NULL REFERENCES chat_poll_options(id) ON DELETE CASCADE,
        voter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(poll_id, voter_user_id)
      );
    `);

    await database.query(`
      CREATE INDEX IF NOT EXISTS chat_polls_conversation_created_idx
      ON chat_polls(conversation_id, created_at DESC);
    `);

    await database.query(`
      CREATE INDEX IF NOT EXISTS chat_poll_votes_poll_idx
      ON chat_poll_votes(poll_id);
    `);


    // ====================================================
    // MESSAGE RECEIPTS
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

        created_at TIMESTAMPTZ
          DEFAULT NOW(),

        UNIQUE (
          message_id,
          user_id
        )

      );
    `);

    // Capa 116 — CREATE TABLE IF NOT EXISTS no repara instalaciones
    // antiguas incompletas. Estas migraciones son aditivas e idempotentes.
    await database.query(`
      ALTER TABLE message_receipts
      ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES messages(id) ON DELETE CASCADE;
    `);

    await database.query(`
      ALTER TABLE message_receipts
      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
    `);

    await database.query(`
      ALTER TABLE message_receipts
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
    `);

    await database.query(`
      ALTER TABLE message_receipts
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
    `);

    await database.query(`
      ALTER TABLE message_receipts
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    `);

    await database.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS message_receipts_message_user_unique
      ON message_receipts(message_id,user_id);
    `);

    await database.query(`
      CREATE INDEX IF NOT EXISTS message_receipts_user_idx
      ON message_receipts(user_id);
    `);

    console.log('VOBIXCHAT DATABASE: recibos de mensajes verificados');


    // ====================================================
    // TRUST SIGNALS
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

        created_at TIMESTAMPTZ
          DEFAULT NOW()

      );
    `);


    await database.query(`
      CREATE INDEX IF NOT EXISTS
           trust_signals_user_idx
      ON trust_signals(user_id);
    `);


    // ====================================================
    // AUDIT EVENTS
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

        created_at TIMESTAMPTZ
          DEFAULT NOW()

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
    // CAPA 166 — VOBIX GUARDIÁN FAMILIAR
    // ====================================================
    await database.query(`
      CREATE TABLE IF NOT EXISTS guardian_relationships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        protected_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        guardian_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'invited'
          CHECK (status IN ('invited','active','rejected','revoked')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (protected_user_id <> guardian_user_id),
        UNIQUE (protected_user_id, guardian_user_id)
      );
    `);

    await database.query(`
      CREATE INDEX IF NOT EXISTS guardian_relationships_user_status_idx
      ON guardian_relationships(protected_user_id, status);
    `);

    await database.query(`
      CREATE TABLE IF NOT EXISTS guardian_review_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        relationship_id UUID NOT NULL REFERENCES guardian_relationships(id) ON DELETE CASCADE,
        protected_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        guardian_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category VARCHAR(20) NOT NULL CHECK (category IN ('money','document','code')),
        summary VARCHAR(240) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','approved','rejected','cancelled','expired')),
        expires_at TIMESTAMPTZ NOT NULL,
        decided_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await database.query(`
      CREATE INDEX IF NOT EXISTS guardian_review_pending_idx
      ON guardian_review_requests(guardian_user_id, status, expires_at);
    `);

    // ====================================================
    // VOBIX TE ENSEÑA
    // ====================================================
    await database.query(`
      CREATE TABLE IF NOT EXISTS learning_progress (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_key VARCHAR(60) NOT NULL,
        lesson_key VARCHAR(80) NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        score INTEGER CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, course_key, lesson_key)
      );
    `);

    await database.query(`
      CREATE INDEX IF NOT EXISTS learning_progress_user_course_idx
      ON learning_progress(user_id, course_key);
    `);

    // Evolución segura del progreso: dos evaluaciones obligatorias por lección.
    await database.query(`
      ALTER TABLE learning_progress
      ADD COLUMN IF NOT EXISTS checkpoint_score INTEGER CHECK (checkpoint_score IS NULL OR (checkpoint_score >= 0 AND checkpoint_score <= 100)),
      ADD COLUMN IF NOT EXISTS final_score INTEGER CHECK (final_score IS NULL OR (final_score >= 0 AND final_score <= 100)),
      ADD COLUMN IF NOT EXISTS checkpoint_passed BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS final_passed BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await database.query(`
      CREATE TABLE IF NOT EXISTS learning_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_key VARCHAR(60) NOT NULL,
        lesson_key VARCHAR(80) NOT NULL,
        assessment_kind VARCHAR(20) NOT NULL CHECK (assessment_kind IN ('checkpoint','final')),
        score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
        answers JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await database.query(`
      CREATE TABLE IF NOT EXISTS learning_room_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_key VARCHAR(60) NOT NULL,
        body TEXT NOT NULL CHECK (char_length(body) <= 3000),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, course_key)
      );
    `);

    await database.query(`
      CREATE TABLE IF NOT EXISTS learning_profiles (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_key VARCHAR(60) NOT NULL,
        current_level INTEGER NOT NULL DEFAULT 1 CHECK (current_level BETWEEN 1 AND 20),
        current_lesson INTEGER NOT NULL DEFAULT 1 CHECK (current_lesson BETWEEN 1 AND 20),
        xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
        streak_days INTEGER NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
        last_activity_on DATE,
        review_queue JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, course_key)
      );
    `);

    await database.query(`
      CREATE TABLE IF NOT EXISTS learning_activity_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_key VARCHAR(60) NOT NULL,
        lesson_key VARCHAR(80) NOT NULL,
        activity_kind VARCHAR(20) NOT NULL,
        score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
        passed BOOLEAN NOT NULL DEFAULT FALSE,
        response_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (activity_kind IN ('written-1','spoken-1','written-2','spoken-2'))
      );
    `);

    await database.query(`
      CREATE INDEX IF NOT EXISTS learning_activity_attempts_user_lesson_idx
      ON learning_activity_attempts(user_id, course_key, lesson_key, created_at DESC);
    `);

    // Claves públicas para cifrado E2E de los chats privados.
    // La clave privada nunca se guarda en el servidor.
    await database.query(`
      CREATE TABLE IF NOT EXISTS user_e2e_keys (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        public_key_jwk JSONB NOT NULL,
        fingerprint VARCHAR(128) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);


    // ====================================================
    // VOBIX PREMIUM — SUSCRIPCIONES
    // ====================================================

    await database.query(`
      CREATE TABLE IF NOT EXISTS premium_subscriptions (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        plan VARCHAR(20) NOT NULL DEFAULT 'free',
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        provider VARCHAR(40),
        provider_customer_id VARCHAR(200),
        provider_subscription_id VARCHAR(200),
        current_period_end TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (plan IN ('free', 'premium', 'business')),
        CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'expired'))
      );
    `);

    await database.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS premium_provider_subscription_unique
      ON premium_subscriptions(provider, provider_subscription_id)
      WHERE provider IS NOT NULL AND provider_subscription_id IS NOT NULL;
    `);

    await database.query(`
      CREATE TABLE IF NOT EXISTS premium_service_settings (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        capability_id VARCHAR(40) NOT NULL,
        setup_state VARCHAR(20) NOT NULL DEFAULT 'draft',
        display_name VARCHAR(80),
        locale VARCHAR(10) NOT NULL DEFAULT 'es',
        onboarding_step INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, capability_id),
        CHECK (setup_state IN ('draft', 'ready', 'paused')),
        CHECK (onboarding_step BETWEEN 0 AND 20)
      );
    `);

    await database.query(`
      CREATE TABLE IF NOT EXISTS meet_rooms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(120) NOT NULL,
        access_code_hash TEXT NOT NULL UNIQUE,
        waiting_room BOOLEAN NOT NULL DEFAULT TRUE,
        allow_guests BOOLEAN NOT NULL DEFAULT FALSE,
        max_participants INTEGER NOT NULL DEFAULT 1000,
        scheduled_for TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (max_participants BETWEEN 2 AND 1000),
        CHECK (status IN ('scheduled', 'active', 'ended', 'cancelled'))
      );
    `);

    await database.query(`
      ALTER TABLE meet_rooms
      ALTER COLUMN max_participants SET DEFAULT 1000;
      ALTER TABLE meet_rooms
      DROP CONSTRAINT IF EXISTS meet_rooms_max_participants_check;
      ALTER TABLE meet_rooms
      ADD CONSTRAINT meet_rooms_max_participants_check
      CHECK (max_participants BETWEEN 2 AND 1000);
    `);

    await database.query(`
      CREATE TABLE IF NOT EXISTS meet_participants (
        room_id UUID NOT NULL REFERENCES meet_rooms(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'participant',
        state VARCHAR(20) NOT NULL DEFAULT 'waiting',
        joined_at TIMESTAMPTZ,
        left_at TIMESTAMPTZ,
        PRIMARY KEY (room_id, user_id),
        CHECK (role IN ('owner', 'moderator', 'participant')),
        CHECK (state IN ('invited', 'waiting', 'admitted', 'left', 'removed'))
      );
    `);

    await database.query(`CREATE INDEX IF NOT EXISTS meet_rooms_owner_status_idx ON meet_rooms(owner_id, status);`);

    // ====================================================
    // FINAL
    // ====================================================

    console.log(
      'VOBIXCHAT DATABASE: estructura preparada correctamente'
    );

    console.log(
      'VOBIXCHAT DATABASE: users verificada'
    );

    console.log(
      'VOBIXCHAT DATABASE: avatar_url verificado'
    );

    console.log(
      'VOBIXCHAT DATABASE: conversations verificada'
    );

    console.log(
      'VOBIXCHAT DATABASE: participants + last_read_at verificada'
    );

    console.log(
      'VOBIXCHAT DATABASE: messages verificada'
    );

    console.log(
      'VOBIXCHAT DATABASE: multimedia + mime_type verificada'
    );

    console.log(
      'VOBIXCHAT DATABASE: push_subscriptions verificada'
    );

    console.log(
      'VOBIXCHAT DATABASE: premium_subscriptions verificada'
    );

    console.log(
      'VOBIXCHAT DATABASE: premium_service_settings verificada'
    );

    console.log(
      'VOBIXCHAT DATABASE: meet_rooms + meet_participants verificadas'
    );

    console.log(
      'VOBIXCHAT DATABASE: compatibilidad legacy verificada'
    );

    console.log(
      'VOBIXCHAT DATABASE: migraciones completadas'
    );


    return true;


  } catch (error) {

    console.error(
      'VOBIXCHAT DATABASE SCHEMA ERROR:',
      error.message
    );


    console.error(
      error
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
