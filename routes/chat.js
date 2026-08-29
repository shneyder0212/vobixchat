'use strict';

/*
==========================================================
 VOBIXCHAT
 routes/chat.js

 CHAT PRIVADO 1X1
 - Buscar usuarios
 - Contactos
 - Bloqueos
 - Crear / recuperar sala privada
 - Historial
 - Mensajes
 - Fotos / cámara
 - Vídeos
 - Audio / notas de voz
 - Documentos
==========================================================
*/

const express = require('express');
const database = require('../database/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

/* ======================================================
   UTILIDADES
====================================================== */

function cleanId(value) {
  return String(value || '').trim();
}

function cleanSearch(value) {
  return String(value || '')
    .trim()
    .slice(0, 100);
}

function cleanMessage(value) {
  return String(value || '')
    .trim()
    .slice(0, 10000);
}

function safeFileName(value) {
  const original = String(value || 'archivo');

  return (
    original
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 180) ||
    'archivo'
  );
}

async function canAccessConversation(
  conversationId,
  userId
) {
  if (!conversationId || !userId) {
    return false;
  }

  const result = await database.query(
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

async function conversationIsBlocked(
  conversationId,
  userId
) {
  const result = await database.query(
    `
    SELECT 1
    FROM conversation_participants cp

    INNER JOIN user_blocks ub
      ON
      (
        (
          ub.blocker_user_id = $2
          AND ub.blocked_user_id = cp.user_id
        )
        OR
        (
          ub.blocker_user_id = cp.user_id
          AND ub.blocked_user_id = $2
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

  return result.rows.length > 0;
}

function normalizeMessage(row) {
  if (!row) {
    return null;
  }

  const messageType =
    String(
      row.message_type ||
      row.messageType ||
      'text'
    );

  const content =
    row.content == null
      ? ''
      : String(row.content);

  const mediaTypes = [
    'image',
    'photo',
    'video',
    'audio',
    'voice',
    'document',
    'file'
  ];

  const isMedia =
    mediaTypes.includes(messageType);

  return {
    id: row.id,

    conversationId:
      row.conversation_id,

    conversation_id:
      row.conversation_id,

    senderId:
      row.sender_user_id,

    sender_user_id:
      row.sender_user_id,

    senderUsername:
      row.sender_username || null,

    sender_username:
      row.sender_username || null,

    senderAvatarUrl:
      row.sender_avatar_url || null,

    messageType,

    message_type:
      messageType,

    content,

    mediaUrl:
      isMedia ? content : null,

    media_url:
      isMedia ? content : null,

    fileName:
      row.file_name ||
      row.fileName ||
      null,

    edited:
      Boolean(row.edited),

    deleted:
      Boolean(row.deleted),

    createdAt:
      row.created_at,

    created_at:
      row.created_at,

    updatedAt:
      row.updated_at,

    updated_at:
      row.updated_at
  };
}

/* ======================================================
   BUSCAR USUARIOS
====================================================== */

async function searchUsersHandler(req, res) {
  const currentUserId =
    req.vobixUser.id;

  const search =
    cleanSearch(req.query.q);

  if (search.length < 2) {
    return res.json({
      ok: true,
      users: []
    });
  }

  try {
    const result = await database.query(
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
          LOWER(username)
            LIKE LOWER($2)

          OR
          (
            discover_by_vobix_id = TRUE
            AND vobix_id IS NOT NULL
            AND LOWER(vobix_id)
              LIKE LOWER($2)
          )

          OR
          (
            discover_by_phone = TRUE
            AND phone LIKE $3
          )
        )

      ORDER BY
        CASE
          WHEN LOWER(username) = LOWER($4)
          THEN 0
          ELSE 1
        END,
        username ASC

      LIMIT 30
      `,
      [
        currentUserId,
        `%${search}%`,
        `%${search}%`,
        search
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
          'No se pudo realizar la búsqueda'
      });
  }
}

router.get(
  '/users/search',
  searchUsersHandler
);

/* Compatibilidad frontend anterior */
router.get(
  '/search',
  searchUsersHandler
);

/* ======================================================
   LISTAR CONTACTOS
====================================================== */

router.get(
  '/contacts',
  async (req, res) => {
    const userId =
      req.vobixUser.id;

    try {
      const result = await database.query(
        `
        SELECT
          u.id,
          u.username,
          u.vobix_id,
          u.phone,
          u.avatar_url,
          u.bio,
          u.verified,
          u.online,
          u.last_seen,
          c.alias,
          c.created_at AS contact_created_at

        FROM contacts c

        INNER JOIN users u
          ON u.id = c.contact_user_id

        WHERE
          c.owner_user_id = $1

        ORDER BY
          COALESCE(
            c.alias,
            u.username
          ) ASC
        `,
        [userId]
      );

      return res.json({
        ok: true,
        contacts: result.rows
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT CONTACT LIST ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudieron cargar los contactos'
        });
    }
  }
);

/* ======================================================
   AGREGAR CONTACTO
====================================================== */

router.post(
  '/contacts',
  async (req, res) => {
    const ownerUserId =
      req.vobixUser.id;

    const contactUserId =
      cleanId(
        req.body.userId ||
        req.body.contactUserId ||
        req.body.contact_user_id
      );

    const alias =
      String(req.body.alias || '')
        .trim()
        .slice(0, 100);

    if (!contactUserId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg: 'Contacto no válido'
        });
    }

    if (
      String(ownerUserId) ===
      String(contactUserId)
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'No puedes agregarte a ti mismo'
        });
    }

    try {
      const userResult =
        await database.query(
          `
          SELECT
            id,
            username,
            vobix_id,
            phone,
            avatar_url

          FROM users

          WHERE
            id = $1
            AND verified = TRUE

          LIMIT 1
          `,
          [contactUserId]
        );

      if (
        userResult.rows.length === 0
      ) {
        return res
          .status(404)
          .json({
            ok: false,
            msg:
              'Usuario no encontrado'
          });
      }

      const result =
        await database.query(
          `
          INSERT INTO contacts
          (
            owner_user_id,
            contact_user_id,
            alias,
            created_at
          )

          VALUES
          (
            $1,
            $2,
            NULLIF($3, ''),
            NOW()
          )

          ON CONFLICT
          (
            owner_user_id,
            contact_user_id
          )

          DO UPDATE SET
            alias =
              COALESCE(
                NULLIF(
                  EXCLUDED.alias,
                  ''
                ),
                contacts.alias
              )

          RETURNING
            owner_user_id,
            contact_user_id,
            alias,
            created_at
          `,
          [
            ownerUserId,
            contactUserId,
            alias
          ]
        );

      return res.json({
        ok: true,
        contact:
          result.rows[0],
        user:
          userResult.rows[0]
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT ADD CONTACT ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo agregar el contacto'
        });
    }
  }
);

/* ======================================================
   ELIMINAR CONTACTO
====================================================== */

router.delete(
  '/contacts/:userId',
  async (req, res) => {
    const ownerUserId =
      req.vobixUser.id;

    const contactUserId =
      cleanId(req.params.userId);

    if (!contactUserId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg: 'Contacto no válido'
        });
    }

    try {
      await database.query(
        `
        DELETE FROM contacts
        WHERE
          owner_user_id = $1
          AND contact_user_id = $2
        `,
        [
          ownerUserId,
          contactUserId
        ]
      );

      return res.json({
        ok: true
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT DELETE CONTACT ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo eliminar el contacto'
        });
    }
  }
);
/* ======================================================
   BLOQUE 2/6
   BLOQUEOS + CREAR / RECUPERAR SALA PRIVADA 1X1
====================================================== */


/* ======================================================
   BLOQUEAR USUARIO
====================================================== */

router.post(
  '/blocks',
  async (req, res) => {
    const blockerUserId =
      req.vobixUser.id;

    const blockedUserId =
      cleanId(
        req.body.userId ||
        req.body.blockedUserId ||
        req.body.blocked_user_id
      );

    if (!blockedUserId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg: 'Usuario no válido'
        });
    }

    if (
      String(blockerUserId) ===
      String(blockedUserId)
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'No puedes bloquearte a ti mismo'
        });
    }

    try {
      const userResult =
        await database.query(
          `
          SELECT
            id,
            username,
            vobix_id,
            phone,
            avatar_url

          FROM users

          WHERE
            id = $1

          LIMIT 1
          `,
          [blockedUserId]
        );

      if (
        userResult.rows.length === 0
      ) {
        return res
          .status(404)
          .json({
            ok: false,
            msg:
              'Usuario no encontrado'
          });
      }

      const result =
        await database.query(
          `
          INSERT INTO user_blocks
          (
            blocker_user_id,
            blocked_user_id,
            created_at
          )

          VALUES
          (
            $1,
            $2,
            NOW()
          )

          ON CONFLICT
          (
            blocker_user_id,
            blocked_user_id
          )

          DO NOTHING

          RETURNING
            blocker_user_id,
            blocked_user_id,
            created_at
          `,
          [
            blockerUserId,
            blockedUserId
          ]
        );

      return res.json({
        ok: true,
        blocked: true,

        block:
          result.rows[0] || {
            blocker_user_id:
              blockerUserId,

            blocked_user_id:
              blockedUserId
          }
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT BLOCK USER ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo bloquear el usuario'
        });
    }
  }
);


/* ======================================================
   DESBLOQUEAR USUARIO
====================================================== */

router.delete(
  '/blocks/:userId',
  async (req, res) => {
    const blockerUserId =
      req.vobixUser.id;

    const blockedUserId =
      cleanId(
        req.params.userId
      );

    if (!blockedUserId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Usuario no válido'
        });
    }

    try {
      await database.query(
        `
        DELETE FROM user_blocks

        WHERE
          blocker_user_id = $1
          AND blocked_user_id = $2
        `,
        [
          blockerUserId,
          blockedUserId
        ]
      );

      return res.json({
        ok: true,
        blocked: false
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT UNBLOCK USER ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo desbloquear el usuario'
        });
    }
  }
);


/* ======================================================
   LISTAR USUARIOS BLOQUEADOS
====================================================== */

router.get(
  '/blocks',
  async (req, res) => {
    const userId =
      req.vobixUser.id;

    try {
      const result =
        await database.query(
          `
          SELECT
            u.id,
            u.username,
            u.vobix_id,
            u.phone,
            u.avatar_url,
            u.bio,
            u.online,
            u.last_seen,
            ub.created_at AS blocked_at

          FROM user_blocks ub

          INNER JOIN users u
            ON
              u.id =
                ub.blocked_user_id

          WHERE
            ub.blocker_user_id = $1

          ORDER BY
            ub.created_at DESC
          `,
          [userId]
        );

      return res.json({
        ok: true,
        users: result.rows,
        blocks: result.rows
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT BLOCK LIST ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudieron cargar los usuarios bloqueados'
        });
    }
  }
);


/* ======================================================
   COMPROBAR BLOQUEO ENTRE DOS USUARIOS
====================================================== */

async function usersAreBlocked(
  userA,
  userB
) {
  const result =
    await database.query(
      `
      SELECT 1

      FROM user_blocks

      WHERE
        (
          blocker_user_id = $1
          AND blocked_user_id = $2
        )

        OR

        (
          blocker_user_id = $2
          AND blocked_user_id = $1
        )

      LIMIT 1
      `,
      [
        userA,
        userB
      ]
    );

  return result.rows.length > 0;
}


/* ======================================================
   BUSCAR CONVERSACIÓN PRIVADA 1X1 EXISTENTE
====================================================== */

async function findPrivateConversation(
  currentUserId,
  otherUserId,
  client = database
) {
  const result =
    await client.query(
      `
      SELECT
        c.id,
        c.created_at,
        c.updated_at

      FROM conversations c

      INNER JOIN conversation_participants me
        ON
          me.conversation_id = c.id
          AND me.user_id = $1

      INNER JOIN conversation_participants other_cp
        ON
          other_cp.conversation_id = c.id
          AND other_cp.user_id = $2

      WHERE
        NOT EXISTS
        (
          SELECT 1

          FROM conversation_participants extra

          WHERE
            extra.conversation_id = c.id

            AND extra.user_id
              NOT IN ($1, $2)
        )

      ORDER BY
        c.updated_at DESC NULLS LAST,
        c.created_at DESC

      LIMIT 1
      `,
      [
        currentUserId,
        otherUserId
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}


/* ======================================================
   OBTENER DATOS DEL OTRO USUARIO
====================================================== */

async function getChatUser(
  userId,
  client = database
) {
  const result =
    await client.query(
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
        id = $1
        AND verified = TRUE

      LIMIT 1
      `,
      [userId]
    );

  return (
    result.rows[0] ||
    null
  );
}


/* ======================================================
   CREAR / RECUPERAR CONVERSACIÓN PRIVADA 1X1
====================================================== */

router.post(
  '/conversations',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    const otherUserId =
      cleanId(
        req.body.userId ||
        req.body.otherUserId ||
        req.body.other_user_id
      );

    if (!otherUserId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Usuario no válido'
        });
    }

    if (
      String(currentUserId) ===
      String(otherUserId)
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'No puedes crear una conversación contigo mismo'
        });
    }

    let client = null;

    try {
      const otherUser =
        await getChatUser(
          otherUserId
        );

      if (!otherUser) {
        return res
          .status(404)
          .json({
            ok: false,
            msg:
              'Usuario no encontrado'
          });
      }

      const blocked =
        await usersAreBlocked(
          currentUserId,
          otherUserId
        );

      if (blocked) {
        return res
          .status(403)
          .json({
            ok: false,
            msg:
              'No se puede abrir esta conversación porque existe un bloqueo'
          });
      }

      /*
      ====================================================
       PRIMERO BUSCAR UNA SALA 1X1 EXISTENTE
      ====================================================
      */

      const existing =
        await findPrivateConversation(
          currentUserId,
          otherUserId
        );

      if (existing) {
        return res.json({
          ok: true,

          created: false,

          conversationId:
            existing.id,

          conversation: {
            id:
              existing.id,

            conversationId:
              existing.id,

            createdAt:
              existing.created_at,

            updatedAt:
              existing.updated_at
          },

          user:
            otherUser,

          otherUser:
            otherUser
        });
      }

      /*
      ====================================================
       CREAR SALA NUEVA EN TRANSACCIÓN
      ====================================================
      */

      if (
        database.connect &&
        typeof database.connect ===
          'function'
      ) {
        client =
          await database.connect();
      }

      const db =
        client || database;

      if (client) {
        await client.query(
          'BEGIN'
        );
      }

      /*
       * Comprobar una segunda vez antes de crear.
       * Reduce la posibilidad de salas duplicadas.
       */

      const secondCheck =
        await findPrivateConversation(
          currentUserId,
          otherUserId,
          db
        );

      if (secondCheck) {
        if (client) {
          await client.query(
            'COMMIT'
          );
        }

        return res.json({
          ok: true,

          created: false,

          conversationId:
            secondCheck.id,

          conversation: {
            id:
              secondCheck.id,

            conversationId:
              secondCheck.id,

            createdAt:
              secondCheck.created_at,

            updatedAt:
              secondCheck.updated_at
          },

          user:
            otherUser,

          otherUser:
            otherUser
        });
      }

      const conversationResult =
        await db.query(
          `
          INSERT INTO conversations
          (
            created_at,
            updated_at
          )

          VALUES
          (
            NOW(),
            NOW()
          )

          RETURNING
            id,
            created_at,
            updated_at
          `
        );

      const conversation =
        conversationResult.rows[0];

      await db.query(
        `
        INSERT INTO conversation_participants
        (
          conversation_id,
          user_id,
          joined_at
        )

        VALUES
          (
            $1,
            $2,
            NOW()
          ),
          (
            $1,
            $3,
            NOW()
          )

        ON CONFLICT
        (
          conversation_id,
          user_id
        )

        DO NOTHING
        `,
        [
          conversation.id,
          currentUserId,
          otherUserId
        ]
      );

      if (client) {
        await client.query(
          'COMMIT'
        );
      }

      return res
        .status(201)
        .json({
          ok: true,

          created: true,

          conversationId:
            conversation.id,

          conversation: {
            id:
              conversation.id,

            conversationId:
              conversation.id,

            createdAt:
              conversation.created_at,

            updatedAt:
              conversation.updated_at
          },

          user:
            otherUser,

          otherUser:
            otherUser
        });

    } catch (error) {
      if (client) {
        try {
          await client.query(
            'ROLLBACK'
          );
        } catch (_) {
          /* No romper respuesta si falla rollback */
        }
      }

      console.error(
        'VOBIXCHAT CREATE CONVERSATION ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo abrir la conversación privada'
        });

    } finally {
      if (
        client &&
        typeof client.release ===
          'function'
      ) {
        client.release();
      }
    }
  }
);


/* ======================================================
   BUSCAR SI YA EXISTE SALA PRIVADA CON UN USUARIO
====================================================== */

router.get(
  '/conversation-with/:userId',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    const otherUserId =
      cleanId(
        req.params.userId
      );

    if (!otherUserId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Usuario no válido'
        });
    }

    if (
      String(currentUserId) ===
      String(otherUserId)
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Usuario no válido'
        });
    }

    try {
      const conversation =
        await findPrivateConversation(
          currentUserId,
          otherUserId
        );

      if (!conversation) {
        return res.json({
          ok: true,
          exists: false,
          conversation: null,
          conversationId: null
        });
      }

      return res.json({
        ok: true,

        exists: true,

        conversationId:
          conversation.id,

        conversation: {
          id:
            conversation.id,

          conversationId:
            conversation.id,

          createdAt:
            conversation.created_at,

          updatedAt:
            conversation.updated_at
        }
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT FIND PRIVATE CONVERSATION ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo buscar la conversación'
        });
    }
  }
);


/* ======================================================
   CONTAR CONVERSACIONES
====================================================== */

router.get(
  '/conversations-count',
  async (req, res) => {
    const userId =
      req.vobixUser.id;

    try {
      const result =
        await database.query(
          `
          SELECT
            COUNT(
              DISTINCT conversation_id
            )::INTEGER AS total

          FROM conversation_participants

          WHERE
            user_id = $1
          `,
          [userId]
        );

      return res.json({
        ok: true,

        total:
          Number(
            result.rows[0]?.total ||
            0
          )
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT CONVERSATION COUNT ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo obtener el número de conversaciones'
        });
    }
  }
);


/* ======================================================
   FIN BLOQUE 2/6
====================================================== */
/* ======================================================
   BLOQUE 3/6
   HISTORIAL + SALA PRIVADA + LEER MENSAJES
====================================================== */


/* ======================================================
   LISTAR HISTORIAL DE CONVERSACIONES
====================================================== */

router.get(
  '/conversations',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    try {
      const result =
        await database.query(
          `
          SELECT
            c.id,
            c.created_at,
            c.updated_at,

            other_user.id
              AS other_user_id,

            other_user.username
              AS other_username,

            other_user.vobix_id
              AS other_vobix_id,

            other_user.phone
              AS other_phone,

            other_user.avatar_url
              AS other_avatar_url,

            other_user.bio
              AS other_bio,

            other_user.online
              AS other_online,

            other_user.last_seen
              AS other_last_seen,

            last_message.id
              AS last_message_id,

            last_message.message_type
              AS last_message_type,

            last_message.content
              AS last_message,

            last_message.sender_user_id
              AS last_message_sender_id,

            last_message.created_at
              AS last_message_created_at

          FROM conversations c

          INNER JOIN conversation_participants me
            ON
              me.conversation_id = c.id
              AND me.user_id = $1

          LEFT JOIN LATERAL
          (
            SELECT
              u.id,
              u.username,
              u.vobix_id,
              u.phone,
              u.avatar_url,
              u.bio,
              u.online,
              u.last_seen

            FROM conversation_participants cp

            INNER JOIN users u
              ON u.id = cp.user_id

            WHERE
              cp.conversation_id = c.id
              AND cp.user_id <> $1

            ORDER BY
              cp.joined_at ASC

            LIMIT 1
          )
          AS other_user
          ON TRUE

          LEFT JOIN LATERAL
          (
            SELECT
              m.id,
              m.message_type,
              m.content,
              m.sender_user_id,
              m.created_at

            FROM messages m

            WHERE
              m.conversation_id = c.id

            ORDER BY
              m.created_at DESC,
              m.id DESC

            LIMIT 1
          )
          AS last_message
          ON TRUE

          ORDER BY
            COALESCE(
              last_message.created_at,
              c.updated_at,
              c.created_at
            ) DESC
          `,
          [
            currentUserId
          ]
        );

      const conversations =
        result.rows.map(
          row => ({
            id:
              row.id,

            conversationId:
              row.id,

            conversation_id:
              row.id,

            createdAt:
              row.created_at,

            created_at:
              row.created_at,

            updatedAt:
              row.updated_at,

            updated_at:
              row.updated_at,

            other_user: {
              id:
                row.other_user_id,

              username:
                row.other_username,

              vobix_id:
                row.other_vobix_id,

              phone:
                row.other_phone,

              avatar_url:
                row.other_avatar_url,

              bio:
                row.other_bio,

              online:
                Boolean(
                  row.other_online
                ),

              last_seen:
                row.other_last_seen
            },

            otherUser: {
              id:
                row.other_user_id,

              username:
                row.other_username,

              vobixId:
                row.other_vobix_id,

              phone:
                row.other_phone,

              avatarUrl:
                row.other_avatar_url,

              bio:
                row.other_bio,

              online:
                Boolean(
                  row.other_online
                ),

              lastSeen:
                row.other_last_seen
            },

            last_message:
              row.last_message,

            lastMessage:
              row.last_message,

            lastMessageId:
              row.last_message_id,

            lastMessageType:
              row.last_message_type,

            lastMessageSenderId:
              row.last_message_sender_id,

            lastMessageCreatedAt:
              row.last_message_created_at
          })
        );

      return res.json({
        ok: true,
        conversations
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT CONVERSATION LIST ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudieron cargar las conversaciones'
        });
    }
  }
);


/* ======================================================
   OBTENER INFORMACIÓN DE UNA CONVERSACIÓN
====================================================== */

router.get(
  '/conversations/:conversationId',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    const conversationId =
      cleanId(
        req.params.conversationId
      );

    if (!conversationId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Conversación no válida'
        });
    }

    try {
      const allowed =
        await canAccessConversation(
          conversationId,
          currentUserId
        );

      if (!allowed) {
        return res
          .status(403)
          .json({
            ok: false,
            msg:
              'No tienes acceso a esta conversación'
          });
      }

      const conversationResult =
        await database.query(
          `
          SELECT
            id,
            created_at,
            updated_at

          FROM conversations

          WHERE
            id = $1

          LIMIT 1
          `,
          [
            conversationId
          ]
        );

      if (
        conversationResult.rows.length ===
        0
      ) {
        return res
          .status(404)
          .json({
            ok: false,
            msg:
              'Conversación no encontrada'
          });
      }

      const participantsResult =
        await database.query(
          `
          SELECT
            u.id,
            u.username,
            u.vobix_id,
            u.phone,
            u.avatar_url,
            u.bio,
            u.verified,
            u.online,
            u.last_seen,
            cp.joined_at

          FROM conversation_participants cp

          INNER JOIN users u
            ON u.id = cp.user_id

          WHERE
            cp.conversation_id = $1

          ORDER BY
            cp.joined_at ASC
          `,
          [
            conversationId
          ]
        );

      const participants =
        participantsResult.rows;

      const otherUser =
        participants.find(
          participant =>
            String(
              participant.id
            ) !==
            String(
              currentUserId
            )
        ) || null;

      return res.json({
        ok: true,

        conversation: {
          id:
            conversationResult.rows[0].id,

          conversationId:
            conversationResult.rows[0].id,

          createdAt:
            conversationResult.rows[0]
              .created_at,

          updatedAt:
            conversationResult.rows[0]
              .updated_at
        },

        participants,

        user:
          otherUser,

        otherUser
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT CONVERSATION INFO ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo cargar la conversación'
        });
    }
  }
);


/* ======================================================
   LEER MENSAJES DE UNA CONVERSACIÓN
====================================================== */

router.get(
  '/conversations/:conversationId/messages',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    const conversationId =
      cleanId(
        req.params.conversationId
      );

    const requestedLimit =
      Number(
        req.query.limit ||
        100
      );

    const limit =
      Math.min(
        Math.max(
          Number.isFinite(
            requestedLimit
          )
            ? requestedLimit
            : 100,
          1
        ),
        200
      );

    const before =
      cleanId(
        req.query.before
      );

    if (!conversationId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Conversación no válida'
        });
    }

    try {
      const allowed =
        await canAccessConversation(
          conversationId,
          currentUserId
        );

      if (!allowed) {
        return res
          .status(403)
          .json({
            ok: false,
            msg:
              'No tienes acceso a esta conversación'
          });
      }

      let result;

      if (before) {
        result =
          await database.query(
            `
            SELECT
              m.id,
              m.conversation_id,
              m.sender_user_id,
              m.message_type,
              m.content,
              m.reply_to_message_id,
              m.edited,
              m.deleted,
              m.created_at,
              m.updated_at,

              u.username
                AS sender_username,

              u.avatar_url
                AS sender_avatar_url

            FROM messages m

            INNER JOIN users u
              ON u.id = m.sender_user_id

            WHERE
              m.conversation_id = $1

              AND m.created_at <
              (
                SELECT
                  created_at

                FROM messages

                WHERE
                  id = $2
                  AND conversation_id = $1

                LIMIT 1
              )

            ORDER BY
              m.created_at DESC,
              m.id DESC

            LIMIT $3
            `,
            [
              conversationId,
              before,
              limit
            ]
          );

      } else {
        result =
          await database.query(
            `
            SELECT
              m.id,
              m.conversation_id,
              m.sender_user_id,
              m.message_type,
              m.content,
              m.reply_to_message_id,
              m.edited,
              m.deleted,
              m.created_at,
              m.updated_at,

              u.username
                AS sender_username,

              u.avatar_url
                AS sender_avatar_url

            FROM messages m

            INNER JOIN users u
              ON u.id = m.sender_user_id

            WHERE
              m.conversation_id = $1

            ORDER BY
              m.created_at DESC,
              m.id DESC

            LIMIT $2
            `,
            [
              conversationId,
              limit
            ]
          );
      }

      /*
       * La consulta obtiene primero los mensajes
       * más recientes. Antes de enviarlos al frontend
       * los ponemos en orden cronológico.
       */

      const rows =
        [...result.rows]
          .reverse();

      const messages =
        rows.map(
          normalizeMessage
        );

      return res.json({
        ok: true,

        conversationId,

        messages,

        hasMore:
          result.rows.length ===
          limit,

        nextBefore:
          messages.length > 0
            ? messages[0].id
            : null
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT MESSAGE HISTORY ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudieron cargar los mensajes'
        });
    }
  }
);


/* ======================================================
   MARCAR CONVERSACIÓN COMO LEÍDA
====================================================== */

router.post(
  '/conversations/:conversationId/read',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    const conversationId =
      cleanId(
        req.params.conversationId
      );

    if (!conversationId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Conversación no válida'
        });
    }

    try {
      const allowed =
        await canAccessConversation(
          conversationId,
          currentUserId
        );

      if (!allowed) {
        return res
          .status(403)
          .json({
            ok: false,
            msg:
              'No tienes acceso a esta conversación'
          });
      }

      /*
       * Algunas instalaciones anteriores pueden no
       * tener todavía la columna last_read_at.
       * Si no existe, el chat no se cae.
       */

      try {
        await database.query(
          `
          UPDATE conversation_participants

          SET
            last_read_at = NOW()

          WHERE
            conversation_id = $1
            AND user_id = $2
          `,
          [
            conversationId,
            currentUserId
          ]
        );

      } catch (readError) {
        /*
         * PostgreSQL 42703:
         * undefined_column
         */

        if (
          readError.code !==
          '42703'
        ) {
          throw readError;
        }
      }

      return res.json({
        ok: true,

        conversationId,

        readAt:
          new Date()
            .toISOString()
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT MARK READ ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo marcar la conversación como leída'
        });
    }
  }
);


/* ======================================================
   OBTENER PARTICIPANTES DE UNA SALA
====================================================== */

router.get(
  '/conversations/:conversationId/participants',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    const conversationId =
      cleanId(
        req.params.conversationId
      );

    if (!conversationId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Conversación no válida'
        });
    }

    try {
      const allowed =
        await canAccessConversation(
          conversationId,
          currentUserId
        );

      if (!allowed) {
        return res
          .status(403)
          .json({
            ok: false,
            msg:
              'No tienes acceso a esta conversación'
          });
      }

      const result =
        await database.query(
          `
          SELECT
            u.id,
            u.username,
            u.vobix_id,
            u.phone,
            u.avatar_url,
            u.bio,
            u.online,
            u.last_seen,
            cp.joined_at

          FROM conversation_participants cp

          INNER JOIN users u
            ON u.id = cp.user_id

          WHERE
            cp.conversation_id = $1

          ORDER BY
            cp.joined_at ASC
          `,
          [
            conversationId
          ]
        );

      return res.json({
        ok: true,

        conversationId,

        participants:
          result.rows
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT PARTICIPANT LIST ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudieron cargar los participantes'
        });
    }
  }
);


/* ======================================================
   FIN BLOQUE 3/6
====================================================== */
/* ======================================================
   BLOQUE 4/6
   ENVIAR + EDITAR + ELIMINAR MENSAJES
   SINCRONIZACIÓN EN TIEMPO REAL
====================================================== */


/* ======================================================
   OBTENER SOCKET.IO DESDE EXPRESS
====================================================== */

function getSocketIO(req) {
  try {
    if (
      req &&
      req.app &&
      typeof req.app.get === 'function'
    ) {
      return req.app.get('io') || null;
    }

    return null;

  } catch (_) {
    return null;
  }
}


/* ======================================================
   EMITIR EVENTO A UNA CONVERSACIÓN
====================================================== */

function emitToConversation(
  req,
  conversationId,
  eventName,
  payload
) {
  const io =
    getSocketIO(req);

  if (!io) {
    return;
  }

  try {
    io
      .to(
        `conversation:${conversationId}`
      )
      .emit(
        eventName,
        payload
      );

  } catch (error) {
    console.error(
      'VOBIXCHAT SOCKET EMIT ERROR:',
      error
    );
  }
}


/* ======================================================
   EMITIR EVENTO DIRECTAMENTE A UN USUARIO
====================================================== */

function emitToUser(
  req,
  userId,
  eventName,
  payload
) {
  const io =
    getSocketIO(req);

  if (
    !io ||
    !userId
  ) {
    return;
  }

  try {
    io
      .to(
        `user:${userId}`
      )
      .emit(
        eventName,
        payload
      );

  } catch (error) {
    console.error(
      'VOBIXCHAT USER SOCKET EMIT ERROR:',
      error
    );
  }
}


/* ======================================================
   OBTENER OTROS PARTICIPANTES
====================================================== */

async function getOtherParticipants(
  conversationId,
  currentUserId
) {
  const result =
    await database.query(
      `
      SELECT
        cp.user_id

      FROM conversation_participants cp

      WHERE
        cp.conversation_id = $1
        AND cp.user_id <> $2
      `,
      [
        conversationId,
        currentUserId
      ]
    );

  return result.rows.map(
    row => row.user_id
  );
}


/* ======================================================
   ENVIAR NOTIFICACIÓN PUSH DE MENSAJE
====================================================== */

async function notifyMessageByPush(
  targetUserId,
  sender,
  message
) {
  try {
    if (
      typeof global.vobixSendPushToUser !==
      'function'
    ) {
      return;
    }

    let body = '';

    switch (
      String(
        message.messageType ||
        message.message_type ||
        'text'
      )
    ) {
      case 'image':
      case 'photo':
        body = '📷 Foto';
        break;

      case 'video':
        body = '🎥 Video';
        break;

      case 'audio':
      case 'voice':
        body = '🎙️ Mensaje de voz';
        break;

      case 'document':
      case 'file':
        body = '📎 Documento';
        break;

      default:
        body =
          String(
            message.content ||
            ''
          ).slice(
            0,
            160
          );
        break;
    }

    await global.vobixSendPushToUser(
      targetUserId,
      {
        type:
          'message',

        title:
          sender?.username ||
          'VOBIXCHAT',

        body,

        conversationId:
          message.conversationId ||
          message.conversation_id,

        senderId:
          sender?.id || null,

        icon:
          sender?.avatar_url ||
          '/icons/icon-192.png',

        badge:
          '/icons/icon-192.png',

        sound:
          'message',

        vibrate:
          [
            180,
            80,
            180
          ]
      }
    );

  } catch (error) {
    console.error(
      'VOBIXCHAT MESSAGE PUSH ERROR:',
      error.message
    );
  }
}


/* ======================================================
   ENVIAR MENSAJE DE TEXTO
====================================================== */

router.post(
  '/conversations/:conversationId/messages',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    const conversationId =
      cleanId(
        req.params.conversationId
      );

    const text =
      cleanMessage(
        req.body.text ||
        req.body.content ||
        req.body.message
      );

    if (!conversationId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Conversación no válida'
        });
    }

    if (!text) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Escribe un mensaje'
        });
    }

    try {
      const allowed =
        await canAccessConversation(
          conversationId,
          currentUserId
        );

      if (!allowed) {
        return res
          .status(403)
          .json({
            ok: false,
            msg:
              'No tienes acceso a esta conversación'
          });
      }

      const blocked =
        await conversationIsBlocked(
          conversationId,
          currentUserId
        );

      if (blocked) {
        return res
          .status(403)
          .json({
            ok: false,
            msg:
              'No puedes enviar mensajes en esta conversación'
          });
      }

      const result =
        await database.query(
          `
          INSERT INTO messages
          (
            conversation_id,
            sender_user_id,
            message_type,
            content,
            edited,
            deleted,
            created_at,
            updated_at
          )

          VALUES
          (
            $1,
            $2,
            'text',
            $3,
            FALSE,
            FALSE,
            NOW(),
            NOW()
          )

          RETURNING
            id,
            conversation_id,
            sender_user_id,
            message_type,
            content,
            edited,
            deleted,
            created_at,
            updated_at
          `,
          [
            conversationId,
            currentUserId,
            text
          ]
        );

      /*
       * Mover conversación arriba del historial.
       */

      await database.query(
        `
        UPDATE conversations

        SET
          updated_at = NOW()

        WHERE
          id = $1
        `,
        [
          conversationId
        ]
      );

      const senderResult =
        await database.query(
          `
          SELECT
            id,
            username,
            avatar_url

          FROM users

          WHERE
            id = $1

          LIMIT 1
          `,
          [
            currentUserId
          ]
        );

      const sender =
        senderResult.rows[0] || {
          id:
            currentUserId,

          username:
            req.vobixUser.username ||
            'VOBIXCHAT',

          avatar_url:
            null
        };

      const row = {
        ...result.rows[0],

        sender_username:
          sender.username,

        sender_avatar_url:
          sender.avatar_url
      };

      const message =
        normalizeMessage(
          row
        );

      const socketPayload = {
        ok:
          true,

        conversationId,

        message
      };


      /* ==================================================
         EVENTO DENTRO DE LA SALA
      ================================================== */

      emitToConversation(
        req,
        conversationId,
        'conversation:new-message',
        socketPayload
      );

      /*
       * Compatibilidad con listeners anteriores.
       */

      emitToConversation(
        req,
        conversationId,
        'chat:message',
        socketPayload
      );


      /* ==================================================
         AVISAR A LOS OTROS PARTICIPANTES
      ================================================== */

      const recipients =
        await getOtherParticipants(
          conversationId,
          currentUserId
        );

      for (
        const targetUserId
        of recipients
      ) {
        emitToUser(
          req,
          targetUserId,
          'conversation:new-message',
          socketPayload
        );

        emitToUser(
          req,
          targetUserId,
          'conversation:updated',
          {
            conversationId,
            message
          }
        );

        notifyMessageByPush(
          targetUserId,
          sender,
          message
        ).catch(
          () => {}
        );
      }

      return res
        .status(201)
        .json({
          ok: true,

          conversationId,

          message
        });

    } catch (error) {
      console.error(
        'VOBIXCHAT SEND MESSAGE ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo enviar el mensaje'
        });
    }
  }
);


/* ======================================================
   OBTENER MENSAJE PROPIO
====================================================== */

async function getOwnedMessage(
  messageId,
  currentUserId
) {
  const result =
    await database.query(
      `
      SELECT
        m.id,
        m.conversation_id,
        m.sender_user_id,
        m.message_type,
        m.content,
        m.edited,
        m.deleted,
        m.created_at,
        m.updated_at

      FROM messages m

      WHERE
        m.id = $1
        AND m.sender_user_id = $2

      LIMIT 1
      `,
      [
        messageId,
        currentUserId
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}


/* ======================================================
   EDITAR MENSAJE DE TEXTO
====================================================== */

router.patch(
  '/messages/:messageId',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    const messageId =
      cleanId(
        req.params.messageId
      );

    const newText =
      cleanMessage(
        req.body.text ||
        req.body.content ||
        req.body.message
      );

    if (!messageId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Mensaje no válido'
        });
    }

    if (!newText) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'El mensaje no puede quedar vacío'
        });
    }

    try {
      const original =
        await getOwnedMessage(
          messageId,
          currentUserId
        );

      if (!original) {
        return res
          .status(404)
          .json({
            ok: false,
            msg:
              'Mensaje no encontrado'
          });
      }

      if (
        original.deleted
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            msg:
              'Este mensaje fue eliminado'
          });
      }

      if (
        String(
          original.message_type
        ) !== 'text'
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            msg:
              'Solo se pueden editar mensajes de texto'
          });
      }

      const result =
        await database.query(
          `
          UPDATE messages

          SET
            content = $1,
            edited = TRUE,
            updated_at = NOW()

          WHERE
            id = $2
            AND sender_user_id = $3

          RETURNING
            id,
            conversation_id,
            sender_user_id,
            message_type,
            content,
            edited,
            deleted,
            created_at,
            updated_at
          `,
          [
            newText,
            messageId,
            currentUserId
          ]
        );

      const message =
        normalizeMessage(
          result.rows[0]
        );

      const payload = {
        ok:
          true,

        conversationId:
          original.conversation_id,

        message
      };

      emitToConversation(
        req,
        original.conversation_id,
        'conversation:message-edited',
        payload
      );

      emitToConversation(
        req,
        original.conversation_id,
        'message:edited',
        payload
      );

      const recipients =
        await getOtherParticipants(
          original.conversation_id,
          currentUserId
        );

      for (
        const targetUserId
        of recipients
      ) {
        emitToUser(
          req,
          targetUserId,
          'conversation:message-edited',
          payload
        );
      }

      return res.json({
        ok: true,
        message
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT EDIT MESSAGE ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo editar el mensaje'
        });
    }
  }
);


/* ======================================================
   ELIMINAR MENSAJE
====================================================== */

router.delete(
  '/messages/:messageId',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    const messageId =
      cleanId(
        req.params.messageId
      );

    if (!messageId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Mensaje no válido'
        });
    }

    try {
      const original =
        await getOwnedMessage(
          messageId,
          currentUserId
        );

      if (!original) {
        return res
          .status(404)
          .json({
            ok: false,
            msg:
              'Mensaje no encontrado'
          });
      }

      const result =
        await database.query(
          `
          UPDATE messages

          SET
            content = '',
            deleted = TRUE,
            updated_at = NOW()

          WHERE
            id = $1
            AND sender_user_id = $2

          RETURNING
            id,
            conversation_id,
            sender_user_id,
            message_type,
            content,
            edited,
            deleted,
            created_at,
            updated_at
          `,
          [
            messageId,
            currentUserId
          ]
        );

      const message =
        normalizeMessage(
          result.rows[0]
        );

      const payload = {
        ok:
          true,

        conversationId:
          original.conversation_id,

        messageId,

        message
      };

      emitToConversation(
        req,
        original.conversation_id,
        'conversation:message-deleted',
        payload
      );

      emitToConversation(
        req,
        original.conversation_id,
        'message:deleted',
        payload
      );

      const recipients =
        await getOtherParticipants(
          original.conversation_id,
          currentUserId
        );

      for (
        const targetUserId
        of recipients
      ) {
        emitToUser(
          req,
          targetUserId,
          'conversation:message-deleted',
          payload
        );
      }

      return res.json({
        ok: true,

        messageId,

        message
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT DELETE MESSAGE ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo eliminar el mensaje'
        });
    }
  }
);


/* ======================================================
   FIN BLOQUE 4/6
====================================================== */
/* ======================================================
   BLOQUE 5/6
   MULTIMEDIA
   - FOTOS / CÁMARA
   - VIDEOS
   - DOCUMENTOS
   - AUDIO / NOTAS DE VOZ
====================================================== */


/* ======================================================
   CARPETA DE ARCHIVOS DE VOBIXCHAT

   IMPORTANTE:
   uploadsRoot SE DECLARA UNA SOLA VEZ EN TODO EL ARCHIVO.
====================================================== */

const uploadsRoot =
  path.join(
    __dirname,
    '..',
    'public',
    'uploads'
  );


/* ======================================================
   CREAR CARPETA DE UPLOADS
====================================================== */

try {
  fs.mkdirSync(
    uploadsRoot,
    {
      recursive: true
    }
  );

} catch (error) {
  console.error(
    'VOBIXCHAT CREATE UPLOAD DIRECTORY ERROR:',
    error
  );
}


/* ======================================================
   TIPOS MIME PERMITIDOS
====================================================== */

const allowedMimeTypes =
  new Set([
    /* IMÁGENES */

    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',

    /* VIDEO */

    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-m4v',

    /* AUDIO */

    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/m4a',
    'audio/aac',
    'audio/ogg',
    'audio/webm',
    'audio/wav',
    'audio/x-wav',

    /* DOCUMENTOS */

    'application/pdf',

    'application/msword',

    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

    'application/vnd.ms-excel',

    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    'application/vnd.ms-powerpoint',

    'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    'text/plain',
    'text/csv',

    'application/zip',
    'application/x-zip-compressed'
  ]);


/* ======================================================
   DETERMINAR TIPO DE MENSAJE SEGÚN ARCHIVO
====================================================== */

function getMessageTypeFromFile(file) {
  const mime =
    String(
      file?.mimetype ||
      ''
    ).toLowerCase();

  if (
    mime.startsWith(
      'image/'
    )
  ) {
    return 'image';
  }

  if (
    mime.startsWith(
      'video/'
    )
  ) {
    return 'video';
  }

  if (
    mime.startsWith(
      'audio/'
    )
  ) {
    return 'audio';
  }

  return 'document';
}


/* ======================================================
   CONFIGURACIÓN DE MULTER
====================================================== */

const storage =
  multer.diskStorage({

    destination: (
      req,
      file,
      callback
    ) => {
      callback(
        null,
        uploadsRoot
      );
    },

    filename: (
      req,
      file,
      callback
    ) => {
      const original =
        safeFileName(
          file.originalname
        );

      const extension =
        path.extname(
          original
        ).slice(
          0,
          12
        );

      const base =
        path.basename(
          original,
          extension
        ).slice(
          0,
          80
        );

      const unique =
        [
          Date.now(),

          Math.random()
            .toString(36)
            .slice(2, 10)
        ].join('-');

      callback(
        null,
        `${unique}-${base}${extension}`
      );
    }

  });


/* ======================================================
   FILTRO DE SEGURIDAD DE ARCHIVOS
====================================================== */

function uploadFileFilter(
  req,
  file,
  callback
) {
  const mime =
    String(
      file?.mimetype ||
      ''
    ).toLowerCase();

  if (
    !allowedMimeTypes.has(
      mime
    )
  ) {
    const error =
      new Error(
        'Tipo de archivo no permitido'
      );

    error.code =
      'VOBIX_FILE_TYPE';

    return callback(
      error
    );
  }

  return callback(
    null,
    true
  );
}


/* ======================================================
   MULTER
   MÁXIMO 50 MB POR ARCHIVO
====================================================== */

const upload =
  multer({
    storage,

    fileFilter:
      uploadFileFilter,

    limits: {
      fileSize:
        50 *
        1024 *
        1024,

      files:
        1
    }
  });


/* ======================================================
   ELIMINAR ARCHIVO SI FALLA LA OPERACIÓN
====================================================== */

function removeUploadedFile(file) {
  if (
    !file ||
    !file.path
  ) {
    return;
  }

  fs.unlink(
    file.path,
    () => {}
  );
}


/* ======================================================
   GUARDAR MENSAJE MULTIMEDIA
====================================================== */

async function saveMediaMessage(
  req,
  res
) {
  const currentUserId =
    req.vobixUser.id;

  const conversationId =
    cleanId(
      req.body.conversationId ||
      req.body.conversation_id
    );

  const file =
    req.file;

  if (!conversationId) {
    removeUploadedFile(
      file
    );

    return res
      .status(400)
      .json({
        ok: false,
        msg:
          'Conversación no válida'
      });
  }

  if (!file) {
    return res
      .status(400)
      .json({
        ok: false,
        msg:
          'Selecciona un archivo'
      });
  }

  try {
    const allowed =
      await canAccessConversation(
        conversationId,
        currentUserId
      );

    if (!allowed) {
      removeUploadedFile(
        file
      );

      return res
        .status(403)
        .json({
          ok: false,
          msg:
            'No tienes acceso a esta conversación'
        });
    }

    const blocked =
      await conversationIsBlocked(
        conversationId,
        currentUserId
      );

    if (blocked) {
      removeUploadedFile(
        file
      );

      return res
        .status(403)
        .json({
          ok: false,
          msg:
            'No puedes enviar archivos en esta conversación'
        });
    }


    /* ==================================================
       CREAR URL PÚBLICA
    ================================================== */

    const mediaUrl =
      `/uploads/${encodeURIComponent(
        file.filename
      )}`;

    const messageType =
      getMessageTypeFromFile(
        file
      );


    /* ==================================================
       GUARDAR MENSAJE EN BASE DE DATOS
    ================================================== */

    const result =
      await database.query(
        `
        INSERT INTO messages
        (
          conversation_id,
          sender_user_id,
          message_type,
          content,
          edited,
          deleted,
          created_at,
          updated_at
        )

        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          FALSE,
          FALSE,
          NOW(),
          NOW()
        )

        RETURNING
          id,
          conversation_id,
          sender_user_id,
          message_type,
          content,
          edited,
          deleted,
          created_at,
          updated_at
        `,
        [
          conversationId,
          currentUserId,
          messageType,
          mediaUrl
        ]
      );


    /* ==================================================
       ACTUALIZAR FECHA DE LA CONVERSACIÓN
    ================================================== */

    await database.query(
      `
      UPDATE conversations

      SET
        updated_at = NOW()

      WHERE
        id = $1
      `,
      [
        conversationId
      ]
    );


    /* ==================================================
       DATOS DEL REMITENTE
    ================================================== */

    const senderResult =
      await database.query(
        `
        SELECT
          id,
          username,
          avatar_url

        FROM users

        WHERE
          id = $1

        LIMIT 1
        `,
        [
          currentUserId
        ]
      );

    const sender =
      senderResult.rows[0] || {
        id:
          currentUserId,

        username:
          req.vobixUser.username ||
          'VOBIXCHAT',

        avatar_url:
          null
      };


    const row = {
      ...result.rows[0],

      sender_username:
        sender.username,

      sender_avatar_url:
        sender.avatar_url,

      file_name:
        file.originalname
    };


    const message =
      normalizeMessage(
        row
      );


    /* ==================================================
       DATOS ADICIONALES DEL ARCHIVO
    ================================================== */

    message.fileName =
      file.originalname;

    message.file_name =
      file.originalname;

    message.mimeType =
      file.mimetype;

    message.mime_type =
      file.mimetype;

    message.fileSize =
      file.size;

    message.file_size =
      file.size;


    /* ==================================================
       SOCKET.IO
    ================================================== */

    const payload = {
      ok:
        true,

      conversationId,

      message
    };


    emitToConversation(
      req,
      conversationId,
      'conversation:new-message',
      payload
    );


    emitToConversation(
      req,
      conversationId,
      'chat:message',
      payload
    );


    /* ==================================================
       AVISAR A LOS OTROS PARTICIPANTES
    ================================================== */

    const recipients =
      await getOtherParticipants(
        conversationId,
        currentUserId
      );


    for (
      const targetUserId
      of recipients
    ) {
      emitToUser(
        req,
        targetUserId,
        'conversation:new-message',
        payload
      );

      emitToUser(
        req,
        targetUserId,
        'conversation:updated',
        {
          conversationId,
          message
        }
      );

      notifyMessageByPush(
        targetUserId,
        sender,
        message
      ).catch(
        () => {}
      );
    }


    return res
      .status(201)
      .json({
        ok: true,

        conversationId,

        message,

        file: {
          name:
            file.originalname,

          url:
            mediaUrl,

          mimeType:
            file.mimetype,

          size:
            file.size,

          type:
            messageType
        }
      });

  } catch (error) {
    removeUploadedFile(
      file
    );

    console.error(
      'VOBIXCHAT MEDIA MESSAGE ERROR:',
      error
    );

    return res
      .status(500)
      .json({
        ok: false,
        msg:
          'No se pudo enviar el archivo'
      });
  }
}


/* ======================================================
   WRAPPER DE MULTER
====================================================== */

function uploadSingle(
  req,
  res,
  next
) {
  upload.single(
    'file'
  )(
    req,
    res,
    error => {
      if (!error) {
        return next();
      }

      console.error(
        'VOBIXCHAT UPLOAD ERROR:',
        error
      );


      if (
        error.code ===
        'LIMIT_FILE_SIZE'
      ) {
        return res
          .status(413)
          .json({
            ok: false,
            msg:
              'El archivo supera el límite de 50 MB'
          });
      }


      if (
        error.code ===
        'VOBIX_FILE_TYPE'
      ) {
        return res
          .status(415)
          .json({
            ok: false,
            msg:
              'Este tipo de archivo no está permitido'
          });
      }


      return res
        .status(400)
        .json({
          ok: false,
          msg:
            error.message ||
            'No se pudo procesar el archivo'
        });
    }
  );
}


/* ======================================================
   SUBIR ARCHIVO

   POST /api/chat/upload

   FormData:
   conversationId = ID
   file = archivo
====================================================== */

router.post(
  '/upload',
  uploadSingle,
  saveMediaMessage
);


/* ======================================================
   SUBIR ARCHIVO DIRECTAMENTE A UNA CONVERSACIÓN

   POST
   /api/chat/conversations/:conversationId/upload
====================================================== */

router.post(
  '/conversations/:conversationId/upload',

  uploadSingle,

  (req, res) => {
    req.body =
      req.body || {};

    req.body.conversationId =
      req.params.conversationId;

    return saveMediaMessage(
      req,
      res
    );
  }
);


/* ======================================================
   NOTA DE VOZ

   POST
   /api/chat/conversations/:conversationId/voice
====================================================== */

router.post(
  '/conversations/:conversationId/voice',

  uploadSingle,

  (req, res) => {
    req.body =
      req.body || {};

    req.body.conversationId =
      req.params.conversationId;

    return saveMediaMessage(
      req,
      res
    );
  }
);


/* ======================================================
   INFORMACIÓN DE CONFIGURACIÓN MULTIMEDIA
====================================================== */

router.get(
  '/upload/config',
  (req, res) => {
    return res.json({
      ok: true,

      maxFileSize:
        50 * 1024 * 1024,

      maxFileSizeMB:
        50,

      types: {
        image: [
          'jpeg',
          'jpg',
          'png',
          'webp',
          'gif',
          'heic',
          'heif'
        ],

        video: [
          'mp4',
          'webm',
          'mov',
          'm4v'
        ],

        audio: [
          'mp3',
          'mp4',
          'm4a',
          'aac',
          'ogg',
          'webm',
          'wav'
        ],

        document: [
          'pdf',
          'doc',
          'docx',
          'xls',
          'xlsx',
          'ppt',
          'pptx',
          'txt',
          'csv',
          'zip'
        ]
      }
    });
  }
);


/* ======================================================
   ELIMINAR ARCHIVO LOCAL POR URL
====================================================== */

function deleteLocalMediaByUrl(
  mediaUrl
) {
  try {
    if (
      !mediaUrl ||
      !String(
        mediaUrl
      ).startsWith(
        '/uploads/'
      )
    ) {
      return;
    }

    const encodedName =
      String(
        mediaUrl
      ).replace(
        '/uploads/',
        ''
      );

    const fileName =
      path.basename(
        decodeURIComponent(
          encodedName
        )
      );

    const absolutePath =
      path.join(
        uploadsRoot,
        fileName
      );

    /*
     * Evitar que un nombre manipulado pueda apuntar
     * fuera de la carpeta uploads.
     */

    const relativePath =
      path.relative(
        uploadsRoot,
        absolutePath
      );

    if (
      relativePath.startsWith(
        '..'
      ) ||
      path.isAbsolute(
        relativePath
      )
    ) {
      return;
    }

    fs.unlink(
      absolutePath,
      error => {
        if (
          error &&
          error.code !==
            'ENOENT'
        ) {
          console.error(
            'VOBIXCHAT DELETE MEDIA FILE ERROR:',
            error
          );
        }
      }
    );

  } catch (error) {
    console.error(
      'VOBIXCHAT DELETE MEDIA PATH ERROR:',
      error
    );
  }
}


/* ======================================================
   ELIMINAR DEFINITIVAMENTE MULTIMEDIA PROPIO

   DELETE
   /api/chat/media/:messageId
====================================================== */

router.delete(
  '/media/:messageId',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    const messageId =
      cleanId(
        req.params.messageId
      );

    if (!messageId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Mensaje no válido'
        });
    }

    try {
      const original =
        await getOwnedMessage(
          messageId,
          currentUserId
        );

      if (!original) {
        return res
          .status(404)
          .json({
            ok: false,
            msg:
              'Mensaje no encontrado'
          });
      }


      const mediaTypes =
        [
          'image',
          'photo',
          'video',
          'audio',
          'voice',
          'document',
          'file'
        ];


      if (
        !mediaTypes.includes(
          String(
            original.message_type
          )
        )
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            msg:
              'Este mensaje no contiene un archivo multimedia'
          });
      }


      await database.query(
        `
        UPDATE messages

        SET
          content = '',
          deleted = TRUE,
          updated_at = NOW()

        WHERE
          id = $1
          AND sender_user_id = $2
        `,
        [
          messageId,
          currentUserId
        ]
      );


      deleteLocalMediaByUrl(
        original.content
      );


      const payload = {
        ok:
          true,

        conversationId:
          original.conversation_id,

        messageId
      };


      emitToConversation(
        req,
        original.conversation_id,
        'conversation:message-deleted',
        payload
      );


      const recipients =
        await getOtherParticipants(
          original.conversation_id,
          currentUserId
        );


      for (
        const targetUserId
        of recipients
      ) {
        emitToUser(
          req,
          targetUserId,
          'conversation:message-deleted',
          payload
        );
      }


      return res.json({
        ok: true,

        conversationId:
          original.conversation_id,

        messageId
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT DELETE MEDIA ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo eliminar el archivo'
        });
    }
  }
);


/* ======================================================
   FIN BLOQUE 5/6
====================================================== */
/* ======================================================
   BLOQUE 6/6
   ESTADO + COMPATIBILIDAD + CIERRE DEL ROUTER
====================================================== */


/* ======================================================
   ESTADO GENERAL DEL CHAT
====================================================== */

router.get(
  '/status',
  async (req, res) => {
    const userId =
      req.vobixUser.id;

    try {
      const conversationsResult =
        await database.query(
          `
          SELECT
            COUNT(
              DISTINCT conversation_id
            )::INTEGER AS total

          FROM conversation_participants

          WHERE
            user_id = $1
          `,
          [
            userId
          ]
        );

      const contactsResult =
        await database.query(
          `
          SELECT
            COUNT(*)::INTEGER AS total

          FROM contacts

          WHERE
            owner_user_id = $1
          `,
          [
            userId
          ]
        );

      return res.json({
        ok: true,

        chat: true,

        userId,

        conversations:
          Number(
            conversationsResult
              .rows[0]
              ?.total || 0
          ),

        contacts:
          Number(
            contactsResult
              .rows[0]
              ?.total || 0
          ),

        features: {
          privateChat:
            true,

          search:
            true,

          contacts:
            true,

          blocking:
            true,

          text:
            true,

          images:
            true,

          camera:
            true,

          video:
            true,

          audio:
            true,

          voiceNotes:
            true,

          documents:
            true,

          editMessages:
            true,

          deleteMessages:
            true
        }
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT CHAT STATUS ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo obtener el estado del chat'
        });
    }
  }
);


/* ======================================================
   HISTORIAL - COMPATIBILIDAD CON FRONTEND ANTERIOR
====================================================== */

router.get(
  '/history',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    try {
      const result =
        await database.query(
          `
          SELECT
            c.id,
            c.created_at,
            c.updated_at,

            other_user.id
              AS other_user_id,

            other_user.username
              AS other_username,

            other_user.vobix_id
              AS other_vobix_id,

            other_user.phone
              AS other_phone,

            other_user.avatar_url
              AS other_avatar_url,

            other_user.online
              AS other_online,

            other_user.last_seen
              AS other_last_seen,

            last_message.message_type
              AS last_message_type,

            last_message.content
              AS last_message,

            last_message.created_at
              AS last_message_created_at

          FROM conversations c

          INNER JOIN conversation_participants me
            ON
              me.conversation_id = c.id
              AND me.user_id = $1

          LEFT JOIN LATERAL
          (
            SELECT
              u.id,
              u.username,
              u.vobix_id,
              u.phone,
              u.avatar_url,
              u.online,
              u.last_seen

            FROM conversation_participants cp

            INNER JOIN users u
              ON
                u.id = cp.user_id

            WHERE
              cp.conversation_id = c.id
              AND cp.user_id <> $1

            ORDER BY
              cp.joined_at ASC

            LIMIT 1
          )
          AS other_user
          ON TRUE

          LEFT JOIN LATERAL
          (
            SELECT
              m.message_type,
              m.content,
              m.created_at

            FROM messages m

            WHERE
              m.conversation_id = c.id

            ORDER BY
              m.created_at DESC,
              m.id DESC

            LIMIT 1
          )
          AS last_message
          ON TRUE

          ORDER BY
            COALESCE(
              last_message.created_at,
              c.updated_at,
              c.created_at
            ) DESC
          `,
          [
            currentUserId
          ]
        );

      const conversations =
        result.rows.map(
          row => ({
            id:
              row.id,

            conversationId:
              row.id,

            conversation_id:
              row.id,

            createdAt:
              row.created_at,

            updatedAt:
              row.updated_at,

            other_user: {
              id:
                row.other_user_id,

              username:
                row.other_username,

              vobix_id:
                row.other_vobix_id,

              phone:
                row.other_phone,

              avatar_url:
                row.other_avatar_url,

              online:
                Boolean(
                  row.other_online
                ),

              last_seen:
                row.other_last_seen
            },

            otherUser: {
              id:
                row.other_user_id,

              username:
                row.other_username,

              vobixId:
                row.other_vobix_id,

              phone:
                row.other_phone,

              avatarUrl:
                row.other_avatar_url,

              online:
                Boolean(
                  row.other_online
                ),

              lastSeen:
                row.other_last_seen
            },

            last_message:
              row.last_message,

            lastMessage:
              row.last_message,

            lastMessageType:
              row.last_message_type,

            lastMessageCreatedAt:
              row.last_message_created_at
          })
        );

      return res.json({
        ok: true,

        conversations,

        history:
          conversations
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT CHAT HISTORY COMPAT ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo cargar el historial'
        });
    }
  }
);


/* ======================================================
   PERFIL DE USUARIO DESDE EL CHAT
====================================================== */

router.get(
  '/users/:userId',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    const userId =
      cleanId(
        req.params.userId
      );

    if (!userId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Usuario no válido'
        });
    }

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
            id = $1
            AND verified = TRUE

          LIMIT 1
          `,
          [
            userId
          ]
        );

      if (
        result.rows.length ===
        0
      ) {
        return res
          .status(404)
          .json({
            ok: false,
            msg:
              'Usuario no encontrado'
          });
      }

      const blockedResult =
        await database.query(
          `
          SELECT
            blocker_user_id,
            blocked_user_id

          FROM user_blocks

          WHERE
            (
              blocker_user_id = $1
              AND blocked_user_id = $2
            )

            OR

            (
              blocker_user_id = $2
              AND blocked_user_id = $1
            )

          LIMIT 1
          `,
          [
            currentUserId,
            userId
          ]
        );

      const block =
        blockedResult.rows[0] ||
        null;

      return res.json({
        ok: true,

        user:
          result.rows[0],

        blocked:
          Boolean(block),

        blockedByMe:
          Boolean(
            block &&
            String(
              block.blocker_user_id
            ) ===
            String(
              currentUserId
            )
          ),

        blockedMe:
          Boolean(
            block &&
            String(
              block.blocker_user_id
            ) ===
            String(
              userId
            )
          )
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT GET CHAT USER ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo cargar el usuario'
        });
    }
  }
);


/* ======================================================
   BUSCAR MENSAJES DENTRO DE UNA CONVERSACIÓN
====================================================== */

router.get(
  '/conversations/:conversationId/search',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    const conversationId =
      cleanId(
        req.params.conversationId
      );

    const search =
      cleanSearch(
        req.query.q
      );

    if (!conversationId) {
      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Conversación no válida'
        });
    }

    if (
      search.length < 2
    ) {
      return res.json({
        ok: true,
        messages: []
      });
    }

    try {
      const allowed =
        await canAccessConversation(
          conversationId,
          currentUserId
        );

      if (!allowed) {
        return res
          .status(403)
          .json({
            ok: false,
            msg:
              'No tienes acceso a esta conversación'
          });
      }

      const result =
        await database.query(
          `
          SELECT
            m.id,
            m.conversation_id,
            m.sender_user_id,
            m.message_type,
            m.content,
            m.edited,
            m.deleted,
            m.created_at,
            m.updated_at,

            u.username
              AS sender_username,

            u.avatar_url
              AS sender_avatar_url

          FROM messages m

          INNER JOIN users u
            ON
              u.id =
                m.sender_user_id

          WHERE
            m.conversation_id = $1

            AND m.deleted = FALSE

            AND m.message_type = 'text'

            AND LOWER(
              m.content
            )
            LIKE LOWER($2)

          ORDER BY
            m.created_at DESC

          LIMIT 100
          `,
          [
            conversationId,
            `%${search}%`
          ]
        );

      return res.json({
        ok: true,

        conversationId,

        messages:
          result.rows.map(
            normalizeMessage
          )
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT SEARCH MESSAGES ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudieron buscar los mensajes'
        });
    }
  }
);


/* ======================================================
   COMPROBAR ACCESO A SALA
====================================================== */

router.get(
  '/conversations/:conversationId/access',
  async (req, res) => {
    const currentUserId =
      req.vobixUser.id;

    const conversationId =
      cleanId(
        req.params.conversationId
      );

    if (!conversationId) {
      return res.json({
        ok: true,
        allowed: false
      });
    }

    try {
      const allowed =
        await canAccessConversation(
          conversationId,
          currentUserId
        );

      return res.json({
        ok: true,
        allowed
      });

    } catch (error) {
      console.error(
        'VOBIXCHAT CHECK ACCESS ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          allowed: false,
          msg:
            'No se pudo comprobar el acceso'
        });
    }
  }
);


/* ======================================================
   CAPACIDADES DEL CHAT
====================================================== */

router.get(
  '/capabilities',
  (req, res) => {
    return res.json({
      ok: true,

      capabilities: {
        searchUsers:
          true,

        privateConversations:
          true,

        conversationHistory:
          true,

        textMessages:
          true,

        editText:
          true,

        deleteMessages:
          true,

        contacts:
          true,

        blocking:
          true,

        images:
          true,

        camera:
          true,

        videos:
          true,

        documents:
          true,

        audio:
          true,

        voiceNotes:
          true,

        maxUploadMB:
          50
      }
    });
  }
);


/* ======================================================
   RUTA NO ENCONTRADA DENTRO DE /api/chat
====================================================== */

router.use(
  (req, res, next) => {
    if (
      req.method ===
      'OPTIONS'
    ) {
      return next();
    }

    return res
      .status(404)
      .json({
        ok: false,

        msg:
          'Ruta de chat no encontrada',

        method:
          req.method,

        path:
          req.originalUrl
      });
  }
);


/* ======================================================
   MANEJADOR FINAL DE ERRORES
====================================================== */

router.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      'VOBIXCHAT CHAT ROUTER ERROR:',
      error
    );

    if (
      res.headersSent
    ) {
      return next(
        error
      );
    }

    if (
      error &&
      error.code ===
        'LIMIT_FILE_SIZE'
    ) {
      return res
        .status(413)
        .json({
          ok: false,
          msg:
            'El archivo supera el límite permitido'
        });
    }

    return res
      .status(500)
      .json({
        ok: false,
        msg:
          'Error interno del chat'
      });
  }
);


/* ======================================================
   EXPORTAR ROUTER

   ESTE ES EL ÚNICO module.exports DEL ARCHIVO.
====================================================== */

module.exports = router;


/* ======================================================
   FIN routes/chat.js
   VOBIXCHAT
====================================================== */
