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
 - Mensajes de texto
 - Fotos
 - Vídeos
 - Notas de voz
 - Documentos
 - Multimedia persistida con metadatos
 - Socket.IO
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
// OBTENER PARTICIPANTES
// ========================================================

async function getConversationParticipants(
  conversationId
) {

  const result =
    await database.query(
      `
      SELECT
        cp.user_id,
        u.username,
        u.avatar_url,
        u.online,
        u.last_seen

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


  return result.rows;

}


// ========================================================
// EMITIR MENSAJE DESDE UNA RUTA HTTP
// ========================================================

async function broadcastConversationMessage(
  req,
  conversationId,
  senderUserId,
  message
) {

  const io =
    req.app.get('io');


  if (!io) {

    return false;

  }


  // Usuarios que tienen esta conversación abierta.
  io
    .to(
      `conversation:${conversationId}`
    )
    .emit(
      'conversation-message',
      {
        conversationId,
        message
      }
    );


  /*
    También avisamos mediante la sala permanente del
    usuario.

    server.js hace:

      socket.join(`user:${userId}`)

    Por eso el destinatario puede recibir el aviso aunque
    tenga VobixChat abierto en otra pantalla.
  */

  try {

    const participants =
      await getConversationParticipants(
        conversationId
      );


    for (
      const participant
      of participants
    ) {

      if (
        String(
          participant.user_id
        ) ===
        String(
          senderUserId
        )
      ) {

        continue;

      }


      io
        .to(
          `user:${participant.user_id}`
        )
        .emit(
          'conversation:new-message',
          {
            conversationId,
            message
          }
        );

    }


  } catch (error) {

    console.error(
      'VOBIXCHAT BROADCAST PARTICIPANTS ERROR:',
      error.message
    );

  }


  return true;

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
// CREAR / RECUPERAR CONVERSACIÓN PRIVADA
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
      // BUSCAR CONVERSACIÓN PRIVADA EXISTENTE
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


      if (
        existing.rows.length > 0
      ) {

        const conversation =
          existing.rows[0];


        const otherUser =
          otherUserResult.rows[0];


        return res.json({

          ok: true,

          conversation: {

            ...conversation,

            otherUserId:
              otherUser.id,

            otherUsername:
              otherUser.username,

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
      // CREAR CONVERSACIÓN NUEVA
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

          conversation: {

            ...conversation,

            otherUserId:
              otherUser.id,

            otherUsername:
              otherUser.username,

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
        error.message
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
// FIN BLOQUE 1/3
//
// NO PONGAS module.exports TODAVÍA.
// BLOQUE 2/3 VA JUSTO DEBAJO.
// ========================================================
// ========================================================
// LISTAR CONVERSACIONES
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
              AS last_message_content,

            last_message.file_url
              AS last_message_file_url,

            last_message.file_name
              AS last_message_file_name,

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
              m.file_url,
              m.file_name,
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


      const conversations =
        result.rows.map(
          row => {

            const type =
              String(
                row.last_message_type ||
                ''
              ).toLowerCase();


            let preview =
              row.last_message_content ||
              'Conversación privada';


            if (
              type === 'image' ||
              type === 'photo'
            ) {

              preview =
                '📷 Foto';

            }


            if (
              type === 'video'
            ) {

              preview =
                '🎥 Vídeo';

            }


            if (
              type === 'audio' ||
              type === 'voice'
            ) {

              preview =
                '🎤 Nota de voz';

            }


            if (
              type === 'document' ||
              type === 'file'
            ) {

              preview =
                row.last_message_file_name
                  ? `📄 ${row.last_message_file_name}`
                  : '📄 Documento';

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

              lastMessageFileUrl:
                row.last_message_file_url ||
                null,

              lastMessageFileName:
                row.last_message_file_name ||
                null,

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
// NORMALIZAR MENSAJE
// ========================================================

function normalizeMessage(
  row
) {

  if (!row) {

    return null;

  }


  const messageType =
    String(
      row.message_type ||
      row.messageType ||
      'text'
    )
      .trim()
      .toLowerCase();


  const content =
    row.content == null
      ? ''
      : String(
          row.content
        );


  const fileUrl =
    row.file_url ||
    row.fileUrl ||
    null;


  const fileName =
    row.file_name ||
    row.fileName ||
    null;


  const fileMime =
    row.file_mime ||
    row.fileMime ||
    row.mimeType ||
    null;


  const fileSize =
    row.file_size == null
      ? (
          row.fileSize == null
            ? null
            : Number(
                row.fileSize
              )
        )
      : Number(
          row.file_size
        );


  const fileResourceType =
    row.file_resource_type ||
    row.fileResourceType ||
    null;


  const mediaDuration =
    row.media_duration == null
      ? (
          row.mediaDuration == null
            ? null
            : Number(
                row.mediaDuration
              )
        )
      : Number(
          row.media_duration
        );


  const mediaWidth =
    row.media_width == null
      ? (
          row.mediaWidth == null
            ? null
            : Number(
                row.mediaWidth
              )
        )
      : Number(
          row.media_width
        );


  const mediaHeight =
    row.media_height == null
      ? (
          row.mediaHeight == null
            ? null
            : Number(
                row.mediaHeight
              )
        )
      : Number(
          row.media_height
        );


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

    sender_avatar_url:
      row.sender_avatar_url ||
      null,

    messageType,

    message_type:
      messageType,

    content,

    text:
      content,

    /*
      Multimedia real.

      YA NO asumimos que content contiene
      la URL del archivo.
    */

    mediaUrl:
      fileUrl,

    media_url:
      fileUrl,

    fileUrl,

    file_url:
      fileUrl,

    fileName,

    file_name:
      fileName,

    mimeType:
      fileMime,

    fileMime,

    file_mime:
      fileMime,

    size:
      fileSize,

    fileSize,

    file_size:
      fileSize,

    fileResourceType,

    file_resource_type:
      fileResourceType,

    duration:
      mediaDuration,

    mediaDuration,

    media_duration:
      mediaDuration,

    width:
      mediaWidth,

    mediaWidth,

    media_width:
      mediaWidth,

    height:
      mediaHeight,

    mediaHeight,

    media_height:
      mediaHeight,

    replyToMessageId:
      row.reply_to_message_id ||
      null,

    reply_to_message_id:
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
// CARGAR MENSAJES DE UNA CONVERSACIÓN
// ========================================================

router.get(
  '/conversations/:conversationId/messages',
  async (
    req,
    res
  ) => {

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
            m.id,
            m.conversation_id,
            m.sender_user_id,
            m.message_type,
            m.content,

            m.file_url,
            m.file_name,
            m.file_mime,
            m.file_size,
            m.file_resource_type,

            m.media_duration,
            m.media_width,
            m.media_height,

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
            ON u.id =
              m.sender_user_id

          WHERE
            m.conversation_id = $1

          ORDER BY
            m.created_at ASC,
            m.id ASC

          LIMIT 1000
          `,
          [
            conversationId
          ]
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
// ENVIAR MENSAJE DE TEXTO POR HTTP
// ========================================================

router.post(
  '/conversations/:conversationId/messages',
  async (
    req,
    res
  ) => {

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

          msg:
            'Conversación no válida'

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

            file_url,
            file_name,
            file_mime,
            file_size,
            file_resource_type,

            media_duration,
            media_width,
            media_height,

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

        WHERE
          id = $1
        `,
        [
          conversationId
        ]
      );


      const row =
        result.rows[0];


      row.sender_username =
        req.vobixUser.username;


      row.sender_avatar_url =
        req.vobixUser.avatar_url ||
        null;


      const message =
        normalizeMessage(
          row
        );


      const broadcasted =
        await broadcastConversationMessage(
          req,
          conversationId,
          userId,
          message
        );


      return res.json({

        ok: true,

        message,

        broadcasted

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
      requestedType ||
      ''
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
      mimeType ||
      ''
    )
      .trim()
      .toLowerCase();


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
// OBTENER RESOURCE TYPE
// ========================================================

function getFileResourceType(
  messageType
) {

  switch (
    messageType
  ) {

    case 'image':

      return 'image';


    case 'video':

      return 'video';


    case 'audio':

      return 'audio';


    default:

      return 'raw';

  }

}


// ========================================================
// NOMBRE SEGURO PARA ARCHIVOS
// ========================================================

function safeFileName(
  value
) {

  const original =
    String(
      value ||
      'archivo'
    );


  const cleaned =
    original
      .normalize(
        'NFKD'
      )
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .replace(
        /[^a-zA-Z0-9._-]/g,
        '-'
      )
      .replace(
        /-+/g,
        '-'
      )
      .replace(
        /^[-.]+|[-.]+$/g,
        ''
      )
      .slice(
        0,
        150
      );


  return (
    cleaned ||
    'archivo'
  );

}


// ========================================================
// OBTENER EXTENSIÓN
// ========================================================

function getFileExtension(
  fileName,
  mimeType
) {

  const name =
    String(
      fileName ||
      ''
    );


  const lastDot =
    name.lastIndexOf(
      '.'
    );


  if (
    lastDot > -1 &&
    lastDot <
      name.length - 1
  ) {

    const extension =
      name
        .slice(
          lastDot
        )
        .toLowerCase()
        .replace(
          /[^a-z0-9.]/g,
          ''
        )
        .slice(
          0,
          12
        );


    if (
      extension &&
      extension !== '.'
    ) {

      return extension;

    }

  }


  const mime =
    String(
      mimeType ||
      ''
    ).toLowerCase();


  const extensions = {

    'image/jpeg':
      '.jpg',

    'image/png':
      '.png',

    'image/webp':
      '.webp',

    'image/gif':
      '.gif',

    'image/heic':
      '.heic',

    'image/heif':
      '.heif',

    'video/mp4':
      '.mp4',

    'video/quicktime':
      '.mov',

    'video/webm':
      '.webm',

    'audio/mp4':
      '.m4a',

    'audio/mpeg':
      '.mp3',

    'audio/webm':
      '.webm',

    'audio/ogg':
      '.ogg',

    'audio/wav':
      '.wav',

    'audio/x-wav':
      '.wav',

    'application/pdf':
      '.pdf',

    'text/plain':
      '.txt'

  };


  return (
    extensions[mime] ||
    ''
  );

}


// ========================================================
// VALIDAR MIME TYPE
// ========================================================

function isAllowedMimeType(
  mimeType
) {

  const mime =
    String(
      mimeType ||
      ''
    )
      .trim()
      .toLowerCase();


  if (
    mime.startsWith(
      'image/'
    )
  ) {

    return true;

  }


  if (
    mime.startsWith(
      'video/'
    )
  ) {

    return true;

  }


  if (
    mime.startsWith(
      'audio/'
    )
  ) {

    return true;

  }


  const documents =
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

      'application/octet-stream'

    ]);


  return documents.has(
    mime
  );

}


// ========================================================
// LÍMITE DE SUBIDA
// ========================================================

const CHAT_UPLOAD_MAX_BYTES =
  50 * 1024 * 1024;


// ========================================================
// FIN BLOQUE 2/3
//
// NO PONGAS module.exports TODAVÍA.
// BLOQUE 3/3 VA JUSTO DEBAJO.
// ========================================================
// ========================================================
// MULTER / SISTEMA DE ARCHIVOS
// ========================================================

const multer =
  require('multer');

const path =
  require('path');

const fs =
  require('fs');

const crypto =
  require('crypto');


// ========================================================
// CARPETA TEMPORAL/PÚBLICA DEL CHAT
// ========================================================
//
// IMPORTANTE:
//
// En Render, el filesystem local NO debe considerarse
// almacenamiento permanente.
//
// Esta implementación permite probar cámara, fotos,
// vídeos, notas de voz y documentos.
//
// Más adelante moveremos los archivos a almacenamiento
// persistente sin cambiar la estructura de messages,
// porque schema.js ya tiene file_url y file_public_id.
// ========================================================

const CHAT_UPLOAD_DIR =
  path.join(
    __dirname,
    '..',
    'public',
    'uploads',
    'chat'
  );


fs.mkdirSync(
  CHAT_UPLOAD_DIR,
  {
    recursive: true
  }
);


// ========================================================
// STORAGE MULTER
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
        CHAT_UPLOAD_DIR
      );

    },


    filename: (
      req,
      file,
      callback
    ) => {

      const extension =
        getFileExtension(
          file.originalname,
          file.mimetype
        );


      let randomId;


      try {

        randomId =
          crypto
            .randomBytes(16)
            .toString('hex');

      } catch (error) {

        randomId =
          Math.random()
            .toString(16)
            .slice(2);

      }


      const finalName =
        `${Date.now()}-${randomId}${extension}`;


      callback(
        null,
        finalName
      );

    }

  });


// ========================================================
// MULTER
// ========================================================

const chatUpload =
  multer({

    storage:
      chatStorage,


    limits: {

      fileSize:
        CHAT_UPLOAD_MAX_BYTES,

      files:
        1

    },


    fileFilter: (
      req,
      file,
      callback
    ) => {

      if (
        !isAllowedMimeType(
          file.mimetype
        )
      ) {

        const error =
          new Error(
            'Tipo de archivo no permitido'
          );


        error.code =
          'VOBIX_INVALID_FILE_TYPE';


        return callback(
          error
        );

      }


      return callback(
        null,
        true
      );

    }

  });


// ========================================================
// ELIMINAR ARCHIVO LOCAL
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


  try {

    if (
      fs.existsSync(
        file.path
      )
    ) {

      fs.unlinkSync(
        file.path
      );

    }

  } catch (error) {

    console.error(
      'VOBIXCHAT DELETE UPLOAD ERROR:',
      error.message
    );

  }

}


// ========================================================
// MIDDLEWARE UPLOAD
// ========================================================

function uploadSingleChatFile(
  req,
  res,
  next
) {

  chatUpload.single(
    'file'
  )(
    req,
    res,
    error => {

      if (!error) {

        return next();

      }


      console.error(
        'VOBIXCHAT MULTER ERROR:',
        error.message
      );


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
              'No se pudo procesar el archivo'

          });

      }


      if (
        error.code ===
        'VOBIX_INVALID_FILE_TYPE'
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
        .status(500)
        .json({

          ok: false,

          msg:
            'Error procesando el archivo'

        });

    }
  );

}


// ========================================================
// NORMALIZAR NÚMERO OPCIONAL
// ========================================================

function optionalNumber(
  value
) {

  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {

    return null;

  }


  const number =
    Number(
      value
    );


  if (
    !Number.isFinite(
      number
    )
  ) {

    return null;

  }


  return number;

}


// ========================================================
// POST /api/chat/upload
//
// multipart/form-data:
//
// file
// conversationId
// messageType
//
// OPCIONALES:
//
// duration
// width
// height
// ========================================================

router.post(
  '/upload',

  uploadSingleChatFile,

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
      // COMPROBAR ACCESO
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
      // COMPROBAR BLOQUEO
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
      // NORMALIZAR TIPO
      // ==================================================

      const messageType =
        normalizeMediaType(
          req.body.messageType ||
          req.body.message_type,
          req.file.mimetype
        );


      const resourceType =
        getFileResourceType(
          messageType
        );


      // ==================================================
      // METADATOS
      // ==================================================

      const originalFileName =
        safeFileName(
          req.file.originalname
        );


      const fileMime =
        String(
          req.file.mimetype ||
          'application/octet-stream'
        )
          .trim()
          .toLowerCase();


      const fileSize =
        Number(
          req.file.size ||
          0
        );


      const mediaDuration =
        optionalNumber(
          req.body.duration ||
          req.body.mediaDuration ||
          req.body.media_duration
        );


      const mediaWidth =
        optionalNumber(
          req.body.width ||
          req.body.mediaWidth ||
          req.body.media_width
        );


      const mediaHeight =
        optionalNumber(
          req.body.height ||
          req.body.mediaHeight ||
          req.body.media_height
        );


      // ==================================================
      // URL PÚBLICA
      // ==================================================

      const fileUrl =
        `/uploads/chat/${encodeURIComponent(
          req.file.filename
        )}`;


      // ==================================================
      // GUARDAR EN POSTGRESQL
      // ========================================================
      //
      // AHORA SÍ utilizamos las columnas multimedia
      // existentes en schema.js.
      //
      // content queda vacío para multimedia.
      // file_url contiene la URL real.
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

            file_url,
            file_name,
            file_mime,
            file_size,
            file_resource_type,

            media_duration,
            media_width,
            media_height,

            created_at,
            updated_at
          )

          VALUES
          (
            $1,
            $2,
            $3,
            '',
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            NOW(),
            NOW()
          )

          RETURNING
            id,
            conversation_id,
            sender_user_id,
            message_type,
            content,

            file_url,
            file_name,
            file_mime,
            file_size,
            file_resource_type,

            media_duration,
            media_width,
            media_height,

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
            fileUrl,
            originalFileName,
            fileMime,
            fileSize,
            resourceType,
            mediaDuration,
            mediaWidth,
            mediaHeight
          ]
        );


      // ==================================================
      // ACTUALIZAR CONVERSACIÓN
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


      // ==================================================
      // PREPARAR MENSAJE PARA FRONTEND
      // ==================================================

      const row =
        result.rows[0];


      row.sender_username =
        req.vobixUser.username;


      row.sender_avatar_url =
        req.vobixUser.avatar_url ||
        null;


      const message =
        normalizeMessage(
          row
        );


      // ==================================================
      // EMITIR SOCKET.IO
      // ==================================================

      const broadcasted =
        await broadcastConversationMessage(
          req,
          conversationId,
          userId,
          message
        );


      // ==================================================
      // RESPUESTA
      // ==================================================

      return res.json({

        ok: true,

        message,

        broadcasted

      });


    } catch (error) {

      /*
        Si falla PostgreSQL después de subir el archivo,
        eliminamos el archivo local para no dejar basura.
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
// ESTADO MULTIMEDIA
// ========================================================

router.get(
  '/media/status',
  (
    req,
    res
  ) => {

    return res.json({

      ok: true,

      enabled:
        true,

      maxFileSize:
        CHAT_UPLOAD_MAX_BYTES,

      maxFileSizeMb:
        50,

      storage:
        'local-temporary',

      types: [

        'image',

        'video',

        'audio',

        'document'

      ]

    });

  }
);


// ========================================================
// MANEJO DE ERRORES DEL ROUTER
// ========================================================

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


    return res
      .status(500)
      .json({

        ok: false,

        msg:
          'Error interno del chat'

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
// ========================================================
