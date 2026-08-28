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
 - Enviar mensajes de texto
 - Fotos
 - Vídeos
 - Notas de voz / audio
 - Documentos
 - Cloudinary
 - Compatibilidad frontend VOBIXCHAT
==========================================================
*/

const express = require('express');
const multer = require('multer');
const streamifier = require('streamifier');
const { v2: cloudinary } = require('cloudinary');

const database = require('../database/db');

const router = express.Router();


// ========================================================
// CLOUDINARY
// ========================================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});


// ========================================================
// MULTER - MEMORIA
// ========================================================

const upload = multer({

  storage: multer.memoryStorage(),

  limits: {
    fileSize: 50 * 1024 * 1024
  }

});


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


function cleanFileName(value) {

  return String(value || 'archivo')
    .replace(/[\r\n]/g, '')
    .trim()
    .slice(0, 255) || 'archivo';

}


// ========================================================
// COMPROBAR CLOUDINARY
// ========================================================

function cloudinaryIsConfigured() {

  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );

}


// ========================================================
// DETERMINAR TIPO DEL MENSAJE
// ========================================================

function getMessageType(file, requestedType) {

  const mime =
    String(
      file?.mimetype || ''
    ).toLowerCase();

  const requested =
    String(
      requestedType || ''
    ).toLowerCase();


  if (
    requested === 'voice' ||
    requested === 'audio' ||
    mime.startsWith('audio/')
  ) {

    return 'audio';

  }


  if (
    requested === 'camera' ||
    mime.startsWith('image/')
  ) {

    return 'image';

  }


  if (
    mime.startsWith('video/')
  ) {

    return 'video';

  }


  return 'document';

}


// ========================================================
// RESOURCE TYPE CLOUDINARY
// ========================================================

function getCloudinaryResourceType(messageType) {

  if (
    messageType === 'video' ||
    messageType === 'audio'
  ) {

    return 'video';

  }


  if (messageType === 'image') {

    return 'image';

  }


  return 'raw';

}


// ========================================================
// SUBIR BUFFER A CLOUDINARY
// ========================================================

function uploadBufferToCloudinary(
  file,
  messageType
) {

  return new Promise(
    (resolve, reject) => {

      const resourceType =
        getCloudinaryResourceType(
          messageType
        );


      const options = {

        folder: 'vobixchat/messages',

        resource_type:
          resourceType,

        use_filename:
          true,

        unique_filename:
          true,

        overwrite:
          false

      };


      const uploadStream =
        cloudinary.uploader.upload_stream(
          options,
          (error, result) => {

            if (error) {

              reject(error);

              return;

            }


            resolve(result);

          }
        );


      streamifier
        .createReadStream(
          file.buffer
        )
        .pipe(
          uploadStream
        );

    }
  );

}


// ========================================================
// BORRAR CLOUDINARY SI FALLA LA BD
// ========================================================

async function destroyCloudinaryFile(
  publicId,
  resourceType
) {

  if (!publicId) {
    return;
  }


  try {

    await cloudinary.uploader.destroy(
      publicId,
      {
        resource_type:
          resourceType || 'image'
      }
    );

  } catch (error) {

    console.error(
      'VOBIXCHAT CLOUDINARY CLEANUP ERROR:',
      error.message
    );

  }

}


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
// COMPROBAR BLOQUEO EN CONVERSACIÓN
// ========================================================

async function conversationIsBlocked(
  conversationId,
  userId
) {

  const blocked =
    await database.query(
      `
      SELECT ub.id

      FROM user_blocks ub

      INNER JOIN conversation_participants cp
        ON cp.conversation_id = $1

      WHERE
        cp.user_id <> $2

        AND
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
// NORMALIZAR MENSAJE PARA FRONTEND
// ========================================================

function normalizeMessage(
  row,
  senderUsername
) {

  if (!row) {
    return null;
  }


  return {

    ...row,

    text:
      row.content,

    senderId:
      row.sender_user_id,

    senderUsername:
      senderUsername ??
      row.sender_username ??
      null,

    fileUrl:
      row.file_url || null,

    fileName:
      row.file_name || null,

    fileMime:
      row.file_mime || null,

    fileSize:
      row.file_size == null
        ? null
        : Number(row.file_size),

    mediaDuration:
      row.media_duration == null
        ? null
        : Number(row.media_duration),

    mediaWidth:
      row.media_width == null
        ? null
        : Number(row.media_width),

    mediaHeight:
      row.media_height == null
        ? null
        : Number(row.media_height)

  };

}


// ========================================================
// EMITIR MENSAJE
// ========================================================

function emitMessage(
  req,
  conversationId,
  message
) {

  const io =
    req.app.get('io');


  if (!io) {
    return;
  }


  const room =
    `conversation:${conversationId}`;


  io
    .to(room)
    .emit(
      'chat:message',
      message
    );


  io
    .to(room)
    .emit(
      'message:new',
      message
    );


  /*
    Compatibilidad directa con el chat.html
    que utiliza conversation-message.
  */

  io
    .to(room)
    .emit(
      'conversation-message',
      {
        conversationId,
        conversation_id:
          conversationId,
        message
      }
    );

}


// ========================================================
// BUSCAR USUARIOS
// ========================================================

router.get(
  '/users/search',
  async (req, res) => {

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
              WHEN LOWER(username)
                = LOWER($4)
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
        error.message
      );


      return res.status(500).json({
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
          [userId]
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


      return res.status(500).json({
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
      cleanId(
        req.body.userId
      );


    const alias =
      String(
        req.body.alias || ''
      )
        .trim()
        .slice(0, 100);


    if (!contactUserId) {

      return res.status(400).json({
        ok: false,
        msg: 'Falta el usuario'
      });

    }


    if (
      String(ownerUserId) ===
      String(contactUserId)
    ) {

      return res.status(400).json({
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
          [contactUserId]
        );


      if (
        userResult.rows.length === 0 ||
        !userResult.rows[0].verified
      ) {

        return res.status(404).json({
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


      return res.status(500).json({
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
      cleanId(
        req.params.userId
      );


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


      return res.status(500).json({
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
      cleanId(
        req.params.userId
      );


    if (
      String(blockerUserId) ===
      String(blockedUserId)
    ) {

      return res.status(400).json({
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
          [blockedUserId]
        );


      if (
        exists.rows.length === 0
      ) {

        return res.status(404).json({
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


      return res.status(500).json({
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
      cleanId(
        req.params.userId
      );


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


      return res.status(500).json({
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

async function createPrivateConversation(
  req,
  res
) {

  const currentUserId =
    req.vobixUser.id;


  const otherUserId =
    cleanId(
      req.body.userId ||
      req.body.user_id ||
      req.body.otherUserId
    );


  if (!otherUserId) {

    return res.status(400).json({
      ok: false,
      msg: 'Falta el usuario'
    });

  }


  if (
    String(currentUserId) ===
    String(otherUserId)
  ) {

    return res.status(400).json({
      ok: false,
      msg:
        'No puedes crear un chat contigo mismo'
    });

  }


  const client =
    await database.pool.connect();


  try {

    await client.query(
      'BEGIN'
    );


    const userResult =
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

        WHERE id = $1

        LIMIT 1
        `,
        [otherUserId]
      );


    if (
      userResult.rows.length === 0 ||
      !userResult.rows[0].verified
    ) {

      await client.query(
        'ROLLBACK'
      );


      return res.status(404).json({
        ok: false,
        msg:
          'Usuario no encontrado'
      });

    }


    // ====================================================
    // BLOQUEOS
    // ====================================================

    const blockResult =
      await client.query(
        `
        SELECT id

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
      blockResult.rows.length > 0
    ) {

      await client.query(
        'ROLLBACK'
      );


      return res.status(403).json({
        ok: false,
        msg:
          'No se puede iniciar esta conversación'
      });

    }


    // ====================================================
    // BUSCAR PRIVADA EXISTENTE
    // ====================================================

    const existing =
      await client.query(
        `
        SELECT
          c.id,
          c.type,
          c.title,
          c.created_at,
          c.updated_at

        FROM conversations c

        INNER JOIN conversation_participants p1
          ON p1.conversation_id =
            c.id

        INNER JOIN conversation_participants p2
          ON p2.conversation_id =
            c.id

        WHERE
          c.type = 'private'
          AND p1.user_id = $1
          AND p2.user_id = $2

          AND
          (
            SELECT COUNT(*)

            FROM conversation_participants cp

            WHERE
              cp.conversation_id =
                c.id
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


      const conversation =
        existing.rows[0];


      return res.json({
        ok: true,
        created: false,

        conversation,

        conversationId:
          conversation.id,

        user:
          userResult.rows[0]
      });

    }


    // ====================================================
    // CREAR CONVERSACIÓN
    // ====================================================

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
          type,
          title,
          created_at,
          updated_at
        `,
        [currentUserId]
      );


    const conversation =
      conversationResult.rows[0];


    // ====================================================
    // PARTICIPANTES
    // ====================================================

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

      conversationId:
        conversation.id,

      user:
        userResult.rows[0]
    });


  } catch (error) {

    try {

      await client.query(
        'ROLLBACK'
      );

    } catch (_) {}


    console.error(
      'VOBIXCHAT PRIVATE CHAT ERROR:',
      error.message
    );


    return res.status(500).json({
      ok: false,
      msg:
        'No se pudo crear la conversación'
    });


  } finally {

    client.release();

  }

}


// ========================================================
// RUTAS COMPATIBLES PARA CREAR CHAT
// ========================================================

router.post(
  '/conversations',
  createPrivateConversation
);


router.post(
  '/conversations/private',
  createPrivateConversation
);


// ========================================================
// LISTAR CONVERSACIONES
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

            last_message.content
              AS last_message_content,

            last_message.message_type
              AS last_message_type,

            last_message.file_name
              AS last_message_file_name,

            last_message.created_at
              AS last_message_at

          FROM conversations c

          INNER JOIN conversation_participants mine
            ON mine.conversation_id =
              c.id
            AND mine.user_id =
              $1

          LEFT JOIN LATERAL
          (
            SELECT u.*

            FROM conversation_participants cp

            INNER JOIN users u
              ON u.id =
                cp.user_id

            WHERE
              cp.conversation_id =
                c.id
              AND cp.user_id <>
                $1

            LIMIT 1

          ) other_user
          ON TRUE

          LEFT JOIN LATERAL
          (
            SELECT
              m.id,
              m.content,
              m.message_type,
              m.file_name,
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
          [userId]
        );


      const conversations =
        result.rows.map(
          row => {

            let lastMessage =
              row.last_message_content ||
              null;


            if (!lastMessage) {

              if (
                row.last_message_type ===
                'image'
              ) {

                lastMessage =
                  '📷 Foto';

              } else if (
                row.last_message_type ===
                'video'
              ) {

                lastMessage =
                  '🎥 Vídeo';

              } else if (
                row.last_message_type ===
                'audio'
              ) {

                lastMessage =
                  '🎤 Nota de voz';

              } else if (
                row.last_message_type ===
                'document'
              ) {

                lastMessage =
                  '📎 ' +
                  (
                    row.last_message_file_name ||
                    'Documento'
                  );

              }

            }


            return {

              ...row,

              user:
                row.other_user_id
                  ? {
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
                        row.other_online,

                      last_seen:
                        row.other_last_seen
                    }
                  : null,

              lastMessage

            };

          }
        );


      return res.json({
        ok: true,
        conversations
      });


    } catch (error) {

      console.error(
        'VOBIXCHAT CONVERSATION LIST ERROR:',
        error.message
      );


      return res.status(500).json({
        ok: false,
        msg:
          'No se pudieron cargar las conversaciones'
      });

    }

  }
);


// ========================================================
// CARGAR MENSAJES
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


    try {

      const allowed =
        await userCanAccessConversation(
          conversationId,
          userId
        );


      if (!allowed) {

        return res.status(403).json({
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
            m.file_public_id,
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

          LEFT JOIN users u
            ON u.id =
              m.sender_user_id

          WHERE
            m.conversation_id =
              $1

          ORDER BY
            m.created_at ASC

          LIMIT 200
          `,
          [conversationId]
        );


      const messages =
        result.rows.map(
          message =>
            normalizeMessage(
              message
            )
        );


      return res.json({
        ok: true,
        messages
      });


    } catch (error) {

      console.error(
        'VOBIXCHAT MESSAGE LIST ERROR:',
        error.message
      );


      return res.status(500).json({
        ok: false,
        msg:
          'No se pudieron cargar los mensajes'
      });

    }

  }
);


// ========================================================
// ENVIAR MENSAJE DE TEXTO
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
        req.body.text ??
        req.body.content ??
        req.body.message
      );


    if (!content) {

      return res.status(400).json({
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

        return res.status(403).json({
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

        return res.status(403).json({
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
            file_public_id,
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
        SET updated_at = NOW()
        WHERE id = $1
        `,
        [conversationId]
      );


      const message =
        normalizeMessage(
          result.rows[0],
          req.vobixUser.username ||
          null
        );


      emitMessage(
        req,
        conversationId,
        message
      );


      return res.json({
        ok: true,
        message
      });


    } catch (error) {

      console.error(
        'VOBIXCHAT SEND MESSAGE ERROR:',
        error.message
      );


      return res.status(500).json({
        ok: false,
        msg:
          'No se pudo enviar el mensaje'
      });

    }

  }
);


// ========================================================
// ENVIAR ARCHIVO
//
// POST
// /api/chat/conversations/:conversationId/files
//
// multipart/form-data
//
// file = archivo
// type = media | camera | voice | document
// ========================================================

router.post(
  '/conversations/:conversationId/files',

  upload.single('file'),

  async (req, res) => {

    const userId =
      req.vobixUser.id;


    const conversationId =
      cleanId(
        req.params.conversationId
      );


    if (!req.file) {

      return res.status(400).json({
        ok: false,
        msg:
          'No se recibió ningún archivo'
      });

    }


    if (!cloudinaryIsConfigured()) {

      return res.status(503).json({
        ok: false,
        msg:
          'El almacenamiento multimedia no está configurado'
      });

    }


    const messageType =
      getMessageType(
        req.file,
        req.body.type
      );


    let cloudinaryResult =
      null;


    try {

      const allowed =
        await userCanAccessConversation(
          conversationId,
          userId
        );


      if (!allowed) {

        return res.status(403).json({
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

        return res.status(403).json({
          ok: false,
          msg:
            'No se puede enviar el archivo'
        });

      }


      // ==================================================
      // SUBIR A CLOUDINARY
      // ==================================================

      cloudinaryResult =
        await uploadBufferToCloudinary(
          req.file,
          messageType
        );


      const fileUrl =
        cloudinaryResult.secure_url ||
        cloudinaryResult.url;


      if (!fileUrl) {

        throw new Error(
          'Cloudinary no devolvió URL'
        );

      }


      const fileName =
        cleanFileName(
          req.file.originalname
        );


      const fileMime =
        String(
          req.file.mimetype ||
          'application/octet-stream'
        )
          .trim()
          .slice(0, 255);


      const fileSize =
        Number(
          req.file.size || 0
        );


      const resourceType =
        String(
          cloudinaryResult.resource_type ||
          getCloudinaryResourceType(
            messageType
          )
        )
          .slice(0, 30);


      const duration =
        Number.isFinite(
          Number(
            cloudinaryResult.duration
          )
        )
          ? Number(
              cloudinaryResult.duration
            )
          : null;


      const width =
        Number.isFinite(
          Number(
            cloudinaryResult.width
          )
        )
          ? Number(
              cloudinaryResult.width
            )
          : null;


      const height =
        Number.isFinite(
          Number(
            cloudinaryResult.height
          )
        )
          ? Number(
              cloudinaryResult.height
            )
          : null;


      // ==================================================
      // CONTENIDO DESCRIPTIVO
      // ==================================================

      let content =
        'Archivo';


      if (
        messageType === 'image'
      ) {

        content =
          '📷 Foto';

      } else if (
        messageType === 'video'
      ) {

        content =
          '🎥 Vídeo';

      } else if (
        messageType === 'audio'
      ) {

        content =
          '🎤 Nota de voz';

      } else if (
        messageType === 'document'
      ) {

        content =
          '📎 ' +
          fileName;

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

            file_url,
            file_public_id,
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
            $4,

            $5,
            $6,
            $7,
            $8,
            $9,
            $10,

            $11,
            $12,
            $13,

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
            file_public_id,
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
            content,

            fileUrl,
            cloudinaryResult.public_id ||
              null,

            fileName,
            fileMime,
            fileSize,
            resourceType,

            duration,
            width,
            height
          ]
        );


      await database.query(
        `
        UPDATE conversations
        SET updated_at = NOW()
        WHERE id = $1
        `,
        [conversationId]
      );


      const message =
        normalizeMessage(
          result.rows[0],
          req.vobixUser.username ||
          null
        );


      emitMessage(
        req,
        conversationId,
        message
      );


      return res.json({
        ok: true,
        message
      });


    } catch (error) {

      console.error(
        'VOBIXCHAT FILE UPLOAD ERROR:',
        error
      );


      /*
        Si Cloudinary recibió el archivo pero
        PostgreSQL falló, eliminamos el archivo
        para no dejar basura huérfana.
      */

      if (
        cloudinaryResult &&
        cloudinaryResult.public_id
      ) {

        await destroyCloudinaryFile(
          cloudinaryResult.public_id,
          cloudinaryResult.resource_type
        );

      }


      return res.status(500).json({
        ok: false,
        msg:
          'No se pudo enviar el archivo'
      });

    }

  }
);


// ========================================================
// ERROR DE MULTER
// ========================================================

router.use(
  (
    error,
    req,
    res,
    next
  ) => {

    if (
      error instanceof
      multer.MulterError
    ) {

      if (
        error.code ===
        'LIMIT_FILE_SIZE'
      ) {

        return res.status(413).json({
          ok: false,
          msg:
            'El archivo supera el límite de 50 MB'
        });

      }


      return res.status(400).json({
        ok: false,
        msg:
          'No se pudo procesar el archivo'
      });

    }


    next(error);

  }
);


// ========================================================
// EXPORTAR
// ========================================================

module.exports = router;
