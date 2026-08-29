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

  if (
    !conversationId ||
    !userId
  ) {

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


  return (
    result.rows.length > 0
  );

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


  return (
    blocked.rows.length > 0
  );

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


  if (
    search.length < 2
  ) {

    return res.json({

      ok: true,

      users: []

    });

  }


  try {

    /*
      IMPORTANTE:

      La búsqueda acepta:
      - nombre de usuario
      - VOBIX ID
      - teléfono

      Se respeta la configuración de privacidad
      discover_by_vobix_id y discover_by_phone.
    */

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
            WHEN
              LOWER(username) =
              LOWER($4)
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


// ========================================================
// RUTAS DE BÚSQUEDA
// ========================================================

router.get(
  '/users/search',
  searchUsersHandler
);


/*
  Alias conservado para compatibilidad con
  versiones anteriores del frontend.
*/

router.get(
  '/search',
  searchUsersHandler
);


// ========================================================
// LISTAR CONTACTOS
// ========================================================

router.get(
  '/contacts',
  async (
    req,
    res
  ) => {

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
// AGREGAR CONTACTO
// ========================================================

router.post(
  '/contacts',
  async (
    req,
    res
  ) => {

    const ownerUserId =
      req.vobixUser.id;


    const contactUserId =
      cleanId(
        req.body.userId ||
        req.body.contactUserId ||
        req.body.contact_user_id
      );


    const alias =
      String(
        req.body.alias || ''
      )
        .trim()
        .slice(
          0,
          100
        );


    if (!contactUserId) {

      return res
        .status(400)
        .json({

          ok: false,

          msg:
            'Contacto no válido'

        });

    }


    if (
      String(
        ownerUserId
      ) ===
      String(
        contactUserId
      )
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
          [
            contactUserId
          ]
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
        error.message
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


// ========================================================
// ELIMINAR CONTACTO
// ========================================================

router.delete(
  '/contacts/:userId',
  async (
    req,
    res
  ) => {

    const ownerUserId =
      req.vobixUser.id;


    const contactUserId =
      cleanId(
        req.params.userId
      );


    if (!contactUserId) {

      return res
        .status(400)
        .json({

          ok: false,

          msg:
            'Contacto no válido'

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
  '/blocks',
  async (
    req,
    res
  ) => {

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

          msg:
            'Usuario no válido'

        });

    }


    if (
      String(
        blockerUserId
      ) ===
      String(
        blockedUserId
      )
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
        'VOBIXCHAT BLOCK USER ERROR:',
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
  async (
    req,
    res
  ) => {

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

        ok: true

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT UNBLOCK USER ERROR:',
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
// CONTINÚA EN BLOQUE 2/6
// NO CERRAR module.exports TODAVÍA
// ========================================================
// ========================================================
// CREAR / RECUPERAR CONVERSACIÓN PRIVADA 1X1
// ========================================================

router.post(
  '/conversations',
  async (
    req,
    res
  ) => {

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
      String(
        currentUserId
      ) ===
      String(
        otherUserId
      )
    ) {

      return res
        .status(400)
        .json({

          ok: false,

          msg:
            'No puedes crear una conversación contigo mismo'

        });

    }


    try {

      // ==================================================
      // COMPROBAR QUE EL OTRO USUARIO EXISTE
      // ==================================================

      const otherUserResult =
        await database.query(
          `
          SELECT
            id,
            username,
            vobix_id,
            phone,
            avatar_url,
            online,
            last_seen

          FROM users

          WHERE
            id = $1
            AND verified = TRUE

          LIMIT 1
          `,
          [
            otherUserId
          ]
        );


      if (
        otherUserResult.rows.length === 0
      ) {

        return res
          .status(404)
          .json({

            ok: false,

            msg:
              'Usuario no encontrado'

          });

      }


      // ==================================================
      // COMPROBAR BLOQUEO ENTRE LOS DOS USUARIOS
      // ==================================================

      const blocked =
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
            currentUserId,
            otherUserId
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
              'No se puede iniciar esta conversación'

          });

      }


      // ==================================================
      // BUSCAR SALA PRIVADA 1X1 EXISTENTE
      // ==================================================
      //
      // Tiene que ser una conversación formada
      // EXACTAMENTE por estos dos usuarios.
      //
      // Si ya existe:
      // NO creamos otra.
      //
      // Esto permite:
      //
      // historial
      // -> tocar usuario
      // -> volver siempre a su misma sala privada.
      // ==================================================

      const existing =
        await database.query(
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

          INNER JOIN conversation_participants other
            ON
              other.conversation_id = c.id
              AND other.user_id = $2

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
            c.updated_at DESC

          LIMIT 1
          `,
          [
            currentUserId,
            otherUserId
          ]
        );


      // ==================================================
      // SI YA EXISTE LA SALA, DEVOLVERLA
      // ==================================================

      if (
        existing.rows.length > 0
      ) {

        const conversation =
          existing.rows[0];


        const otherUser =
          otherUserResult.rows[0];


        return res.json({

          ok: true,

          created: false,

          conversation: {

            ...conversation,

            conversationId:
              conversation.id,

            otherUserId:
              otherUser.id,

            otherUsername:
              otherUser.username,

            otherVobixId:
              otherUser.vobix_id,

            otherPhone:
              otherUser.phone,

            otherAvatarUrl:
              otherUser.avatar_url,

            online:
              otherUser.online,

            lastSeen:
              otherUser.last_seen

          }

        });

      }


      // ==================================================
      // CREAR NUEVA SALA PRIVADA 1X1
      // ==================================================

      const client =
        await database.pool.connect();


      try {

        await client.query(
          'BEGIN'
        );


        // ================================================
        // CREAR CONVERSACIÓN
        // ================================================

        const created =
          await client.query(
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
          created.rows[0];


        // ================================================
        // AGREGAR LOS DOS PARTICIPANTES
        // ================================================

        await client.query(
          `
          INSERT INTO conversation_participants
          (
            conversation_id,
            user_id,
            joined_at
          )

          VALUES
            ($1, $2, NOW()),
            ($1, $3, NOW())
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


        const otherUser =
          otherUserResult.rows[0];


        return res.json({

          ok: true,

          created: true,

          conversation: {

            ...conversation,

            conversationId:
              conversation.id,

            otherUserId:
              otherUser.id,

            otherUsername:
              otherUser.username,

            otherVobixId:
              otherUser.vobix_id,

            otherPhone:
              otherUser.phone,

            otherAvatarUrl:
              otherUser.avatar_url,

            online:
              otherUser.online,

            lastSeen:
              otherUser.last_seen

          }

        });


      } catch (error) {

        await client.query(
          'ROLLBACK'
        );


        throw error;


      } finally {

        client.release();

      }


    } catch (error) {

      console.error(
        'VOBIXCHAT CREATE CONVERSATION ERROR:',
        error
      );


      return res
        .status(500)
        .json({

          ok: false,

          msg:
            'No se pudo crear la conversación'

        });

    }

  }
);


// ========================================================
// LISTAR HISTORIAL DE CONVERSACIONES
// ========================================================
//
// Esta ruta alimenta la pantalla interior:
//
// VOBIXCHAT
// -> historial
// -> seleccionar persona
// -> abrir sala privada
//
// ========================================================

router.get(
  '/conversations',
  async (
    req,
    res
  ) => {

    const userId =
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

            last_message.id
              AS last_message_id,

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


          // ==============================================
          // OBTENER EL OTRO PARTICIPANTE
          // ==============================================

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


          // ==============================================
          // ÚLTIMO MENSAJE DE LA CONVERSACIÓN
          // ==============================================

          LEFT JOIN LATERAL
          (
            SELECT
              m.id,
              m.message_type,
              m.content,
              m.created_at

            FROM messages m

            WHERE
              m.conversation_id = c.id

              AND COALESCE(
                m.deleted,
                FALSE
              ) = FALSE

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
            userId
          ]
        );


      // ==================================================
      // PREPARAR HISTORIAL PARA EL FRONTEND
      // ==================================================

      const conversations =
        result.rows.map(
          row => {

            let preview =
              row.last_message ||
              'Conversación privada';


            if (
              row.last_message_type ===
              'image'
            ) {

              preview =
                '📷 Foto';

            }


            if (
              row.last_message_type ===
              'video'
            ) {

              preview =
                '🎥 Vídeo';

            }


            if (
              row.last_message_type ===
                'audio' ||
              row.last_message_type ===
                'voice'
            ) {

              preview =
                '🎙️ Nota de voz';

            }


            if (
              row.last_message_type ===
                'document' ||
              row.last_message_type ===
                'file'
            ) {

              preview =
                '📎 Documento';

            }


            return {

              id:
                row.id,

              conversationId:
                row.id,

              createdAt:
                row.created_at,

              updatedAt:
                row.updated_at,

              otherUserId:
                row.other_user_id,

              otherUsername:
                row.other_username,

              otherVobixId:
                row.other_vobix_id,

              otherPhone:
                row.other_phone,

              otherAvatarUrl:
                row.other_avatar_url,

              online:
                row.other_online,

              lastSeen:
                row.other_last_seen,

              lastMessageId:
                row.last_message_id,

              lastMessageType:
                row.last_message_type,

              lastMessage:
                preview,

              lastMessageCreatedAt:
                row.last_message_created_at

            };

          }
        );


      return res.json({

        ok: true,

        conversations

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT LIST CONVERSATIONS ERROR:',
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


// ========================================================
// CONTINÚA EN BLOQUE 3/6
// NO PONGAS module.exports TODAVÍA
// ========================================================
// ========================================================
// CREAR / RECUPERAR CONVERSACIÓN PRIVADA 1X1
// ========================================================

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
          msg: 'Usuario no válido'
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


    try {

      // ==================================================
      // COMPROBAR USUARIO DESTINO
      // ==================================================

      const otherUserResult =
        await database.query(
          `
          SELECT
            id,
            username,
            vobix_id,
            phone,
            avatar_url,
            online,
            last_seen

          FROM users

          WHERE
            id = $1
            AND verified = TRUE

          LIMIT 1
          `,
          [otherUserId]
        );


      if (
        otherUserResult.rows.length === 0
      ) {

        return res
          .status(404)
          .json({
            ok: false,
            msg: 'Usuario no encontrado'
          });

      }


      // ==================================================
      // COMPROBAR BLOQUEO
      // ==================================================

      const blocked =
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
            currentUserId,
            otherUserId
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
              'No se puede iniciar esta conversación'
          });

      }


      // ==================================================
      // BUSCAR CONVERSACIÓN PRIVADA 1X1 EXISTENTE
      // ==================================================

      const existing =
        await database.query(
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

          INNER JOIN conversation_participants other
            ON
              other.conversation_id = c.id
              AND other.user_id = $2

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


      // ==================================================
      // DEVOLVER SALA EXISTENTE
      // ==================================================

      if (
        existing.rows.length > 0
      ) {

        const conversation =
          existing.rows[0];

        const otherUser =
          otherUserResult.rows[0];


        return res.json({

          ok: true,

          created: false,

          conversation: {

            ...conversation,

            conversationId:
              conversation.id,

            otherUserId:
              otherUser.id,

            otherUsername:
              otherUser.username,

            otherVobixId:
              otherUser.vobix_id,

            otherPhone:
              otherUser.phone,

            otherAvatarUrl:
              otherUser.avatar_url,

            online:
              otherUser.online,

            lastSeen:
              otherUser.last_seen

          }

        });

      }


      // ==================================================
      // CREAR NUEVA SALA 1X1
      // ==================================================

      const client =
        await database.pool.connect();


      try {

        await client.query(
          'BEGIN'
        );


        const created =
          await client.query(
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
          created.rows[0];


        // =================================================
        // AGREGAR LOS DOS PARTICIPANTES
        // =================================================

        await client.query(
          `
          INSERT INTO conversation_participants
          (
            conversation_id,
            user_id,
            joined_at
          )

          VALUES
            ($1, $2, NOW()),
            ($1, $3, NOW())
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


        const otherUser =
          otherUserResult.rows[0];


        return res.json({

          ok: true,

          created: true,

          conversation: {

            ...conversation,

            conversationId:
              conversation.id,

            otherUserId:
              otherUser.id,

            otherUsername:
              otherUser.username,

            otherVobixId:
              otherUser.vobix_id,

            otherPhone:
              otherUser.phone,

            otherAvatarUrl:
              otherUser.avatar_url,

            online:
              otherUser.online,

            lastSeen:
              otherUser.last_seen

          }

        });


      } catch (error) {

        await client.query(
          'ROLLBACK'
        );

        throw error;


      } finally {

        client.release();

      }


    } catch (error) {

      console.error(
        'VOBIXCHAT CREATE CONVERSATION ERROR:',
        error
      );


      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo crear la conversación'
        });

    }

  }
);


// ========================================================
// LISTAR HISTORIAL DE CONVERSACIONES
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

            last_message.id
              AS last_message_id,

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
              m.created_at

            FROM messages m

            WHERE
              m.conversation_id = c.id

              AND COALESCE(
                m.deleted,
                FALSE
              ) = FALSE

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
          [userId]
        );


      const conversations =
        result.rows.map(
          row => {

            let preview =
              row.last_message ||
              'Conversación privada';


            if (
              row.last_message_type ===
              'image'
            ) {

              preview =
                '📷 Foto';

            }


            if (
              row.last_message_type ===
              'video'
            ) {

              preview =
                '🎥 Vídeo';

            }


            if (
              row.last_message_type ===
                'audio' ||
              row.last_message_type ===
                'voice'
            ) {

              preview =
                '🎙️ Nota de voz';

            }


            if (
              row.last_message_type ===
                'document' ||
              row.last_message_type ===
                'file'
            ) {

              preview =
                '📎 Documento';

            }


            return {

              id:
                row.id,

              conversationId:
                row.id,

              createdAt:
                row.created_at,

              updatedAt:
                row.updated_at,

              otherUserId:
                row.other_user_id,

              otherUsername:
                row.other_username,

              otherVobixId:
                row.other_vobix_id,

              otherPhone:
                row.other_phone,

              otherAvatarUrl:
                row.other_avatar_url,

              online:
                row.other_online,

              lastSeen:
                row.other_last_seen,

              lastMessageId:
                row.last_message_id,

              lastMessageType:
                row.last_message_type,

              lastMessage:
                preview,

              lastMessageCreatedAt:
                row.last_message_created_at

            };

          }
        );


      return res.json({

        ok: true,

        conversations

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT LIST CONVERSATIONS ERROR:',
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


// ========================================================
// FIN BLOQUE 2/6
// CONTINÚA DIRECTAMENTE CON BLOQUE 3/6
// ========================================================
// ========================================================
// CARGAR MENSAJES DE UNA CONVERSACIÓN
// ========================================================

router.get(
  '/conversations/:conversationId/messages',
  async (req, res) => {

    const userId =
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
          msg: 'Conversación no válida'
        });

    }


    try {

      const allowed =
        await canAccessConversation(
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

          INNER JOIN users u
            ON u.id = m.sender_user_id

          WHERE
            m.conversation_id = $1

          ORDER BY
            m.created_at ASC,
            m.id ASC

          LIMIT 1000
          `,
          [conversationId]
        );


      const messages =
        result.rows.map(
          normalizeMessage
        );


      return res.json({
        ok: true,
        messages
      });


    } catch (error) {

      console.error(
        'VOBIXCHAT LOAD MESSAGES ERROR:',
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


// ========================================================
// NORMALIZAR MENSAJE PARA EL FRONTEND
// ========================================================

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


  const isMedia =
    [
      'image',
      'photo',
      'video',
      'audio',
      'voice',
      'document',
      'file'
    ].includes(messageType);


  return {

    id:
      row.id,

    conversationId:
      row.conversation_id,

    conversation_id:
      row.conversation_id,

    senderId:
      row.sender_user_id,

    sender_user_id:
      row.sender_user_id,

    senderUsername:
      row.sender_username ||
      null,

    sender_username:
      row.sender_username ||
      null,

    senderAvatarUrl:
      row.sender_avatar_url ||
      null,

    messageType,

    message_type:
      messageType,

    content,

    mediaUrl:
      isMedia
        ? content
        : null,

    media_url:
      isMedia
        ? content
        : null,

    fileName:
      row.file_name ||
      row.fileName ||
      null,

    replyToMessageId:
      row.reply_to_message_id ||
      null,

    edited:
      Boolean(
        row.edited
      ),

    deleted:
      Boolean(
        row.deleted
      ),

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


// ========================================================
// ENVIAR MENSAJE DE TEXTO POR HTTP
// ========================================================

router.post(
  '/conversations/:conversationId/messages',
  async (req, res) => {

    const userId =
      req.vobixUser.id;

    const conversationId =
      cleanId(
        req.params.conversationId
      );

    const content =
      cleanMessage(
        req.body.content ||
        req.body.text ||
        req.body.message
      );


    if (!conversationId) {

      return res
        .status(400)
        .json({
          ok: false,
          msg: 'Conversación no válida'
        });

    }


    if (!content) {

      return res
        .status(400)
        .json({
          ok: false,
          msg: 'El mensaje está vacío'
        });

    }


    try {

      const allowed =
        await canAccessConversation(
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


      const blocked =
        await conversationIsBlocked(
          conversationId,
          userId
        );


      if (blocked) {

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


      // Actualizar la conversación para que suba
      // al principio del historial.

      await database.query(
        `
        UPDATE conversations

        SET
          updated_at = NOW()

        WHERE
          id = $1
        `,
        [conversationId]
      );


      const message =
        normalizeMessage(
          result.rows[0]
        );


      return res.json({
        ok: true,
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


// ========================================================
// TIPOS MULTIMEDIA PERMITIDOS
// ========================================================

const ALLOWED_MESSAGE_TYPES =
  new Set([
    'image',
    'photo',
    'video',
    'audio',
    'voice',
    'document',
    'file'
  ]);


// ========================================================
// NORMALIZAR TIPO MULTIMEDIA
// ========================================================

function normalizeMediaType(
  requestedType,
  mimeType
) {

  const requested =
    String(
      requestedType || ''
    )
      .trim()
      .toLowerCase();


  if (
    ALLOWED_MESSAGE_TYPES.has(
      requested
    )
  ) {

    if (
      requested === 'photo'
    ) {
      return 'image';
    }


    if (
      requested === 'voice'
    ) {
      return 'audio';
    }


    if (
      requested === 'file'
    ) {
      return 'document';
    }


    return requested;

  }


  const mime =
    String(
      mimeType || ''
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


// ========================================================
// NOMBRE SEGURO PARA ARCHIVOS
// ========================================================

function safeFileName(value) {

  const original =
    String(
      value ||
      'archivo'
    );


  const cleaned =
    original
      .normalize('NFKD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
      )
      .replace(
        /_+/g,
        '_'
      )
      .slice(
        0,
        180
      );


  return (
    cleaned ||
    'archivo'
  );

}


// ========================================================
// FIN BLOQUE 3/6
// CONTINÚA CON BLOQUE 4/6
// ========================================================
// ========================================================
// BLOQUE 4/6
// MULTIMEDIA / ARCHIVOS / CÁMARA / AUDIO / DOCUMENTOS
// ========================================================

const multer =
  require('multer');

const path =
  require('path');

const fs =
  require('fs');


// ========================================================
// CARPETA DE ARCHIVOS DEL CHAT
// ========================================================

const CHAT_UPLOAD_DIRECTORY =
  path.join(
    __dirname,
    '..',
    'public',
    'uploads',
    'chat'
  );


// Crear carpeta automáticamente si no existe.

try {

  fs.mkdirSync(
    CHAT_UPLOAD_DIRECTORY,
    {
      recursive: true
    }
  );

} catch (error) {

  console.error(
    'VOBIXCHAT CREATE CHAT UPLOAD DIRECTORY ERROR:',
    error
  );

}


// ========================================================
// ALMACENAMIENTO MULTER
// ========================================================

const chatStorage =
  multer.diskStorage({

    destination: (
      req,
      file,
      callback
    ) => {

      callback(
        null,
        CHAT_UPLOAD_DIRECTORY
      );

    },


    filename: (
      req,
      file,
      callback
    ) => {

      const original =
        safeFileName(
          file.originalname ||
          'archivo'
        );


      const extension =
        path.extname(
          original
        );


      const base =
        path
          .basename(
            original,
            extension
          )
          .slice(
            0,
            100
          );


      const random =
        Math.random()
          .toString(36)
          .slice(2, 10);


      const finalName =
        [
          Date.now(),
          random,
          base || 'archivo'
        ].join('-') +
        extension.toLowerCase();


      callback(
        null,
        finalName
      );

    }

  });


// ========================================================
// TIPOS DE ARCHIVOS ACEPTADOS
// ========================================================

function chatFileFilter(
  req,
  file,
  callback
) {

  const mime =
    String(
      file.mimetype ||
      ''
    )
      .trim()
      .toLowerCase();


  const originalName =
    String(
      file.originalname ||
      ''
    )
      .trim()
      .toLowerCase();


  // ------------------------------------------------------
  // IMÁGENES
  // ------------------------------------------------------

  if (
    mime.startsWith(
      'image/'
    )
  ) {

    return callback(
      null,
      true
    );

  }


  // ------------------------------------------------------
  // VÍDEOS
  // ------------------------------------------------------

  if (
    mime.startsWith(
      'video/'
    )
  ) {

    return callback(
      null,
      true
    );

  }


  // ------------------------------------------------------
  // AUDIO / NOTAS DE VOZ
  // ------------------------------------------------------

  if (
    mime.startsWith(
      'audio/'
    )
  ) {

    return callback(
      null,
      true
    );

  }


  // MediaRecorder puede producir webm.

  if (
    mime ===
      'application/octet-stream' &&
    originalName.endsWith(
      '.webm'
    )
  ) {

    return callback(
      null,
      true
    );

  }


  // ------------------------------------------------------
  // DOCUMENTOS
  // ------------------------------------------------------

  const allowedDocumentMimeTypes =
    new Set([

      'application/pdf',

      'text/plain',

      'text/csv',

      'application/msword',

      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

      'application/vnd.ms-excel',

      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

      'application/vnd.ms-powerpoint',

      'application/vnd.openxmlformats-officedocument.presentationml.presentation',

      'application/zip',

      'application/x-zip-compressed',

      'application/x-rar-compressed'

    ]);


  if (
    allowedDocumentMimeTypes.has(
      mime
    )
  ) {

    return callback(
      null,
      true
    );

  }


  // ------------------------------------------------------
  // COMPROBACIÓN ADICIONAL POR EXTENSIÓN
  // ------------------------------------------------------

  const extension =
    path
      .extname(
        originalName
      )
      .toLowerCase();


  const allowedExtensions =
    new Set([

      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp',

      '.mp4',
      '.webm',
      '.mov',

      '.mp3',
      '.wav',
      '.ogg',
      '.m4a',

      '.pdf',
      '.txt',
      '.csv',

      '.doc',
      '.docx',

      '.xls',
      '.xlsx',

      '.ppt',
      '.pptx',

      '.zip',
      '.rar'

    ]);


  if (
    allowedExtensions.has(
      extension
    )
  ) {

    return callback(
      null,
      true
    );

  }


  const error =
    new Error(
      'Tipo de archivo no permitido'
    );


  error.code =
    'VOBIXCHAT_FILE_TYPE';


  return callback(
    error
  );

}


// ========================================================
// CONFIGURACIÓN MULTER
// ========================================================

const chatUpload =
  multer({

    storage:
      chatStorage,

    limits: {

      /*
        50 MB por archivo.

        Fotos, documentos,
        notas de voz y vídeos cortos.
      */

      fileSize:
        50 * 1024 * 1024,

      files:
        1

    },

    fileFilter:
      chatFileFilter

  });


// ========================================================
// BORRAR ARCHIVO SI FALLA LA OPERACIÓN
// ========================================================

function removeUploadedFile(
  file
) {

  if (
    !file ||
    !file.path
  ) {

    return;

  }


  fs.unlink(
    file.path,
    error => {

      if (
        error &&
        error.code !== 'ENOENT'
      ) {

        console.error(
          'VOBIXCHAT REMOVE UPLOAD ERROR:',
          error.message
        );

      }

    }
  );

}


// ========================================================
// CONSTRUIR URL PÚBLICA DEL ARCHIVO
// ========================================================

function chatFileUrl(
  file
) {

  if (
    !file ||
    !file.filename
  ) {

    return '';
  }


  return (
    '/uploads/chat/' +
    encodeURIComponent(
      file.filename
    )
  );

}


// ========================================================
// POST /api/chat/upload
//
// RECIBE:
//
// file
// conversationId
// messageType
//
// ========================================================

router.post(
  '/upload',

  (
    req,
    res,
    next
  ) => {

    chatUpload.single(
      'file'
    )(
      req,
      res,
      error => {

        if (!error) {

          return next();

        }


        if (
          error instanceof
          multer.MulterError
        ) {

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


          return res
            .status(400)
            .json({

              ok: false,

              msg:
                'No se pudo recibir el archivo'

            });

        }


        if (
          error.code ===
          'VOBIXCHAT_FILE_TYPE'
        ) {

          return res
            .status(415)
            .json({

              ok: false,

              msg:
                'Este tipo de archivo no está permitido'

            });

        }


        console.error(
          'VOBIXCHAT MULTER ERROR:',
          error
        );


        return res
          .status(500)
          .json({

            ok: false,

            msg:
              'No se pudo procesar el archivo'

          });

      }
    );

  },

  async (
    req,
    res
  ) => {

    const userId =
      req.vobixUser.id;


    const conversationId =
      cleanId(
        req.body.conversationId ||
        req.body.conversation_id
      );


    if (!conversationId) {

      removeUploadedFile(
        req.file
      );


      return res
        .status(400)
        .json({

          ok: false,

          msg:
            'Conversación no válida'

        });

    }


    if (!req.file) {

      return res
        .status(400)
        .json({

          ok: false,

          msg:
            'No se recibió ningún archivo'

        });

    }


    try {

      // ==================================================
      // COMPROBAR QUE EL USUARIO PERTENECE A LA SALA
      // ==================================================

      const allowed =
        await canAccessConversation(
          conversationId,
          userId
        );


      if (!allowed) {

        removeUploadedFile(
          req.file
        );


        return res
          .status(403)
          .json({

            ok: false,

            msg:
              'No tienes acceso a esta conversación'

          });

      }


      // ==================================================
      // COMPROBAR BLOQUEOS
      // ==================================================

      const blocked =
        await conversationIsBlocked(
          conversationId,
          userId
        );


      if (blocked) {

        removeUploadedFile(
          req.file
        );


        return res
          .status(403)
          .json({

            ok: false,

            msg:
              'No se puede enviar el archivo'

          });

      }


      // ==================================================
      // DETERMINAR TIPO DE MENSAJE
      // ==================================================

      const messageType =
        normalizeMediaType(

          req.body.messageType ||
          req.body.message_type,

          req.file.mimetype

        );


      // ==================================================
      // URL QUE SE GUARDARÁ EN POSTGRESQL
      // ==================================================

      const fileUrl =
        chatFileUrl(
          req.file
        );


      if (!fileUrl) {

        removeUploadedFile(
          req.file
        );


        return res
          .status(500)
          .json({

            ok: false,

            msg:
              'No se pudo crear la dirección del archivo'

          });

      }


      // ==================================================
      // GUARDAR MENSAJE MULTIMEDIA
      // ==================================================

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
            $3,
            $4,
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
            messageType,
            fileUrl
          ]
        );


      // ==================================================
      // SUBIR CONVERSACIÓN AL PRINCIPIO DEL HISTORIAL
      // ==================================================

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


      const message =
        normalizeMessage(
          result.rows[0]
        );


      // ==================================================
      // RESPUESTA
      // ==================================================

      return res.json({

        ok: true,

        message,

        file: {

          url:
            fileUrl,

          name:
            req.file.originalname,

          storedName:
            req.file.filename,

          mimeType:
            req.file.mimetype,

          size:
            req.file.size,

          messageType

        }

      });


    } catch (error) {

      /*
        Si PostgreSQL falla después de haber
        guardado físicamente el archivo,
        eliminamos ese archivo para no dejar
        basura en /uploads/chat.
      */

      removeUploadedFile(
        req.file
      );


      console.error(
        'VOBIXCHAT CHAT UPLOAD ERROR:',
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
);


// ========================================================
// ALIAS PARA COMPATIBILIDAD
//
// Algunas versiones anteriores del frontend utilizaron
// /files en lugar de /upload.
// ========================================================

router.post(
  '/files',

  (
    req,
    res,
    next
  ) => {

    /*
      No duplicamos el almacenamiento aquí.

      Redirigimos internamente el request hacia
      la ruta oficial /upload.
    */

    req.url =
      '/upload';


    return router.handle(
      req,
      res,
      next
    );

  }
);


// ========================================================
// FIN BLOQUE 4/6
// CONTINÚA CON BLOQUE 5/6
// ========================================================
// ========================================================
// BLOQUE 5/6
// LECTURA / EDICIÓN / ELIMINACIÓN / SALA PRIVADA
// ========================================================


// ========================================================
// INFORMACIÓN DE UNA CONVERSACIÓN PRIVADA
// ========================================================

router.get(
  '/conversations/:conversationId',
  async (req, res) => {

    const userId =
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
          msg: 'Conversación no válida'
        });

    }


    try {

      const allowed =
        await canAccessConversation(
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
            c.id,
            c.created_at,
            c.updated_at,

            u.id
              AS other_user_id,

            u.username
              AS other_username,

            u.vobix_id
              AS other_vobix_id,

            u.phone
              AS other_phone,

            u.avatar_url
              AS other_avatar_url,

            u.bio
              AS other_bio,

            u.online
              AS other_online,

            u.last_seen
              AS other_last_seen

          FROM conversations c

          INNER JOIN conversation_participants me
            ON
              me.conversation_id = c.id
              AND me.user_id = $2

          LEFT JOIN conversation_participants other_cp
            ON
              other_cp.conversation_id = c.id
              AND other_cp.user_id <> $2

          LEFT JOIN users u
            ON
              u.id = other_cp.user_id

          WHERE
            c.id = $1

          ORDER BY
            other_cp.joined_at ASC

          LIMIT 1
          `,
          [
            conversationId,
            userId
          ]
        );


      if (
        result.rows.length === 0
      ) {

        return res
          .status(404)
          .json({
            ok: false,
            msg:
              'Conversación no encontrada'
          });

      }


      const row =
        result.rows[0];


      return res.json({

        ok: true,

        conversation: {

          id:
            row.id,

          conversationId:
            row.id,

          createdAt:
            row.created_at,

          updatedAt:
            row.updated_at,

          otherUserId:
            row.other_user_id,

          otherUsername:
            row.other_username,

          otherVobixId:
            row.other_vobix_id,

          otherPhone:
            row.other_phone,

          otherAvatarUrl:
            row.other_avatar_url,

          otherBio:
            row.other_bio,

          online:
            row.other_online,

          lastSeen:
            row.other_last_seen

        }

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT GET CONVERSATION ERROR:',
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


// ========================================================
// MARCAR CONVERSACIÓN COMO LEÍDA
// ========================================================

router.post(
  '/conversations/:conversationId/read',
  async (req, res) => {

    const userId =
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


      /*
        No hacemos UPDATE de columnas inventadas
        dentro de messages.

        La lectura se guarda en
        conversation_participants cuando esa
        columna existe en la instalación.
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
            userId
          ]
        );

      } catch (readError) {

        /*
          Compatibilidad con bases anteriores que
          todavía no tienen last_read_at.

          Leer una conversación no debe romper
          VOBIXCHAT por esa diferencia de esquema.
        */

        if (
          readError &&
          (
            readError.code === '42703' ||
            String(
              readError.message || ''
            ).includes(
              'last_read_at'
            )
          )
        ) {

          console.warn(
            'VOBIXCHAT: last_read_at todavía no existe.'
          );

        } else {

          throw readError;

        }

      }


      return res.json({
        ok: true
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


// ========================================================
// EDITAR MENSAJE PROPIO
// ========================================================

router.patch(
  '/messages/:messageId',
  async (req, res) => {

    const userId =
      req.vobixUser.id;

    const messageId =
      cleanId(
        req.params.messageId
      );

    const content =
      cleanMessage(
        req.body.content ||
        req.body.text ||
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

      const messageResult =
        await database.query(
          `
          SELECT
            id,
            conversation_id,
            sender_user_id,
            message_type,
            deleted

          FROM messages

          WHERE
            id = $1

          LIMIT 1
          `,
          [messageId]
        );


      if (
        messageResult.rows.length === 0
      ) {

        return res
          .status(404)
          .json({
            ok: false,
            msg:
              'Mensaje no encontrado'
          });

      }


      const original =
        messageResult.rows[0];


      if (
        String(
          original.sender_user_id
        ) !==
        String(
          userId
        )
      ) {

        return res
          .status(403)
          .json({
            ok: false,
            msg:
              'Solo puedes editar tus propios mensajes'
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
              'El mensaje fue eliminado'
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


      const allowed =
        await canAccessConversation(
          original.conversation_id,
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


      const updated =
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
            reply_to_message_id,
            edited,
            deleted,
            created_at,
            updated_at
          `,
          [
            content,
            messageId,
            userId
          ]
        );


      return res.json({

        ok: true,

        message:
          normalizeMessage(
            updated.rows[0]
          )

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


// ========================================================
// ELIMINAR MENSAJE PROPIO
// ========================================================

router.delete(
  '/messages/:messageId',
  async (req, res) => {

    const userId =
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

      const messageResult =
        await database.query(
          `
          SELECT
            id,
            conversation_id,
            sender_user_id,
            message_type,
            content,
            deleted

          FROM messages

          WHERE
            id = $1

          LIMIT 1
          `,
          [messageId]
        );


      if (
        messageResult.rows.length === 0
      ) {

        return res
          .status(404)
          .json({
            ok: false,
            msg:
              'Mensaje no encontrado'
          });

      }


      const message =
        messageResult.rows[0];


      if (
        String(
          message.sender_user_id
        ) !==
        String(
          userId
        )
      ) {

        return res
          .status(403)
          .json({
            ok: false,
            msg:
              'Solo puedes eliminar tus propios mensajes'
          });

      }


      const allowed =
        await canAccessConversation(
          message.conversation_id,
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


      /*
        Borrado lógico.

        Así no destruimos la estructura del historial
        ni referencias futuras a ese mensaje.
      */

      const deleted =
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
            reply_to_message_id,
            edited,
            deleted,
            created_at,
            updated_at
          `,
          [
            messageId,
            userId
          ]
        );


      return res.json({

        ok: true,

        message:
          normalizeMessage(
            deleted.rows[0]
          )

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


// ========================================================
// OBTENER PARTICIPANTES DE LA CONVERSACIÓN
// ========================================================

router.get(
  '/conversations/:conversationId/participants',
  async (req, res) => {

    const userId =
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
            u.id,
            u.username,
            u.vobix_id,
            u.phone,
            u.avatar_url,
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
          [conversationId]
        );


      return res.json({

        ok: true,

        participants:
          result.rows

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT PARTICIPANTS ERROR:',
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


// ========================================================
// ESTADO DE BLOQUEO DE LA SALA
// ========================================================

router.get(
  '/conversations/:conversationId/block-status',
  async (req, res) => {

    const userId =
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


      const blocked =
        await conversationIsBlocked(
          conversationId,
          userId
        );


      return res.json({

        ok: true,

        blocked

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT BLOCK STATUS ERROR:',
        error
      );


      return res
        .status(500)
        .json({
          ok: false,
          msg:
            'No se pudo comprobar el estado de la conversación'
        });

    }

  }
);


// ========================================================
// FIN BLOQUE 5/6
// NO PONGAS module.exports TODAVÍA.
// EL BLOQUE 6 CIERRA EL ARCHIVO.
// ========================================================
// ========================================================
// BLOQUE 6/6
// UTILIDADES FINALES / COMPATIBILIDAD / CIERRE DEL ROUTER
// ========================================================


// ========================================================
// COMPROBAR ESTADO GENERAL DE CHAT
// ========================================================

router.get(
  '/status',
  async (req, res) => {

    const userId =
      req.vobixUser.id;


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
            online,
            last_seen

          FROM users

          WHERE
            id = $1

          LIMIT 1
          `,
          [userId]
        );


      if (
        result.rows.length === 0
      ) {

        return res
          .status(404)
          .json({

            ok: false,

            msg:
              'Usuario no encontrado'

          });

      }


      return res.json({

        ok: true,

        chat:
          true,

        user:
          result.rows[0]

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
            'No se pudo comprobar VOBIXCHAT'

        });

    }

  }
);


// ========================================================
// CONTAR CONVERSACIONES
// ========================================================

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
            COUNT(DISTINCT conversation_id)::INTEGER
              AS total

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


// ========================================================
// BUSCAR CONVERSACIÓN PRIVADA CON UN USUARIO
// ========================================================

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
      String(
        currentUserId
      ) ===
      String(
        otherUserId
      )
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

      const result =
        await database.query(
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

          INNER JOIN conversation_participants other
            ON
              other.conversation_id = c.id
              AND other.user_id = $2

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


      if (
        result.rows.length === 0
      ) {

        return res.json({

          ok: true,

          exists:
            false,

          conversation:
            null

        });

      }


      return res.json({

        ok: true,

        exists:
          true,

        conversation: {

          id:
            result.rows[0].id,

          conversationId:
            result.rows[0].id,

          createdAt:
            result.rows[0].created_at,

          updatedAt:
            result.rows[0].updated_at

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


// ========================================================
// LISTAR USUARIOS BLOQUEADOS
// ========================================================

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
            ub.created_at
              AS blocked_at

          FROM user_blocks ub

          INNER JOIN users u
            ON u.id =
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

        users:
          result.rows

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


// ========================================================
// HEALTH CHECK INTERNO DEL ROUTER
// ========================================================

router.get(
  '/health',
  async (req, res) => {

    try {

      await database.query(
        'SELECT 1 AS ok'
      );


      return res.json({

        ok: true,

        service:
          'VOBIXCHAT CHAT',

        database:
          true

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT CHAT HEALTH ERROR:',
        error
      );


      return res
        .status(503)
        .json({

          ok: false,

          service:
            'VOBIXCHAT CHAT',

          database:
            false

        });

    }

  }
);


// ========================================================
// MANEJADOR DE ERROR DE MULTER
// ========================================================

router.use(
  (
    error,
    req,
    res,
    next
  ) => {

    if (!error) {

      return next();

    }


    if (
      error instanceof
      multer.MulterError
    ) {

      if (
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
        .status(400)
        .json({

          ok: false,

          msg:
            'No se pudo procesar el archivo'

        });

    }


    if (
      error.code ===
      'VOBIXCHAT_FILE_TYPE'
    ) {

      return res
        .status(415)
        .json({

          ok: false,

          msg:
            'Tipo de archivo no permitido'

        });

    }


    console.error(
      'VOBIXCHAT CHAT ROUTER ERROR:',
      error
    );


    return res
      .status(500)
      .json({

        ok: false,

        msg:
          'Error interno de VOBIXCHAT'

      });

  }
);


// ========================================================
// EXPORTAR ROUTER
// ========================================================

module.exports =
  router;


// ========================================================
// FIN routes/chat.js
// VOBIXCHAT
// ========================================================
