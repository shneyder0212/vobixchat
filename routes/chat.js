'use strict';

/*
==========================================================
 VOBIXCHAT
 routes/chat.js

 API del núcleo social de VOBIXCHAT:

 - Buscar usuarios
 - Añadir contactos
 - Listar contactos
 - Eliminar contactos
 - Bloquear usuarios
 - Desbloquear usuarios
 - Crear / recuperar chat privado
 - Listar conversaciones
 - Cargar mensajes
 - Guardar mensajes

 IMPORTANTE:
 La autenticación real la proporciona server.js.
==========================================================
*/

const express = require('express');

const database = require('../database/db');

const router = express.Router();


// ========================================================
// UTILIDAD
// ========================================================

function cleanSearch(value) {

  return String(value || '')
    .trim()
    .slice(0, 100);

}


// ========================================================
// BUSCAR USUARIOS
// ========================================================

router.get(
  '/users/search',
  async (req, res) => {

    const userId =
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

            AND (

              LOWER(username)
                LIKE LOWER($2)

              OR (

                discover_by_vobix_id = TRUE

                AND vobix_id IS NOT NULL

                AND LOWER(vobix_id)
                  LIKE LOWER($2)

              )

              OR (

                discover_by_phone = TRUE

                AND phone LIKE $3

              )

            )

          ORDER BY

            CASE
              WHEN LOWER(username)
                = LOWER($4)
              THEN 0
              ELSE 1
            END,

            username ASC

          LIMIT 30
          `,
          [
            userId,
            `%${search}%`,
            `%${search}%`,
            search
          ]
        );


      return res.json({

        ok: true,

        users:
          result.rows

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT USER SEARCH ERROR:',
        error.message
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
);


// ========================================================
// LISTAR CONTACTOS
// ========================================================

router.get(
  '/contacts',
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
            u.verified,
            u.online,
            u.last_seen,

            c.alias,

            c.created_at
              AS contact_created_at

          FROM contacts c

          INNER JOIN users u
            ON u.id =
               c.contact_user_id

          WHERE
            c.owner_user_id = $1

          ORDER BY
            COALESCE(
              c.alias,
              u.username
            ) ASC
          `,
          [
            userId
          ]
        );


      return res.json({

        ok: true,

        contacts:
          result.rows

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT CONTACT LIST ERROR:',
        error.message
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


// ========================================================
// AÑADIR CONTACTO
// ========================================================

router.post(
  '/contacts',
  async (req, res) => {

    const ownerUserId =
      req.vobixUser.id;

    const contactUserId =
      String(
        req.body.userId || ''
      ).trim();

    const alias =
      String(
        req.body.alias || ''
      )
        .trim()
        .slice(0, 100);


    if (!contactUserId) {

      return res
        .status(400)
        .json({

          ok: false,

          msg:
            'Falta el usuario'

        });

    }


    if (
      String(ownerUserId) ===
      contactUserId
    ) {

      return res
        .status(400)
        .json({

          ok: false,

          msg:
            'No puedes añadirte a ti mismo'

        });

    }


    try {

      const userResult =
        await database.query(
          `
          SELECT
            id,
            username,
            verified
          FROM users
          WHERE id = $1
          LIMIT 1
          `,
          [
            contactUserId
          ]
        );


      if (
        userResult.rows.length === 0 ||
        !userResult.rows[0].verified
      ) {

        return res
          .status(404)
          .json({

            ok: false,

            msg:
              'Usuario no encontrado'

          });

      }


      await database.query(
        `
        INSERT INTO contacts
        (
          owner_user_id,
          contact_user_id,
          alias
        )

        VALUES
        (
          $1,
          $2,
          $3
        )

        ON CONFLICT
        (
          owner_user_id,
          contact_user_id
        )

        DO UPDATE SET

          alias =
            CASE
              WHEN EXCLUDED.alias IS NULL
                OR EXCLUDED.alias = ''
              THEN contacts.alias
              ELSE EXCLUDED.alias
            END
        `,
        [
          ownerUserId,
          contactUserId,
          alias || null
        ]
      );


      return res.json({

        ok: true,

        contact:
          userResult.rows[0]

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT ADD CONTACT ERROR:',
        error.message
      );


      return res
        .status(500)
        .json({

          ok: false,

          msg:
            'No se pudo añadir el contacto'

        });

    }

  }
);


// ========================================================
// ELIMINAR CONTACTO
// ========================================================

router.delete(
  '/contacts/:userId',
  async (req, res) => {

    const ownerUserId =
      req.vobixUser.id;

    const contactUserId =
      String(
        req.params.userId || ''
      ).trim();


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
        error.message
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


// ========================================================
// BLOQUEAR USUARIO
// ========================================================

router.post(
  '/blocks/:userId',
  async (req, res) => {

    const blockerUserId =
      req.vobixUser.id;

    const blockedUserId =
      String(
        req.params.userId || ''
      ).trim();


    if (
      String(blockerUserId) ===
      blockedUserId
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

      const exists =
        await database.query(
          `
          SELECT id
          FROM users
          WHERE id = $1
          LIMIT 1
          `,
          [
            blockedUserId
          ]
        );


      if (
        exists.rows.length === 0
      ) {

        return res
          .status(404)
          .json({

            ok: false,

            msg:
              'Usuario no encontrado'

          });

      }


      await database.query(
        `
        INSERT INTO user_blocks
        (
          blocker_user_id,
          blocked_user_id
        )

        VALUES
        (
          $1,
          $2
        )

        ON CONFLICT
        (
          blocker_user_id,
          blocked_user_id
        )

        DO NOTHING
        `,
        [
          blockerUserId,
          blockedUserId
        ]
      );


      return res.json({
        ok: true
      });


    } catch (error) {

      console.error(
        'VOBIXCHAT BLOCK ERROR:',
        error.message
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


// ========================================================
// DESBLOQUEAR USUARIO
// ========================================================

router.delete(
  '/blocks/:userId',
  async (req, res) => {

    const blockerUserId =
      req.vobixUser.id;

    const blockedUserId =
      String(
        req.params.userId || ''
      ).trim();


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
        ok: true
      });


    } catch (error) {

      console.error(
        'VOBIXCHAT UNBLOCK ERROR:',
        error.message
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


// ========================================================
// CREAR O RECUPERAR CHAT PRIVADO
// ========================================================

router.post(
  '/conversations/private',
  async (req, res) => {

    const currentUserId =
      req.vobixUser.id;

    const otherUserId =
      String(
        req.body.userId || ''
      ).trim();


    if (!otherUserId) {

      return res
        .status(400)
        .json({

          ok: false,

          msg:
            'Falta el usuario'

        });

    }


    if (
      String(currentUserId) ===
      otherUserId
    ) {

      return res
        .status(400)
        .json({

          ok: false,

          msg:
            'No puedes crear un chat contigo mismo'

        });

    }


    const client =
      await database.pool.connect();


    try {

      await client.query('BEGIN');


      // ==================================================
      // COMPROBAR USUARIO
      // ==================================================

      const userResult =
        await client.query(
          `
          SELECT
            id,
            username,
            avatar_url,
            verified
          FROM users
          WHERE id = $1
          LIMIT 1
          `,
          [
            otherUserId
          ]
        );


      if (
        userResult.rows.length === 0 ||
        !userResult.rows[0].verified
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res
          .status(404)
          .json({

            ok: false,

            msg:
              'Usuario no encontrado'

          });

      }


      // ==================================================
      // COMPROBAR BLOQUEO EN CUALQUIER DIRECCIÓN
      // ==================================================

      const blockResult =
        await client.query(
          `
          SELECT id

          FROM user_blocks

          WHERE

            (
              blocker_user_id = $1
              AND
              blocked_user_id = $2
            )

            OR

            (
              blocker_user_id = $2
              AND
              blocked_user_id = $1
            )

          LIMIT 1
          `,
          [
            currentUserId,
            otherUserId
          ]
        );


      if (
        blockResult.rows.length > 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res
          .status(403)
          .json({

            ok: false,

            msg:
              'No se puede iniciar esta conversación'

          });

      }


      // ==================================================
      // BUSCAR CONVERSACIÓN PRIVADA EXISTENTE
      // ==================================================

      const existing =
        await client.query(
          `
          SELECT
            c.id,
            c.created_at,
            c.updated_at

          FROM conversations c

          INNER JOIN
            conversation_participants p1
            ON p1.conversation_id = c.id

          INNER JOIN
            conversation_participants p2
            ON p2.conversation_id = c.id

          WHERE

            c.type = 'private'

            AND p1.user_id = $1

            AND p2.user_id = $2

            AND (
              SELECT COUNT(*)
              FROM conversation_participants cp
              WHERE cp.conversation_id = c.id
            ) = 2

          LIMIT 1
          `,
          [
            currentUserId,
            otherUserId
          ]
        );


      if (
        existing.rows.length > 0
      ) {

        await client.query(
          'COMMIT'
        );


        return res.json({

          ok: true,

          created: false,

          conversation:
            existing.rows[0],

          user:
            userResult.rows[0]

        });

      }


      // ==================================================
      // CREAR CONVERSACIÓN
      // ==================================================

      const conversationResult =
        await client.query(
          `
          INSERT INTO conversations
          (
            type,
            created_by,
            created_at,
            updated_at
          )

          VALUES
          (
            'private',
            $1,
            NOW(),
            NOW()
          )

          RETURNING
            id,
            created_at,
            updated_at
          `,
          [
            currentUserId
          ]
        );


      const conversation =
        conversationResult.rows[0];


      // ==================================================
      // AÑADIR LOS DOS PARTICIPANTES
      // ==================================================

      await client.query(
        `
        INSERT INTO conversation_participants
        (
          conversation_id,
          user_id,
          role
        )

        VALUES

        (
          $1,
          $2,
          'member'
        ),

        (
          $1,
          $3,
          'member'
        )
        `,
        [
          conversation.id,
          currentUserId,
          otherUserId
        ]
      );


      await client.query(
        'COMMIT'
      );


      return res.json({

        ok: true,

        created: true,

        conversation,

        user:
          userResult.rows[0]

      });


    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'VOBIXCHAT PRIVATE CHAT ERROR:',
        error.message
      );


      return res
        .status(500)
        .json({

          ok: false,

          msg:
            'No se pudo crear la conversación'

        });


    } finally {

      client.release();

    }

  }
);


// ========================================================
// LISTAR CONVERSACIONES DEL USUARIO
// ========================================================

router.get(
  '/conversations',
  async (req, res) => {

    const userId =
      req.vobixUser.id;


    try {

      const result =
        await database.query(
          `
          SELECT

            c.id,
            c.type,
            c.title,
            c.created_at,
            c.updated_at,

            other_user.id
              AS other_user_id,

            other_user.username
              AS other_username,

            other_user.vobix_id
              AS other_vobix_id,

            other_user.avatar_url
              AS other_avatar_url,

            other_user.online
              AS other_online,

            other_user.last_seen
              AS other_last_seen,

            last_message.id
              AS last_message_id,

            last_message.content
              AS last_message_content,

            last_message.message_type
              AS last_message_type,

            last_message.created_at
              AS last_message_at

          FROM conversations c

          INNER JOIN
            conversation_participants mine

            ON mine.conversation_id =
               c.id

            AND mine.user_id =
                $1


          LEFT JOIN LATERAL (

            SELECT u.*

            FROM
              conversation_participants cp

            INNER JOIN users u
              ON u.id = cp.user_id

            WHERE
              cp.conversation_id =
                c.id

              AND cp.user_id <> $1

            LIMIT 1

          ) other_user
          ON TRUE


          LEFT JOIN LATERAL (

            SELECT
              m.id,
              m.content,
              m.message_type,
              m.created_at

            FROM messages m

            WHERE
              m.conversation_id =
                c.id

              AND m.deleted =
                  FALSE

            ORDER BY
              m.created_at DESC

            LIMIT 1

          ) last_message
          ON TRUE


          ORDER BY

            COALESCE(
              last_message.created_at,
              c.updated_at
            ) DESC
          `,
          [
            userId
          ]
        );


      return res.json({

        ok: true,

        conversations:
          result.rows

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT CONVERSATION LIST ERROR:',
        error.message
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


// ========================================================
// COMPROBAR PARTICIPACIÓN
// ========================================================

async function userCanAccessConversation(
  conversationId,
  userId
) {

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


  return (
    result.rows.length > 0
  );

}


// ========================================================
// CARGAR MENSAJES
// ========================================================

router.get(
  '/conversations/:conversationId/messages',
  async (req, res) => {

    const userId =
      req.vobixUser.id;

    const conversationId =
      String(
        req.params.conversationId || ''
      ).trim();


    try {

      const allowed =
        await userCanAccessConversation(
          conversationId,
          userId
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

          LEFT JOIN users u
            ON u.id =
               m.sender_user_id

          WHERE
            m.conversation_id = $1

          ORDER BY
            m.created_at ASC

          LIMIT 200
          `,
          [
            conversationId
          ]
        );


      return res.json({

        ok: true,

        messages:
          result.rows

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT MESSAGE LIST ERROR:',
        error.message
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


// ========================================================
// ENVIAR MENSAJE
// ========================================================

router.post(
  '/conversations/:conversationId/messages',
  async (req, res) => {

    const userId =
      req.vobixUser.id;

    const conversationId =
      String(
        req.params.conversationId || ''
      ).trim();

    const content =
      String(
        req.body.content || ''
      )
        .trim()
        .slice(0, 10000);


    if (!content) {

      return res
        .status(400)
        .json({

          ok: false,

          msg:
            'El mensaje está vacío'

        });

    }


    try {

      const allowed =
        await userCanAccessConversation(
          conversationId,
          userId
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


      // ==================================================
      // COMPROBAR BLOQUEO ENTRE PARTICIPANTES
      // ==================================================

      const blocked =
        await database.query(
          `
          SELECT ub.id

          FROM user_blocks ub

          INNER JOIN
            conversation_participants cp

            ON cp.conversation_id =
               $1

          WHERE

            cp.user_id <> $2

            AND (

              (
                ub.blocker_user_id = $2
                AND
                ub.blocked_user_id =
                  cp.user_id
              )

              OR

              (
                ub.blocker_user_id =
                  cp.user_id

                AND
                ub.blocked_user_id = $2
              )

            )

          LIMIT 1
          `,
          [
            conversationId,
            userId
          ]
        );


      if (
        blocked.rows.length > 0
      ) {

        return res
          .status(403)
          .json({

            ok: false,

            msg:
              'No se puede enviar el mensaje'

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
            created_at,
            updated_at
          )

          VALUES
          (
            $1,
            $2,
            'text',
            $3,
            NOW(),
            NOW()
          )

          RETURNING

            id,
            conversation_id,
            sender_user_id,
            message_type,
            content,
            reply_to_message_id,
            edited,
            deleted,
            created_at,
            updated_at
          `,
          [
            conversationId,
            userId,
            content
          ]
        );


      await database.query(
        `
        UPDATE conversations

        SET
          updated_at = NOW()

        WHERE id = $1
        `,
        [
          conversationId
        ]
      );


      return res.json({

        ok: true,

        message:
          result.rows[0]

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT SEND MESSAGE ERROR:',
        error.message
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


// ========================================================
// EXPORTAR
// ========================================================

module.exports = router;
