'use strict';

/*
==========================================================
 VOBIXCHAT
 routes/chat.js

 NÚCLEO DE CHAT PRIVADO

 - Buscar usuarios
 - Contactos
 - Bloquear / desbloquear
 - Crear conversación privada
 - Listar conversaciones
 - Cargar mensajes
 - Enviar mensajes
 - Fotos
 - Vídeos
 - Notas de voz
 - Documentos
 - Compatibilidad frontend VOBIXCHAT
==========================================================
*/

const express = require('express');
const database = require('../database/db');

const router = express.Router();


// ========================================================
// UTILIDADES
// ========================================================

function cleanSearch(value) {
  return String(value || '')
    .trim()
    .slice(0, 100);
}

function cleanId(value) {
  return String(value || '')
    .trim();
}

function cleanMessage(value) {
  return String(value || '')
    .trim()
    .slice(0, 10000);
}


// ========================================================
// COMPROBAR ACCESO A CONVERSACIÓN
// ========================================================

async function canAccessConversation(
  conversationId,
  userId
) {
  if (!conversationId || !userId) {
    return false;
  }

  const result =
    await database.query(
      `
      SELECT 1
      FROM conversation_participants
      WHERE
        conversation_id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [
        conversationId,
        userId
      ]
    );

  return result.rows.length > 0;
}


// ========================================================
// COMPROBAR BLOQUEO ENTRE PARTICIPANTES
// ========================================================

async function conversationIsBlocked(
  conversationId,
  userId
) {
  const blocked =
    await database.query(
      `
      SELECT 1
      FROM conversation_participants cp

      INNER JOIN user_blocks ub
        ON
        (
          (
            ub.blocker_user_id = $2
            AND
            ub.blocked_user_id = cp.user_id
          )
          OR
          (
            ub.blocker_user_id = cp.user_id
            AND
            ub.blocked_user_id = $2
          )
        )

      WHERE
        cp.conversation_id = $1
        AND cp.user_id <> $2

      LIMIT 1
      `,
      [
        conversationId,
        userId
      ]
    );

  return blocked.rows.length > 0;
}


// ========================================================
// BUSCAR USUARIOS
// ========================================================

async function searchUsersHandler(
  req,
  res
) {
  const currentUserId =
    req.vobixUser.id;

  const search =
    cleanSearch(
      req.query.q
    );

  if (search.length < 2) {
    return res.json({
      ok: true,
      users: []
    });
  }

  /*
    BÚSQUEDA VOBIXCHAT

    Permite buscar por:

    - nombre
    - Vobix ID
    - teléfono

    También normaliza el teléfono para que:

    +34 655 766 134

    pueda encontrarse escribiendo:

    34655766134
    655766134
  */

  const phoneDigits =
    search.replace(/\D/g, '');

  try {
    const result =
      await database.query(
        `
        SELECT
          id,
          username,
          vobix_id,
          phone,
          avatar_url,
          bio,
          verified,
          online,
          last_seen

        FROM users

        WHERE
          id <> $1
          AND verified = TRUE

          AND
          (
            LOWER(
              COALESCE(
                username,
                ''
              )
            )
            LIKE LOWER($2)

            OR

            LOWER(
              COALESCE(
                vobix_id,
                ''
              )
            )
            LIKE LOWER($2)

            OR

            COALESCE(
              phone,
              ''
            )
            LIKE $3

            OR

            REGEXP_REPLACE(
              COALESCE(
                phone,
                ''
              ),
              '[^0-9]',
              '',
              'g'
            )
            LIKE $4
          )

        ORDER BY
          CASE

            WHEN LOWER(
              COALESCE(
                username,
                ''
              )
            ) = LOWER($5)
            THEN 0

            WHEN LOWER(
              COALESCE(
                vobix_id,
                ''
              )
            ) = LOWER($5)
            THEN 1

            WHEN REGEXP_REPLACE(
              COALESCE(
                phone,
                ''
              ),
              '[^0-9]',
              '',
              'g'
            ) = $6
            THEN 2

            ELSE 3
          END,

          username ASC

        LIMIT 30
        `,
        [
          currentUserId,
          `%${search}%`,
          `%${search}%`,
          `%${phoneDigits}%`,
          search,
          phoneDigits
        ]
      );

    return res.json({
      ok: true,
      users: result.rows
    });

  } catch (error) {
    console.error(
      'VOBIXCHAT USER SEARCH ERROR:',
      error
    );

    return res
      .status(500)
      .json({
        ok: false,
        msg:
          'No se pudo realizar la búsqueda',

        detail:
          process.env.NODE_ENV ===
          'production'
            ? undefined
            : error.message
      });
  }
}


// ========================================================
// RUTAS DE BÚSQUEDA
// ========================================================

router.get(
  '/users/search',
  searchUsersHandler
);

router.get(
  '/search',
  searchUsersHandler
);


// ========================================================
// IMPORTANTE
// ========================================================
//
// El resto de routes/chat.js que ya tienes
// NO DEBE BORRARSE.
//
// La modificación que necesitas está arriba:
// searchUsersHandler + las dos rutas.
//
// ========================================================
