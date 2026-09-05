'use strict';

/*
==========================================================
 VOBIXCHAT
 routes/chat.js

 CHAT PRIVADO REAL 1X1

 REGLAS:
 - Una conversación privada tiene exactamente 2 usuarios.
 - Solamente esos 2 usuarios pueden leerla.
 - Solamente esos 2 usuarios pueden escribir.
 - Cambiar un conversationId en la URL NO da acceso.
 - Si A habla con B, C no puede entrar.
 - Se reutiliza la misma conversación A <-> B.
==========================================================
*/

const express = require('express');
const database = require('../database/db');
const originAttestation = require('../core/vobix-origin-attestation');
const childProtection = require('../core/vobix-child-protection');
const { matchesPersistedMessage } = require('../core/message-intent');
const { matchesUploadIntent, normalizeUploadId } = require('../core/upload-intent');

const router = express.Router();
const seniorAssistantRate = new Map();


/* ========================================================
   UTILIDADES
======================================================== */

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


function currentUserId(req) {

  if (
    !req.vobixUser ||
    !req.vobixUser.id
  ) {
    return null;
  }

  return cleanId(
    req.vobixUser.id
  );
}


/* ========================================================
   PROTEGER ROUTER

   server.js debe colocar req.vobixUser antes de llegar aquí.
======================================================== */

router.use((req, res, next) => {

  const userId =
    currentUserId(req);

  if (!userId) {

    return res
      .status(401)
      .json({
        ok: false,
        msg: 'Sesión no válida'
      });

  }

  next();

});


/* ========================================================
   CAPA 86 — TRADUCCIÓN SEGURA BAJO DEMANDA
======================================================== */

router.post('/translate', async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 2000);
  const sourceLanguage = String(req.body?.sourceLanguage || 'auto').trim().toLowerCase().slice(0, 20);
  const targetLanguage = String(req.body?.targetLanguage || 'es').trim().toLowerCase().slice(0, 20);
  const providerUrl = String(process.env.TRANSLATION_API_URL || '').trim();
  const providerKey = String(process.env.TRANSLATION_API_KEY || '').trim();

  if (!text || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$|^auto$/i.test(sourceLanguage) || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(targetLanguage)) {
    return res.status(400).json({ ok: false, msg: 'Solicitud de traducción no válida' });
  }
  if (!providerUrl) {
    return res.status(503).json({ ok: false, msg: 'El traductor del servidor todavía no está configurado' });
  }

  try {
    const providerResponse = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: sourceLanguage,
        target: targetLanguage,
        format: 'text',
        ...(providerKey ? { api_key: providerKey } : {})
      }),
      signal: AbortSignal.timeout(12000)
    });
    const data = await providerResponse.json().catch(() => null);
    const translatedText = String(data?.translatedText || data?.translation || '').trim();
    if (!providerResponse.ok || !translatedText) throw new Error('TRANSLATION_PROVIDER_FAILED');
    return res.json({
      ok: true,
      translatedText,
      sourceLanguage: String(data?.detectedLanguage?.language || data?.detectedLanguage || sourceLanguage),
      targetLanguage
    });
  } catch (error) {
    console.error('VOBIXCHAT TRANSLATION ERROR:', error.message);
    return res.status(502).json({ ok: false, msg: 'No se pudo completar la traducción' });
  }
});


/* ========================================================
   CAPA 101 — ASISTENTE SENIOR SEGURO Y OPCIONAL
======================================================== */

router.post('/assistant', async (req, res) => {
  const userId = currentUserId(req);
  const question = String(req.body?.question || '').trim().slice(0, 800);
  const language = String(req.body?.language || 'es-ES').trim().slice(0, 20);
  const providerUrl = String(process.env.VOBIX_AI_API_URL || '').trim();
  const providerKey = String(process.env.VOBIX_AI_API_KEY || '').trim();
  const providerModel = String(process.env.VOBIX_AI_MODEL || '').trim();

  if (!question) return res.status(400).json({ ok:false, msg:'Escriba una pregunta' });
  const exposesSecret = /\b(?:\d[ -]?){6,}\b/.test(question) ||
    /\b(?:mi|la|el)\s+(?:password|contrase(?:ñ|n)a|pin|otp|c[oó]digo)\s*(?:es|:)/i.test(question);
  if (exposesSecret) {
    return res.status(400).json({ ok:false, msg:'No incluya contraseñas, PIN, códigos ni datos bancarios' });
  }

  const now = Date.now();
  const attempts = (seniorAssistantRate.get(userId) || []).filter(at => now - at < 60000);
  if (attempts.length >= 20) return res.status(429).json({ ok:false, msg:'Espere un momento antes de volver a preguntar' });
  attempts.push(now);
  seniorAssistantRate.set(userId, attempts);

  if (!providerUrl || !providerKey || !providerModel) {
    return res.status(503).json({ ok:false, msg:'El motor IA todavía no está configurado' });
  }

  const systemInstruction = [
    'Eres el ayudante de accesibilidad de VobixChat para personas mayores.',
    'Responde en lenguaje sencillo, respetuoso y en un máximo de 120 palabras.',
    'Explica únicamente cómo usar VobixChat y su seguridad.',
    'Nunca solicites contraseñas, PIN, códigos, datos bancarios, documentos ni ubicación.',
    'No tomes decisiones sobre bloqueos, reclamaciones, pagos, denuncias ni asuntos legales; indica que requieren revisión humana.',
    'En una emergencia real, indica que use Ayuda / Emergencia y confirme la llamada al 112.',
    `Idioma preferido: ${language}.`
  ].join(' ');

  try {
    const providerResponse = await fetch(providerUrl, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${providerKey}`
      },
      body:JSON.stringify({
        model:providerModel,
        messages:[
          { role:'system', content:systemInstruction },
          { role:'user', content:question }
        ],
        temperature:0.2,
        max_tokens:220
      }),
      signal:AbortSignal.timeout(15000)
    });
    const data = await providerResponse.json().catch(() => null);
    const answer = String(
      data?.choices?.[0]?.message?.content ||
      data?.output_text ||
      data?.output?.[0]?.content?.[0]?.text ||
      ''
    ).trim().slice(0, 1800);
    if (!providerResponse.ok || !answer) throw new Error('AI_PROVIDER_FAILED');
    return res.json({ ok:true, answer });
  } catch (error) {
    console.error('VOBIXCHAT SENIOR ASSISTANT ERROR:', error.message);
    return res.status(502).json({ ok:false, msg:'El ayudante conectado no está disponible' });
  }
});


/* ========================================================
   COMPROBAR QUE UNA CONVERSACIÓN ES REALMENTE 1X1
======================================================== */

async function getPrivateConversation(
  conversationId
) {

  const result =
    await database.query(
      `
      SELECT
        c.id,
        c.created_at,
        c.updated_at,
        COUNT(cp.user_id)::int
          AS participant_count

      FROM conversations c

      INNER JOIN conversation_participants cp
        ON cp.conversation_id = c.id

      WHERE
        c.id = $1

      GROUP BY
        c.id,
        c.created_at,
        c.updated_at

      HAVING
        COUNT(cp.user_id) = 2

      LIMIT 1
      `,
      [
        conversationId
      ]
    );

  return (
    result.rows[0] ||
    null
  );

}


/* ========================================================
   COMPROBAR ACCESO

   IMPORTANTE:
   No confiamos en userId enviado por el navegador.

   El usuario autenticado viene de:
   req.vobixUser.id
======================================================== */

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
      SELECT
        cp.user_id

      FROM conversation_participants cp

      WHERE
        cp.conversation_id = $1
        AND cp.user_id = $2

        AND
        (
          SELECT COUNT(*)

          FROM conversation_participants check_cp

          WHERE
            check_cp.conversation_id =
              cp.conversation_id
        ) = 2

      LIMIT 1
      `,
      [
        conversationId,
        userId
      ]
    );


  return (
    result.rows.length === 1
  );

}


/* ========================================================
   OBTENER EL OTRO PARTICIPANTE
======================================================== */

async function getOtherParticipant(
  conversationId,
  userId
) {

  const result =
    await database.query(
      `
      SELECT
        u.id,
        u.username,
        u.vobix_id,
        u.avatar_url,
        u.bio,
        u.verified,
        u.online,
        u.last_seen

      FROM conversation_participants cp

      INNER JOIN users u
        ON u.id = cp.user_id

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
    result.rows[0] ||
    null
  );

}


/* ========================================================
   COMPROBAR BLOQUEO
======================================================== */

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
        userA,
        userB
      ]
    );


  return (
    result.rows.length > 0
  );

}


/* ========================================================
   SEGURIDAD CENTRAL DE UNA SALA 1X1
======================================================== */

async function validatePrivateRoom(
  conversationId,
  userId
) {

  const allowed =
    await canAccessConversation(
      conversationId,
      userId
    );


  if (!allowed) {

    return {
      ok: false,
      status: 403,
      msg:
        'No tienes acceso a esta conversación'
    };

  }


  const conversation =
    await getPrivateConversation(
      conversationId
    );


  if (!conversation) {

    return {
      ok: false,
      status: 403,
      msg:
        'Esta conversación no es una sala privada válida'
    };

  }


  const otherUser =
    await getOtherParticipant(
      conversationId,
      userId
    );


  if (!otherUser) {

    return {
      ok: false,
      status: 404,
      msg:
        'No se encontró al otro participante'
    };

  }


  return {
    ok: true,
    conversation,
    otherUser
  };

}


/* ========================================================
   BUSCAR USUARIOS
======================================================== */

async function searchUsersHandler(
  req,
  res
) {

  const userId =
    currentUserId(req);

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
              AND
              vobix_id IS NOT NULL
              AND
              LOWER(vobix_id)
                LIKE LOWER($2)
            )
          )

        ORDER BY
          CASE
            WHEN
              LOWER(username) =
              LOWER($3)
            THEN 0
            ELSE 1
          END,

          username ASC

        LIMIT 30
        `,
        [
          userId,
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
      'VOBIXCHAT SEARCH ERROR:',
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


/*
  Alias para versiones anteriores
  de inbox.html.
*/

router.get(
  '/search',
  searchUsersHandler
);


/* ========================================================
   LISTAR CONTACTOS
======================================================== */

router.get(
  '/contacts',
  async (req, res) => {

    const userId =
      currentUserId(req);


    try {

      const result =
        await database.query(
          `
          SELECT
            u.id,
            u.username,
            u.vobix_id,
            u.avatar_url,
            u.bio,
            u.verified,
            u.online,
            u.last_seen,

            c.alias,

            c.is_favorite,

            c.created_at
              AS contact_created_at

          FROM contacts c

          INNER JOIN users u
            ON
              u.id =
              c.contact_user_id

          WHERE
            c.owner_user_id = $1

          ORDER BY
            c.is_favorite DESC,
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
        'VOBIXCHAT CONTACTS ERROR:',
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


/* ========================================================
   CAPA 3.1 — MARCAR O QUITAR FAVORITO
======================================================== */

router.patch(
  '/contacts/:userId/favorite',
  async (req, res) => {
    const ownerUserId = currentUserId(req);
    const contactUserId = cleanId(req.params.userId);
    const favorite = Boolean(req.body?.favorite);

    if (!contactUserId) {
      return res.status(400).json({ ok:false, msg:'Contacto no válido' });
    }

    try {
      const result = await database.query(
        `
        UPDATE contacts
        SET is_favorite = $3
        WHERE owner_user_id = $1
          AND contact_user_id = $2
        RETURNING contact_user_id, is_favorite
        `,
        [ownerUserId, contactUserId, favorite]
      );

      if (!result.rows[0]) {
        return res.status(404).json({ ok:false, msg:'Contacto no encontrado en tu agenda' });
      }

      return res.json({ ok:true, favorite:result.rows[0].is_favorite });
    } catch (error) {
      console.error('VOBIXCHAT FAVORITE CONTACT ERROR:', error);
      return res.status(500).json({ ok:false, msg:'No se pudo guardar el favorito' });
    }
  }
);


/* ========================================================
   AGREGAR CONTACTO
======================================================== */

router.post(
  '/contacts',
  async (req, res) => {

    const ownerUserId =
      currentUserId(req);


    const contactUserId =
      cleanId(
        req.body.userId ||
        req.body.contactUserId ||
        req.body.contact_user_id
      );


    const alias =
      String(
        req.body.alias ||
        ''
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
        `,
        [
          ownerUserId,
          contactUserId,
          alias
        ]
      );


      return res.json({
        ok: true,
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


/* ========================================================
   ELIMINAR CONTACTO
======================================================== */

router.delete(
  '/contacts/:userId',
  async (req, res) => {

    const ownerUserId =
      currentUserId(req);

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
          AND
          contact_user_id = $2
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
/* ========================================================
   BLOQUE 2 DE 4

   CONVERSACIONES PRIVADAS 1X1

   REGLAS DE SEGURIDAD:

   - Una sala privada pertenece exactamente a 2 usuarios.
   - A + B reutilizan siempre la misma sala.
   - Un tercer usuario no puede entrar.
   - No confiamos en IDs de usuario enviados por frontend.
   - El usuario actual siempre sale de req.vobixUser.id.
======================================================== */


/* ========================================================
   COMPROBAR SI YA EXISTE UNA SALA PRIVADA
   ENTRE DOS USUARIOS

   IMPORTANTE:

   La consulta exige:
   - usuario A dentro
   - usuario B dentro
   - exactamente 2 participantes

   Por tanto una conversación grupal nunca puede
   confundirse con una conversación privada.
======================================================== */

async function findPrivateConversation(
  userA,
  userB
) {

  const result =
    await database.query(
      `
      SELECT
        c.id,
        c.created_at,
        c.updated_at

      FROM conversations c

      INNER JOIN conversation_participants cp_a
        ON
          cp_a.conversation_id = c.id
          AND cp_a.user_id = $1

      INNER JOIN conversation_participants cp_b
        ON
          cp_b.conversation_id = c.id
          AND cp_b.user_id = $2

      WHERE
        (
          SELECT COUNT(*)

          FROM conversation_participants cp_count

          WHERE
            cp_count.conversation_id = c.id
        ) = 2

      ORDER BY
        c.updated_at DESC NULLS LAST,
        c.created_at DESC

      LIMIT 1
      `,
      [
        userA,
        userB
      ]
    );


  return (
    result.rows[0] ||
    null
  );

}


/* ========================================================
   OBTENER DATOS DE UN USUARIO DESTINO
======================================================== */

async function getChatUser(
  userId
) {

  const result =
    await database.query(
      `
      SELECT
        id,
        username,
        vobix_id,
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


  return (
    result.rows[0] ||
    null
  );

}


/* ========================================================
   FORMATEAR CONVERSACIÓN PARA FRONTEND
======================================================== */

function normalizeConversation(
  conversation,
  otherUser
) {

  return {

    id:
      conversation.id,

    conversationId:
      conversation.id,

    conversation_id:
      conversation.id,

    createdAt:
      conversation.created_at,

    created_at:
      conversation.created_at,

    updatedAt:
      conversation.updated_at,

    updated_at:
      conversation.updated_at,

    otherUserId:
      otherUser
        ? otherUser.id
        : null,

    other_user_id:
      otherUser
        ? otherUser.id
        : null,

    otherUsername:
      otherUser
        ? otherUser.username
        : null,

    other_username:
      otherUser
        ? otherUser.username
        : null,

    otherVobixId:
      otherUser
        ? otherUser.vobix_id
        : null,

    other_vobix_id:
      otherUser
        ? otherUser.vobix_id
        : null,

    otherAvatarUrl:
      otherUser
        ? otherUser.avatar_url
        : null,

    other_avatar_url:
      otherUser
        ? otherUser.avatar_url
        : null,

    online:
      otherUser
        ? Boolean(otherUser.online)
        : false,

    lastSeen:
      otherUser
        ? otherUser.last_seen
        : null,

    last_seen:
      otherUser
        ? otherUser.last_seen
        : null

  };

}


/* ========================================================
   CREAR / RECUPERAR CONVERSACIÓN PRIVADA 1X1

   POST /api/chat/conversations

   BODY:
   {
     userId: "ID_DEL_OTRO_USUARIO"
   }

   También acepta:
   otherUserId
   other_user_id
======================================================== */

router.post(
  '/conversations',
  async (req, res) => {

    const userId =
      currentUserId(req);


    const otherUserId =
      cleanId(
        req.body.userId ||
        req.body.otherUserId ||
        req.body.other_user_id
      );


    /* ----------------------------------------------------
       VALIDAR DESTINO
    ---------------------------------------------------- */

    if (!otherUserId) {

      return res
        .status(400)
        .json({
          ok: false,
          msg:
            'Usuario no válido'
        });

    }


    /* ----------------------------------------------------
       NO PERMITIR CHAT CONSIGO MISMO
    ---------------------------------------------------- */

    if (
      String(userId) ===
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

      /* ==================================================
         COMPROBAR QUE EL DESTINATARIO EXISTE
      ================================================== */

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


      /* ==================================================
         COMPROBAR BLOQUEOS ENTRE A Y B
      ================================================== */

      const blocked =
        await usersAreBlocked(
          userId,
          otherUserId
        );


      if (blocked) {

        return res
          .status(403)
          .json({
            ok: false,
            msg:
              'No se puede iniciar esta conversación'
          });

      }


      const childPolicy =
        await childProtection.communicationDecision(
          database,
          userId,
          otherUserId
        );


      if (!childPolicy.allowed) {

        return res
          .status(403)
          .json({
            ok: false,
            msg:
              'Contacto no autorizado por la protección familiar'
          });

      }


      /* ==================================================
         BUSCAR SALA EXISTENTE

         A <-> B debe volver siempre a la misma sala.
      ================================================== */

      const existingConversation =
        await findPrivateConversation(
          userId,
          otherUserId
        );


      if (existingConversation) {

        return res.json({

          ok: true,

          created: false,

          conversation:
            normalizeConversation(
              existingConversation,
              otherUser
            )

        });

      }


      /* ==================================================
         NO EXISTE.

         CREAR SALA EN UNA TRANSACCIÓN.
      ================================================== */

      const client =
        await database.pool.connect();


      try {

        await client.query(
          'BEGIN'
        );


        /* -----------------------------------------------
           VOLVER A COMPROBAR DENTRO DE LA TRANSACCIÓN

           Reduce la posibilidad de duplicados si ambos
           clientes intentan abrir la sala casi a la vez.
        ----------------------------------------------- */

        const existingInsideTransaction =
          await client.query(
            `
            SELECT
              c.id,
              c.created_at,
              c.updated_at

            FROM conversations c

            INNER JOIN conversation_participants cp_a
              ON
                cp_a.conversation_id = c.id
                AND cp_a.user_id = $1

            INNER JOIN conversation_participants cp_b
              ON
                cp_b.conversation_id = c.id
                AND cp_b.user_id = $2

            WHERE
              (
                SELECT COUNT(*)

                FROM conversation_participants cp_count

                WHERE
                  cp_count.conversation_id = c.id
              ) = 2

            ORDER BY
              c.updated_at DESC NULLS LAST,
              c.created_at DESC

            LIMIT 1

            FOR UPDATE OF c
            `,
            [
              userId,
              otherUserId
            ]
          );


        if (
          existingInsideTransaction
            .rows.length > 0
        ) {

          await client.query(
            'COMMIT'
          );


          const conversation =
            existingInsideTransaction
              .rows[0];


          return res.json({

            ok: true,

            created: false,

            conversation:
              normalizeConversation(
                conversation,
                otherUser
              )

          });

        }


        /* -----------------------------------------------
           CREAR CONVERSACIÓN
        ----------------------------------------------- */

        const createdResult =
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
          createdResult.rows[0];


        /* -----------------------------------------------
           INSERTAR EXACTAMENTE LOS DOS PARTICIPANTES
        ----------------------------------------------- */

        await client.query(
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
          `,
          [
            conversation.id,
            userId,
            otherUserId
          ]
        );


        /* -----------------------------------------------
           COMPROBACIÓN FINAL DE SEGURIDAD

           Antes del COMMIT verificamos que la sala
           realmente tenga exactamente 2 participantes.
        ----------------------------------------------- */

        const participantCheck =
          await client.query(
            `
            SELECT
              COUNT(*)::int
                AS participant_count

            FROM conversation_participants

            WHERE
              conversation_id = $1
            `,
            [
              conversation.id
            ]
          );


        const participantCount =
          Number(
            participantCheck
              .rows[0]
              .participant_count
          );


        if (
          participantCount !== 2
        ) {

          throw new Error(
            'VOBIXCHAT_PRIVATE_ROOM_INVALID_PARTICIPANT_COUNT'
          );

        }


        await client.query(
          'COMMIT'
        );


        return res.json({

          ok: true,

          created: true,

          conversation:
            normalizeConversation(
              conversation,
              otherUser
            )

        });


      } catch (error) {

        try {

          await client.query(
            'ROLLBACK'
          );

        } catch (
          rollbackError
        ) {

          console.error(
            'VOBIXCHAT ROLLBACK ERROR:',
            rollbackError
          );

        }


        throw error;


      } finally {

        client.release();

      }


    } catch (error) {

      console.error(
        'VOBIXCHAT CREATE PRIVATE CONVERSATION ERROR:',
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


/* ========================================================
   PREVIEW DEL ÚLTIMO MENSAJE
======================================================== */

function conversationPreview(
  messageType,
  content
) {

  const type =
    String(
      messageType ||
      ''
    )
      .trim()
      .toLowerCase();


  if (
    type === 'image' ||
    type === 'photo'
  ) {

    return '📷 Foto';

  }


  if (
    type === 'video'
  ) {

    return '🎥 Vídeo';

  }


  if (
    type === 'audio' ||
    type === 'voice'
  ) {

    return '🎙️ Nota de voz';

  }


  if (
    type === 'document' ||
    type === 'file'
  ) {

    return '📎 Documento';

  }


  const text =
    String(
      content ||
      ''
    ).trim();


  return (
    text ||
    'Conversación privada'
  );

}


/* ========================================================
   LISTAR HISTORIAL DE CONVERSACIONES

   GET /api/chat/conversations

   MUY IMPORTANTE:

   Solamente devuelve conversaciones donde
   req.vobixUser.id ES participante.

   Además exige exactamente 2 participantes.
======================================================== */

router.get(
  '/conversations',
  async (req, res) => {

    const userId =
      currentUserId(req);


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

            other_user.avatar_url
              AS other_avatar_url,

            other_user.online
              AS other_online,

            other_user.last_seen
              AS other_last_seen,

            last_message.id
              AS last_message_id,

            last_message.sender_user_id
              AS last_message_sender_user_id,

            last_message.message_type
              AS last_message_type,

            last_message.content
              AS last_message_content,

            last_message.created_at
              AS last_message_created_at


          FROM conversations c


          /* ---------------------------------------------
             EL USUARIO AUTENTICADO TIENE QUE ESTAR DENTRO
          --------------------------------------------- */

          INNER JOIN conversation_participants me
            ON
              me.conversation_id = c.id
              AND
              me.user_id = $1


          /* ---------------------------------------------
             EXACTAMENTE DOS PARTICIPANTES
          --------------------------------------------- */

          INNER JOIN LATERAL
          (
            SELECT
              COUNT(*)::int
                AS participant_count

            FROM conversation_participants count_cp

            WHERE
              count_cp.conversation_id = c.id
          )
          AS room_count
          ON
            room_count.participant_count = 2


          /* ---------------------------------------------
             OBTENER EL OTRO USUARIO
          --------------------------------------------- */

          INNER JOIN LATERAL
          (
            SELECT
              u.id,
              u.username,
              u.vobix_id,
              u.avatar_url,
              u.online,
              u.last_seen

            FROM conversation_participants cp

            INNER JOIN users u
              ON
                u.id = cp.user_id

            WHERE
              cp.conversation_id = c.id
              AND
              cp.user_id <> $1

            LIMIT 1
          )
          AS other_user
          ON TRUE


          /* ---------------------------------------------
             ÚLTIMO MENSAJE NO ELIMINADO
          --------------------------------------------- */

          LEFT JOIN LATERAL
          (
            SELECT
              m.id,
              m.sender_user_id,
              m.message_type,
              m.content,
              m.created_at

            FROM messages m

            WHERE
              m.conversation_id = c.id

              AND
              COALESCE(
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

            const preview =
              conversationPreview(
                row.last_message_type,
                row.last_message_content
              );


            return {

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


              /* -----------------------------------------
                 OTRO PARTICIPANTE
              ----------------------------------------- */

              otherUserId:
                row.other_user_id,

              other_user_id:
                row.other_user_id,

              otherUsername:
                row.other_username,

              other_username:
                row.other_username,

              otherVobixId:
                row.other_vobix_id,

              other_vobix_id:
                row.other_vobix_id,

              otherAvatarUrl:
                row.other_avatar_url,

              other_avatar_url:
                row.other_avatar_url,

              online:
                Boolean(
                  row.other_online
                ),

              lastSeen:
                row.other_last_seen,

              last_seen:
                row.other_last_seen,


              /* -----------------------------------------
                 ÚLTIMO MENSAJE
              ----------------------------------------- */

              lastMessageId:
                row.last_message_id,

              last_message_id:
                row.last_message_id,

              lastMessageSenderId:
                row.last_message_sender_user_id,

              last_message_sender_user_id:
                row.last_message_sender_user_id,

              lastMessageType:
                row.last_message_type,

              last_message_type:
                row.last_message_type,

              lastMessage:
                preview,

              last_message:
                preview,

              lastMessageCreatedAt:
                row.last_message_created_at,

              last_message_created_at:
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


/* ========================================================
   OBTENER UNA CONVERSACIÓN CONCRETA

   GET /api/chat/conversations/:conversationId

   Esto permite que chat.html pueda validar la sala
   antes de mostrarla.
======================================================== */

router.get(
  '/conversations/:conversationId',
  async (req, res) => {

    const userId =
      currentUserId(req);


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

      const room =
        await validatePrivateRoom(
          conversationId,
          userId
        );


      if (!room.ok) {

        return res
          .status(room.status)
          .json({
            ok: false,
            msg:
              room.msg
          });

      }


      return res.json({

        ok: true,

        conversation:
          normalizeConversation(
            room.conversation,
            room.otherUser
          )

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


/* ========================================================
   BLOQUEAR USUARIO
======================================================== */

router.post(
  '/blocks',
  async (req, res) => {

    const userId =
      currentUserId(req);


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
      String(userId) ===
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

      const otherUser =
        await getChatUser(
          blockedUserId
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
          userId,
          blockedUserId
        ]
      );


      return res.json({
        ok: true
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


/* ========================================================
   DESBLOQUEAR USUARIO
======================================================== */

router.delete(
  '/blocks/:userId',
  async (req, res) => {

    const userId =
      currentUserId(req);


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
          AND
          blocked_user_id = $2
        `,
        [
          userId,
          blockedUserId
        ]
      );


      return res.json({
        ok: true
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


/* ========================================================
   FIN BLOQUE 2 DE 4

   NO PONGAS module.exports TODAVÍA.

   EL BLOQUE 3 EMPIEZA CON:
   - normalización de mensajes
   - cargar mensajes
   - enviar mensajes
   - protección A <-> B en cada petición
======================================================== */
/* ========================================================
   TIEMPO REAL + PUSH DESDE RUTAS HTTP
======================================================== */

async function notifyPrivateConversation(req, room, message) {
  try {
    const io = req.app && req.app.get('io');
    const conversationId = cleanId(message?.conversationId || message?.conversation_id);

    if (io && conversationId) {
      const payload = { conversationId, message };

      io.to(`conversation:${conversationId}`)
        .emit('conversation-message', payload);

      // Alias temporal para el frontend histórico mientras cerramos la migración.
      io.to(`conversation:${conversationId}`)
        .emit('chat:message', message);

      io.to(`user:${String(room.otherUser.id)}`)
        .emit('conversation:new-message', payload);

      io.to(`user:${String(currentUserId(req))}`)
        .emit('conversation:new-message', payload);
    }

    const sendPush = req.app && req.app.get('sendPushToUser');
    if (typeof sendPush === 'function' && room?.otherUser?.id) {
      const messageType = message?.messageType || message?.message_type || 'text';
      const rawText = String(message?.content || message?.message || '');
      const body = messageType === 'text'
        ? (rawText.startsWith('VOBIX-E2E-1:') ? '🔒 Mensaje cifrado' : rawText.slice(0, 180) || 'Nuevo mensaje')
        : conversationPreview(messageType, message?.content);

      await sendPush(room.otherUser.id, {
        type: 'message',
        title: req.vobixUser?.username || 'VOBIXCHAT',
        body,
        conversationId,
        fromUserId: currentUserId(req),
        senderUsername: req.vobixUser?.username || 'VOBIXCHAT',
        messageType,
        url: `/chat.html?conversationId=${encodeURIComponent(conversationId)}&userId=${encodeURIComponent(currentUserId(req))}`
      });
    }
  } catch (error) {
    // El mensaje ya está guardado. Un fallo de realtime/push no debe deshacerlo.
    console.error('VOBIXCHAT NOTIFY ERROR:', error.message);
  }
}

function emitMessageMutation(req, conversationId, eventName, payload) {
  const io = req.app && req.app.get('io');
  const roomId = cleanId(conversationId);
  if (!io || !roomId) return;
  io.to(`conversation:${roomId}`).emit(`chat:message:${eventName}`, payload);
  io.to(`conversation:${roomId}`).emit(`message:${eventName}`, payload);
}

/* ========================================================
   BLOQUE 3 DE 4

   MENSAJES PRIVADOS VOBIXCHAT 1X1

   SEGURIDAD:
   - Solo los 2 participantes pueden leer mensajes.
   - Solo los 2 participantes pueden enviar mensajes.
   - Manipular conversationId NO concede acceso.
   - El remitente sale de req.vobixUser.id.
======================================================== */


/* ========================================================
   NORMALIZAR TIPO DE MENSAJE
======================================================== */

function normalizeMessageType(value) {

  const type =
    String(
      value ||
      'text'
    )
      .trim()
      .toLowerCase();


  const allowed =
    new Set([
      'text',
      'image',
      'photo',
      'video',
      'audio',
      'voice',
      'document',
      'file'
    ]);


  if (
    !allowed.has(type)
  ) {

    return 'text';

  }


  return type;

}


/* ========================================================
   NORMALIZAR MENSAJE PARA FRONTEND
======================================================== */

function normalizeMessage(
  row,
  currentUserIdValue
) {

  const senderId =
    cleanId(
      row.sender_user_id
    );


  return {

    id:
      row.id,

    conversationId:
      row.conversation_id,

    conversation_id:
      row.conversation_id,

    senderUserId:
      senderId,

    sender_user_id:
      senderId,

    content:
      row.content || '',

    message:
      row.content || '',

    messageType:
      row.message_type || 'text',

    message_type:
      row.message_type || 'text',

    type:
      row.message_type || 'text',

    clientMessageId:
      row.client_message_id || null,

    client_message_id:
      row.client_message_id || null,

    fileUrl:
      row.file_url || null,

    file_url:
      row.file_url || null,

    fileName:
      row.file_name || null,

    file_name:
      row.file_name || null,

    mimeType:
      row.mime_type || null,

    mime_type:
      row.mime_type || null,

    viewOnce:
      Boolean(row.view_once),

    view_once:
      Boolean(row.view_once),

    originSeal: row.origin_sha256 ? {
      algorithm: 'SHA-256',
      sha256: row.origin_sha256,
      source: row.origin_source || 'vobix-upload',
      sealedAt: row.origin_sealed_at || null,
      verified: true,
      userVerified: row.origin_user_verified === true,
      deviceRecognized: row.origin_device_recognized === true,
      locationShared: row.origin_location_shared === true,
      capturedAt: row.origin_capture_at || null,
      attested: Boolean(row.origin_attestation_hmac)
    } : null,

    deliveredAt:
      row.delivered_at || null,

    delivered_at:
      row.delivered_at || null,

    readAt:
      row.read_at || null,

    read_at:
      row.read_at || null,

    createdAt:
      row.created_at,

    created_at:
      row.created_at,

    updatedAt:
      row.updated_at || null,

    updated_at:
      row.updated_at || null,

    edited:
      Boolean(
        row.edited
      ),

    deleted:
      Boolean(
        row.deleted
      ),

    reactionCounts:
      row.reaction_counts || {},

    reaction_counts:
      row.reaction_counts || {},

    myReaction:
      row.my_reaction || '',

    my_reaction:
      row.my_reaction || '',

    mine:
      String(senderId) ===
      String(currentUserIdValue)

  };

}


/* ========================================================
   CARGAR MENSAJES DE UNA CONVERSACIÓN

   GET:
   /api/chat/conversations/:conversationId/messages

   También soportaremos alias:
   /api/chat/messages/:conversationId
======================================================== */

async function getMessagesHandler(
  req,
  res
) {

  const userId =
    currentUserId(req);


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

    // CAPA 4.6.2 — Al consultar la sala, ocultamos para ambos los mensajes
    // cuya caducidad ya venció. No toca mensajes sin fecha de expiración.
    await database.query(
      `
      UPDATE messages
      SET deleted = TRUE, updated_at = NOW()
      WHERE conversation_id = $1
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
        AND COALESCE(deleted, FALSE) = FALSE
      `,
      [conversationId]
    );

    /* ==================================================
       VALIDACIÓN PRIVADA 1X1

       Aunque alguien escriba manualmente otro ID
       en la URL, no podrá leer esa conversación.
    ================================================== */

    const room =
      await validatePrivateRoom(
        conversationId,
        userId
      );


    if (!room.ok) {

      return res
        .status(room.status)
        .json({
          ok: false,
          msg:
            room.msg
        });

    }


    /* ==================================================
       PAGINACIÓN
    ================================================== */

    const requestedLimit =
      Number(
        req.query.limit ||
        50
      );


    const limit =
      Math.min(
        Math.max(
          Number.isFinite(
            requestedLimit
          )
            ? requestedLimit
            : 50,
          1
        ),
        100
      );


    const before =
      cleanId(
        req.query.before
      );


    let result;


    if (before) {

      result =
        await database.query(
          `
          SELECT
            m.id,
            m.conversation_id,
            m.sender_user_id,
            m.content,
            m.message_type,
            m.client_message_id,
            (SELECT mr.delivered_at FROM message_receipts mr
             WHERE mr.message_id=m.id AND mr.user_id<>m.sender_user_id LIMIT 1) AS delivered_at,
            (SELECT mr.read_at FROM message_receipts mr
             WHERE mr.message_id=m.id AND mr.user_id<>m.sender_user_id LIMIT 1) AS read_at,
            m.file_url,
            m.file_name,
            m.mime_type,
            m.origin_sha256,
            m.origin_source,
            m.origin_sealed_at,
            m.origin_user_verified,
            m.origin_device_recognized,
            m.origin_location_shared,
            m.origin_capture_at,
            m.origin_attestation_hmac,
            m.created_at,
            m.updated_at,
            m.edited,
            m.deleted,
            COALESCE((
              SELECT jsonb_object_agg(grouped.emoji, grouped.total)
              FROM (
                SELECT emoji, COUNT(*)::int AS total
                FROM message_reactions
                WHERE message_id = m.id
                GROUP BY emoji
              ) grouped
            ), '{}'::jsonb) AS reaction_counts,
            (SELECT emoji FROM message_reactions
             WHERE message_id = m.id AND user_id = $4 LIMIT 1) AS my_reaction

          FROM messages m

          WHERE
            m.conversation_id = $1

            AND
            m.id < $2

            AND
            COALESCE(
              m.deleted,
              FALSE
            ) = FALSE

            AND NOT EXISTS (
              SELECT 1 FROM message_hidden_users hidden
              WHERE hidden.message_id = m.id AND hidden.user_id = $4
            )

          ORDER BY
            m.created_at DESC,
            m.id DESC

          LIMIT $3
          `,
          [
            conversationId,
            before,
            limit,
            userId
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
            m.content,
            m.message_type,
            m.client_message_id,
            (SELECT mr.delivered_at FROM message_receipts mr
             WHERE mr.message_id=m.id AND mr.user_id<>m.sender_user_id LIMIT 1) AS delivered_at,
            (SELECT mr.read_at FROM message_receipts mr
             WHERE mr.message_id=m.id AND mr.user_id<>m.sender_user_id LIMIT 1) AS read_at,
            m.file_url,
            m.file_name,
            m.mime_type,
            m.origin_sha256,
            m.origin_source,
            m.origin_sealed_at,
            m.origin_user_verified,
            m.origin_device_recognized,
            m.origin_location_shared,
            m.origin_capture_at,
            m.origin_attestation_hmac,
            m.created_at,
            m.updated_at,
            m.edited,
            m.deleted,
            COALESCE((
              SELECT jsonb_object_agg(grouped.emoji, grouped.total)
              FROM (
                SELECT emoji, COUNT(*)::int AS total
                FROM message_reactions
                WHERE message_id = m.id
                GROUP BY emoji
              ) grouped
            ), '{}'::jsonb) AS reaction_counts,
            (SELECT emoji FROM message_reactions
             WHERE message_id = m.id AND user_id = $3 LIMIT 1) AS my_reaction

          FROM messages m

          WHERE
            m.conversation_id = $1

            AND
            COALESCE(
              m.deleted,
              FALSE
            ) = FALSE

            AND NOT EXISTS (
              SELECT 1 FROM message_hidden_users hidden
              WHERE hidden.message_id = m.id AND hidden.user_id = $3
            )

          ORDER BY
            m.created_at DESC,
            m.id DESC

          LIMIT $2
          `,
          [
            conversationId,
            limit,
            userId
          ]
        );

    }


    /*
      La base devuelve los más recientes primero
      para que LIMIT sea eficiente.

      Al frontend los entregamos en orden natural:
      antiguo -> nuevo.
    */

    const rows =
      result.rows.reverse();


    const messages =
      rows.map(
        row =>
          normalizeMessage(
            row,
            userId
          )
      );


    return res.json({

      ok: true,

      conversationId,

      conversation_id:
        conversationId,

      otherUser:
        room.otherUser,

      messages,

      hasMore:
        result.rows.length === limit

    });


  } catch (error) {

    console.error(
      'VOBIXCHAT GET MESSAGES ERROR:',
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


router.get(
  '/conversations/:conversationId/messages',
  getMessagesHandler
);


router.get(
  '/messages/:conversationId',
  getMessagesHandler
);


// CAPA 4.6.1 — Solo afecta mensajes creados después de guardar el ajuste.
router.post('/conversations/:conversationId/disappearing', async (req, res) => {
  const userId = currentUserId(req);
  const conversationId = cleanId(req.params.conversationId);
  const seconds = Number(req.body?.seconds || 0);
  const allowed = new Set([0, 86400, 604800, 2592000, 7776000]);
  if (!conversationId || !allowed.has(seconds)) {
    return res.status(400).json({ ok:false, msg:'Duración temporal no válida' });
  }
  try {
    const room = await validatePrivateRoom(conversationId, userId);
    if (!room.ok) return res.status(room.status).json({ ok:false, msg:room.msg });
    await database.query(
      'UPDATE conversations SET disappearing_seconds=$2, updated_at=NOW() WHERE id=$1',
      [conversationId, seconds]
    );
    return res.json({ ok:true, seconds });
  } catch (error) {
    console.error('VOBIXCHAT DISAPPEARING SETTING ERROR:', error);
    return res.status(500).json({ ok:false, msg:'No se pudo guardar la duración temporal' });
  }
});


// CAPA 2.6.2 — El destinatario consume un archivo de una sola vista una vez.
router.post('/messages/:messageId/consume-view-once', async (req, res) => {
  const userId = currentUserId(req);
  const messageId = cleanId(req.params.messageId);
  if (!messageId) return res.status(400).json({ ok:false, msg:'Mensaje no válido' });
  try {
    const found = await database.query(
      'SELECT id, conversation_id, sender_user_id, view_once, viewed_at, deleted FROM messages WHERE id=$1 LIMIT 1',
      [messageId]
    );
    const message = found.rows[0];
    if (!message) return res.status(404).json({ ok:false, msg:'Contenido no encontrado' });
    const room = await validatePrivateRoom(message.conversation_id, userId);
    if (!room.ok) return res.status(room.status).json({ ok:false, msg:room.msg });
    if (!message.view_once || String(message.sender_user_id) === String(userId)) {
      return res.status(403).json({ ok:false, msg:'Este contenido no se puede consumir así' });
    }
    const used = await database.query(
      `UPDATE messages SET viewed_at=NOW(), deleted=TRUE, updated_at=NOW()
       WHERE id=$1 AND viewed_at IS NULL AND COALESCE(deleted,FALSE)=FALSE
       RETURNING id`,
      [messageId]
    );
    if (!used.rows[0]) return res.status(410).json({ ok:false, msg:'Este contenido ya fue abierto' });
    return res.json({ ok:true, consumed:true });
  } catch (error) {
    console.error('VOBIXCHAT VIEW ONCE ERROR:', error);
    return res.status(500).json({ ok:false, msg:'No se pudo abrir el contenido' });
  }
});

// Vacía una conversación para todos sus participantes. La interfaz pide
// confirmación antes de llamar a esta ruta.
router.delete('/conversations/:conversationId/messages', async (req, res) => {
  const userId = currentUserId(req);
  const conversationId = cleanId(req.params.conversationId);
  try {
    const room = await validatePrivateRoom(conversationId, userId);
    if (!room.ok) return res.status(room.status).json({ ok:false, msg:room.msg });
    const result = await database.query(
      `UPDATE messages SET deleted=TRUE, updated_at=NOW() WHERE conversation_id=$1 AND COALESCE(deleted,FALSE)=FALSE`,
      [conversationId]
    );
    return res.json({ ok:true, cleared:result.rowCount || 0 });
  } catch (error) {
    console.error('VOBIXCHAT CLEAR CHAT ERROR:', error);
    return res.status(500).json({ ok:false, msg:'No se pudo vaciar el chat' });
  }
});


/* ========================================================
   ENVIAR MENSAJE DE TEXTO

   POST:
   /api/chat/conversations/:conversationId/messages

   BODY:
   {
     content: "Hola"
   }

   IMPORTANTE:
   sender_user_id NO viene del navegador.
   Siempre usamos req.vobixUser.id.
======================================================== */

async function sendMessageHandler(
  req,
  res
) {

  const userId =
    currentUserId(req);


  const conversationId =
    cleanId(
      req.params.conversationId ||
      req.body.conversationId ||
      req.body.conversation_id
    );


  const messageType =
    normalizeMessageType(
      req.body.messageType ||
      req.body.message_type ||
      'text'
    );


  const content =
    cleanMessage(
      req.body.content ||
      req.body.message ||
      req.body.text
    );

  const rawClientMessageId = String(
    req.body.clientMessageId ||
    req.body.client_message_id ||
    ''
  ).trim();

  const clientMessageId = /^[A-Za-z0-9_-]{8,100}$/.test(rawClientMessageId)
    ? rawClientMessageId
    : null;


  /* ======================================================
     VALIDACIONES BÁSICAS
  ====================================================== */

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
    messageType === 'text' &&
    !content
  ) {

    return res
      .status(400)
      .json({
        ok: false,
        msg:
          'Escribe un mensaje'
      });

  }


  if (!clientMessageId) {

    return res
      .status(400)
      .json({
        ok: false,
        code:
          'client_message_id_required',
        msg:
          'El mensaje necesita un identificador seguro'
      });

  }


  try {

    /* ==================================================
       VERIFICAR QUE EL REMITENTE PERTENECE A ESTA SALA
    ================================================== */

    const room =
      await validatePrivateRoom(
        conversationId,
        userId
      );


    if (!room.ok) {

      return res
        .status(room.status)
        .json({
          ok: false,
          msg:
            room.msg
        });

    }


    /* ==================================================
       COMPROBAR BLOQUEOS

       Si cualquiera de los dos bloqueó al otro,
       no permitimos nuevos mensajes.
    ================================================== */

    const blocked =
      await usersAreBlocked(
        userId,
        room.otherUser.id
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

    const childPolicy = await childProtection.communicationDecision(database,userId,room.otherUser.id);
    if (!childPolicy.allowed) return res.status(403).json({ok:false,msg:childPolicy.reason==='outside_schedule'
      ? 'La comunicación no está disponible en este horario' : 'Este contacto no está autorizado'});


    /* ==================================================
       INSERTAR MENSAJE
    ================================================== */

    const result =
      await database.query(
        `
        INSERT INTO messages
        (
          conversation_id,
          sender_user_id,
          content,
          message_type,
          client_message_id,
          created_at,
          updated_at,
          edited,
          deleted,
          expires_at
        )

        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          NOW(),
          NOW(),
          FALSE,
          FALSE,
          CASE
            WHEN COALESCE((SELECT disappearing_seconds FROM conversations WHERE id = $1), 0) > 0
            THEN NOW() + (SELECT disappearing_seconds * INTERVAL '1 second' FROM conversations WHERE id = $1)
            ELSE NULL
          END
        )

        ON CONFLICT (sender_user_id, client_message_id)
        WHERE client_message_id IS NOT NULL
        DO UPDATE SET client_message_id = EXCLUDED.client_message_id

        RETURNING
          id,
          conversation_id,
          sender_user_id,
          content,
          message_type,
          client_message_id,
          file_url,
          file_name,
          mime_type,
          created_at,
          updated_at,
          edited,
          deleted,
          expires_at,
          (xmax = 0) AS inserted
        `,
        [
          conversationId,
          userId,
          content,
          messageType,
          clientMessageId
        ]
      );


    const persistedRow = result.rows[0];

    if (!matchesPersistedMessage(persistedRow, {
      conversationId,
      content,
      messageType
    })) {
      return res.status(409).json({
        ok:false,
        code:'client_message_id_conflict',
        msg:'El identificador ya pertenece a otro mensaje'
      });
    }

    const message =
      normalizeMessage(
        persistedRow,
        userId
      );


    const inserted = persistedRow.inserted !== false;

    if (inserted) {
      await notifyPrivateConversation(
        req,
        room,
        message
      );
    }


    /* ==================================================
       ACTUALIZAR ACTIVIDAD DE LA CONVERSACIÓN
    ================================================== */

    if (inserted) {
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
    }


    return res
      .status(201)
      .json({

        ok: true,

        duplicate:
          !inserted,

        message,

        recipient: {
          id:
            room.otherUser.id,

          username:
            room.otherUser.username
        }

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


router.post(
  '/conversations/:conversationId/messages',
  sendMessageHandler
);


/*
  Alias para compatibilidad con versiones anteriores
  del frontend.
*/

router.post(
  '/messages',
  sendMessageHandler
);


/* ========================================================
   EDITAR MENSAJE

   PUT:
   /api/chat/messages/:messageId

   Solamente el AUTOR puede editarlo.
======================================================== */

router.put(
  '/messages/:messageId',
  async (req, res) => {

    const userId =
      currentUserId(req);


    const messageId =
      cleanId(
        req.params.messageId
      );


    const content =
      cleanMessage(
        req.body.content ||
        req.body.message ||
        req.body.text
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
            'El mensaje no puede quedar vacío'
        });

    }


    try {

      /* ==================================================
         BUSCAR MENSAJE

         Exigimos sender_user_id = usuario autenticado.
      ================================================== */

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
            AND
            sender_user_id = $2

          LIMIT 1
          `,
          [
            messageId,
            userId
          ]
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


      /* ==================================================
         SOLO TEXTO SE EDITA
      ================================================== */

      if (
        original.message_type !==
        'text'
      ) {

        return res
          .status(400)
          .json({
            ok: false,
            msg:
              'Este mensaje no se puede editar'
          });

      }


      if (
        Boolean(
          original.deleted
        )
      ) {

        return res
          .status(400)
          .json({
            ok: false,
            msg:
              'Este mensaje fue eliminado'
          });

      }


      /* ==================================================
         VERIFICAR SALA PRIVADA
      ================================================== */

      const room =
        await validatePrivateRoom(
          original.conversation_id,
          userId
        );


      if (!room.ok) {

        return res
          .status(room.status)
          .json({
            ok: false,
            msg:
              room.msg
          });

      }


      /* ==================================================
         EDITAR
      ================================================== */

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
            AND
            sender_user_id = $3

          RETURNING
            id,
            conversation_id,
            sender_user_id,
            content,
            message_type,
            file_url,
            file_name,
            mime_type,
            created_at,
            updated_at,
            edited,
            deleted
          `,
          [
            content,
            messageId,
            userId
          ]
        );

      const normalized = normalizeMessage(updated.rows[0], userId);
      const mutationPayload = {
        conversationId: original.conversation_id,
        messageId,
        text: normalized.content,
        editedAt: normalized.updatedAt
      };
      emitMessageMutation(req, original.conversation_id, 'edited', mutationPayload);


      return res.json({

        ok: true,

        message:
          normalized

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


/* ========================================================
   ELIMINAR MENSAJE

   DELETE:
   /api/chat/messages/:messageId

   Solamente el AUTOR puede eliminarlo.

   Usamos borrado lógico.
======================================================== */

router.delete(
  '/messages/:messageId',
  async (req, res) => {

    const userId =
      currentUserId(req);


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

      /* ==================================================
         BUSCAR MENSAJE DEL PROPIO USUARIO
      ================================================== */

      const result =
        await database.query(
          `
          SELECT
            id,
            conversation_id,
            sender_user_id

          FROM messages

          WHERE
            id = $1
            AND
            sender_user_id = $2

          LIMIT 1
          `,
          [
            messageId,
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
              'Mensaje no encontrado'
          });

      }


      const message =
        result.rows[0];


      /* ==================================================
         VERIFICAR SALA
      ================================================== */

      const room =
        await validatePrivateRoom(
          message.conversation_id,
          userId
        );


      if (!room.ok) {

        return res
          .status(room.status)
          .json({
            ok: false,
            msg:
              room.msg
          });

      }


      /* ==================================================
         BORRADO LÓGICO
      ================================================== */

      await database.query(
        `
        UPDATE messages

        SET
          deleted = TRUE,
          content = '',
          updated_at = NOW()

        WHERE
          id = $1
          AND
          sender_user_id = $2
        `,
        [
          messageId,
          userId
        ]
      );

      const mutationPayload = {
        conversationId: message.conversation_id,
        messageId,
        deletedAt: new Date().toISOString()
      };
      emitMessageMutation(req, message.conversation_id, 'deleted', mutationPayload);


      await database.query(
        `
        UPDATE conversations

        SET
          updated_at = NOW()

        WHERE
          id = $1
        `,
        [
          message.conversation_id
        ]
      );


      return res.json({

        ok: true,

        messageId,

        conversationId:
          message.conversation_id

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


/* ========================================================
   CAPA 147 — ACCIONES INDIVIDUALES DEL MENSAJE
======================================================== */

router.delete('/messages/:messageId/me', async (req, res) => {
  const userId = currentUserId(req);
  const messageId = cleanId(req.params.messageId);
  if (!messageId) return res.status(400).json({ ok:false, msg:'Mensaje no válido' });

  try {
    const found = await database.query(
      'SELECT id, conversation_id FROM messages WHERE id=$1 LIMIT 1',
      [messageId]
    );
    const message = found.rows[0];
    if (!message) return res.status(404).json({ ok:false, msg:'Mensaje no encontrado' });
    const room = await validatePrivateRoom(message.conversation_id, userId);
    if (!room.ok) return res.status(room.status).json({ ok:false, msg:room.msg });

    await database.query(`
      INSERT INTO message_hidden_users(message_id, user_id, hidden_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT(message_id, user_id) DO UPDATE SET hidden_at=NOW()
    `, [messageId, userId]);

    return res.json({ ok:true, messageId, conversationId:message.conversation_id, hiddenForMe:true });
  } catch (error) {
    console.error('VOBIXCHAT HIDE MESSAGE ERROR:', error);
    return res.status(500).json({ ok:false, msg:'No se pudo eliminar el mensaje para ti' });
  }
});

const MESSAGE_REACTION_EMOJIS = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏']);

async function messageReactionHandler(req, res, remove) {
  const userId = currentUserId(req);
  const messageId = cleanId(req.params.messageId);
  const emoji = String(req.body?.emoji || '').trim();
  if (!messageId || (!remove && !MESSAGE_REACTION_EMOJIS.has(emoji))) {
    return res.status(400).json({ ok:false, msg:'Reacción no válida' });
  }

  try {
    const found = await database.query(
      'SELECT id, conversation_id, deleted FROM messages WHERE id=$1 LIMIT 1',
      [messageId]
    );
    const message = found.rows[0];
    if (!message || message.deleted) return res.status(404).json({ ok:false, msg:'Mensaje no encontrado' });
    const room = await validatePrivateRoom(message.conversation_id, userId);
    if (!room.ok) return res.status(room.status).json({ ok:false, msg:room.msg });

    if (remove) {
      await database.query('DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2', [messageId, userId]);
    } else {
      await database.query(`
        INSERT INTO message_reactions(message_id, user_id, emoji, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT(message_id, user_id) DO UPDATE SET emoji=EXCLUDED.emoji, updated_at=NOW()
      `, [messageId, userId, emoji]);
    }

    const counts = await database.query(`
      SELECT emoji, COUNT(*)::int AS total
      FROM message_reactions WHERE message_id=$1 GROUP BY emoji
    `, [messageId]);
    const reactionCounts = Object.fromEntries(counts.rows.map(row => [row.emoji, Number(row.total)]));
    const payload = {
      conversationId: message.conversation_id,
      messageId,
      emoji,
      removed: Boolean(remove),
      userId,
      reactionCounts
    };
    emitMessageMutation(req, message.conversation_id, 'reaction', payload);
    return res.json({ ok:true, ...payload, myReaction:remove ? '' : emoji });
  } catch (error) {
    console.error('VOBIXCHAT MESSAGE REACTION ERROR:', error);
    return res.status(500).json({ ok:false, msg:'No se pudo guardar la reacción' });
  }
}

router.post('/messages/:messageId/reaction', (req, res) => messageReactionHandler(req, res, false));
router.delete('/messages/:messageId/reaction', (req, res) => messageReactionHandler(req, res, true));


/* ========================================================
   MARCAR CONVERSACIÓN COMO LEÍDA

   POST:
   /api/chat/conversations/:conversationId/read

   IMPORTANTE:
   También verificamos que el usuario pertenece
   a la conversación.
======================================================== */

router.post(
  '/conversations/:conversationId/read',
  async (req, res) => {

    const userId =
      currentUserId(req);


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

      const room =
        await validatePrivateRoom(
          conversationId,
          userId
        );


      if (!room.ok) {

        return res
          .status(room.status)
          .json({
            ok: false,
            msg:
              room.msg
          });

      }


      /*
        Guardamos la última lectura en
        conversation_participants.

        Esta columna debe existir en el esquema que
        veníamos usando para estado de lectura.
      */

      await database.query(
        `
        UPDATE conversation_participants

        SET
          last_read_at = NOW()

        WHERE
          conversation_id = $1
          AND
          user_id = $2
        `,
        [
          conversationId,
          userId
        ]
      );


      return res.json({

        ok: true,

        conversationId

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
            'No se pudo actualizar la conversación'
        });

    }

  }
);


/* ========================================================
   FIN BLOQUE 3 DE 4

   NO PONGAS module.exports TODAVÍA.

   BLOQUE 4:
   - fotos
   - documentos
   - notas de voz
   - vídeos
   - protección de archivos por conversación
   - compatibilidad con chat.html
   - cierre definitivo del router
======================================================== */
/* ========================================================
   BLOQUE 4 DE 4

   VOBIXCHAT
   ARCHIVOS DE LA SALA PRIVADA 1X1

   SOPORTA:
   - Fotos
   - Vídeos
   - Notas de voz / audio
   - Documentos
   - Validación de participante
   - Límite de 50 MB
======================================================== */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const r2Storage = require('../core/r2-storage');


/* ========================================================
   CARPETA DE ARCHIVOS
======================================================== */

const chatUploadDirectory =
  path.join(
    process.cwd(),
    'uploads',
    'chat'
  );

const resumableUploadDirectory =
  path.join(chatUploadDirectory, '.resumable');

const resumableUploads = new Map();
const RESUMABLE_CHUNK_SIZE = 1024 * 1024;
const RESUMABLE_UPLOAD_TTL = 2 * 60 * 60 * 1000;


try {

  fs.mkdirSync(
    chatUploadDirectory,
    {
      recursive: true
    }
  );

  fs.mkdirSync(
    resumableUploadDirectory,
    { recursive: true }
  );

} catch (error) {

  console.error(
    'VOBIXCHAT UPLOAD DIRECTORY ERROR:',
    error
  );

}


/* ========================================================
   LIMPIAR NOMBRE DE ARCHIVO
======================================================== */

function safeFileName(value) {

  const original =
    String(
      value ||
      'archivo'
    );


  return original
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

}


/* ========================================================
   ALMACENAMIENTO MULTER
======================================================== */

const chatStorage =
  multer.diskStorage({

    destination: (
      req,
      file,
      callback
    ) => {

      callback(
        null,
        chatUploadDirectory
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
          .slice(
            2,
            10
          );


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


/* ========================================================
   TIPOS PERMITIDOS
======================================================== */

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


  /* IMÁGENES */

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


  /* VÍDEOS */

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


  /* AUDIO / NOTAS DE VOZ */

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


  /*
    Algunos navegadores pueden enviar
    MediaRecorder como octet-stream.
  */

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


  /* DOCUMENTOS */

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


  /*
    Segunda comprobación por extensión.
  */

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


  callback(
    error
  );

}


/* ========================================================
   MULTER

   50 MB MÁXIMO
======================================================== */

const chatUpload =
  multer({

    storage:
      chatStorage,

    limits: {

      fileSize:
        50 * 1024 * 1024,

      files:
        1

    },

    fileFilter:
      chatFileFilter

  });


/* ========================================================
   ELIMINAR ARCHIVO SI ALGO FALLA
======================================================== */

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
        error.code !==
          'ENOENT'
      ) {

        console.error(
          'VOBIXCHAT REMOVE UPLOAD ERROR:',
          error.message
        );

      }

    }
  );

}


function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}


function sha256Stream(stream) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}


function uploadedFileName(fileUrl) {
  const prefix = '/uploads/chat/';
  const value = String(fileUrl || '');
  if (!value.startsWith(prefix)) return '';
  const name = path.basename(decodeURIComponent(value.slice(prefix.length)));
  return name && !name.includes('..') ? name : '';
}


async function currentStoredFileSha256(fileUrl) {
  const fileName = uploadedFileName(fileUrl);
  if (!fileName) return null;
  const localPath = path.join(chatUploadDirectory, fileName);
  try {
    return await sha256File(localPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const stored = await r2Storage.getChatFile(`chat/${fileName}`);
  const stream = r2Storage.toNodeStream(stored?.Body);
  return stream ? sha256Stream(stream) : null;
}


function normalizeOriginSource(value, messageType) {
  const source = String(value || '').trim().toLowerCase();
  if (messageType === 'voice' && source === 'vobix-recorder') return source;
  if (['image', 'video'].includes(messageType) && source === 'vobix-camera') return source;
  return 'vobix-upload';
}


/* ========================================================
   URL DEL ARCHIVO
======================================================== */

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


/* ========================================================
   DETERMINAR TIPO SEGÚN ARCHIVO
======================================================== */

function detectUploadedMessageType(
  file,
  requestedType
) {

  const requested =
    normalizeMessageType(
      requestedType
    );


  const mime =
    String(
      file &&
      file.mimetype
        ? file.mimetype
        : ''
    )
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

    return (
      requested === 'voice'
        ? 'voice'
        : 'audio'
    );

  }


  if (
    requested === 'voice'
  ) {

    return null;

  }


  return 'document';

}


/* ========================================================
   MIDDLEWARE PARA RECIBIR 1 ARCHIVO
======================================================== */

function receiveChatFile(
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

}


/* ========================================================
   CAPA 85 — SUBIDAS REANUDABLES POR FRAGMENTOS
======================================================== */

function resumableSessionFor(req) {
  const session = resumableUploads.get(cleanId(req.params.uploadId));
  if (!session || session.userId !== currentUserId(req)) return null;
  session.updatedAt = Date.now();
  return session;
}


function resumableFileAllowed(name, mimeType) {
  return new Promise(resolve => {
    chatFileFilter(
      {},
      { originalname: name, mimetype: mimeType },
      (error, accepted) => resolve(!error && accepted === true)
    );
  });
}


async function removeResumableSession(uploadId) {
  const session = resumableUploads.get(uploadId);
  resumableUploads.delete(uploadId);
  if (!session) return;
  await fs.promises.rm(session.directory, { recursive: true, force: true }).catch(() => {});
}


router.post('/files/resumable/start', async (req, res) => {
  const userId = currentUserId(req);
  const conversationId = cleanId(req.body?.conversationId || req.body?.conversation_id);
  const originalName = safeFileName(req.body?.fileName || 'archivo');
  const mimeType = String(req.body?.mimeType || 'application/octet-stream').trim().slice(0, 150);
  const totalSize = Number(req.body?.totalSize || 0);
  const requestedType = normalizeMessageType(req.body?.type);
  const clientUploadId = normalizeUploadId(req.body?.clientUploadId);
  const originSource = String(req.body?.originSource || '').trim().slice(0, 30);
  const viewOnce = req.body?.viewOnce === true;

  if (!conversationId || !clientUploadId || !Number.isSafeInteger(totalSize) || totalSize < 1 || totalSize > 50 * 1024 * 1024) {
    return res.status(400).json({ ok: false, msg: 'Datos de subida no válidos' });
  }
  if (!(await resumableFileAllowed(originalName, mimeType))) {
    return res.status(415).json({ ok: false, msg: 'Este tipo de archivo no está permitido' });
  }

  const room = await validatePrivateRoom(conversationId, userId);
  if (!room.ok) return res.status(room.status).json({ ok: false, msg: room.msg });
  if (await usersAreBlocked(userId, room.otherUser.id)) {
    return res.status(403).json({ ok: false, msg: 'No se puede enviar el archivo' });
  }
  const childPolicy = await childProtection.communicationDecision(database,userId,room.otherUser.id);
  if(!childPolicy.allowed)return res.status(403).json({ok:false,msg:'Archivo no autorizado por la protección familiar'});

  const existing = [...resumableUploads.values()].find(item =>
    item.userId === userId && item.clientUploadId === clientUploadId
  );
  if (existing) {
    if(!matchesUploadIntent(existing,{conversationId,originalName,mimeType,totalSize,requestedType,originSource,viewOnce})){
      return res.status(409).json({ok:false,code:'client_upload_id_conflict',msg:'El identificador ya pertenece a otra subida'});
    }
    return res.json({
      ok: true,
      uploadId: existing.uploadId,
      chunkSize: RESUMABLE_CHUNK_SIZE,
      received: [...existing.received.keys()].sort((a, b) => a - b)
    });
  }

  const uploadId = crypto.randomUUID();
  const directory = path.join(resumableUploadDirectory, uploadId);
  await fs.promises.mkdir(directory, { recursive: true });
  resumableUploads.set(uploadId, {
    uploadId,
    clientUploadId,
    userId,
    conversationId,
    originalName,
    mimeType,
    totalSize,
    totalChunks: Math.ceil(totalSize / RESUMABLE_CHUNK_SIZE),
    requestedType,
    originSource,
    viewOnce,
    directory,
    received: new Map(),
    completing: false,
    updatedAt: Date.now()
  });

  return res.status(201).json({ ok: true, uploadId, chunkSize: RESUMABLE_CHUNK_SIZE, received: [] });
});


router.get('/files/resumable/:uploadId', (req, res) => {
  const session = resumableSessionFor(req);
  if (!session) return res.status(404).json({ ok: false, msg: 'Subida no encontrada' });
  return res.json({
    ok: true,
    uploadId: session.uploadId,
    chunkSize: RESUMABLE_CHUNK_SIZE,
    totalChunks: session.totalChunks,
    received: [...session.received.keys()].sort((a, b) => a - b)
  });
});


router.put(
  '/files/resumable/:uploadId/:index',
  express.raw({ type: 'application/octet-stream', limit: RESUMABLE_CHUNK_SIZE + 1024 }),
  async (req, res) => {
    const session = resumableSessionFor(req);
    const index = Number(req.params.index);
    if (!session) return res.status(404).json({ ok: false, msg: 'Subida no encontrada' });
    if (session.completing) {
      return res.status(409).json({ ok: false, code: 'upload_session_finalizing', msg: 'La subida se está finalizando' });
    }
    if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({ ok: false, msg: 'Fragmento no válido' });
    }
    const expectedSize = index === session.totalChunks - 1
      ? session.totalSize - index * RESUMABLE_CHUNK_SIZE
      : RESUMABLE_CHUNK_SIZE;
    if (req.body.length !== expectedSize) {
      return res.status(400).json({ ok: false, msg: 'Tamaño de fragmento incorrecto' });
    }
    const chunkPath = path.join(session.directory, `${index}.part`);
    const chunkHash = crypto.createHash('sha256').update(req.body).digest('hex');
    const acceptedHash = session.received.get(index);
    if (acceptedHash) {
      if (acceptedHash !== chunkHash) {
        return res.status(409).json({ ok: false, code: 'chunk_content_conflict', msg: 'El fragmento ya fue recibido con otro contenido' });
      }
      return res.json({ ok: true, index, receivedCount: session.received.size, replayed: true });
    }
    const temporaryPath = `${chunkPath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fs.promises.writeFile(temporaryPath, req.body, { flag: 'wx' });
    await fs.promises.rename(temporaryPath, chunkPath).catch(async error => {
      await fs.promises.unlink(temporaryPath).catch(() => {});
      throw error;
    });
    session.received.set(index, chunkHash);
    return res.json({ ok: true, index, receivedCount: session.received.size });
  }
);


router.post('/files/resumable/:uploadId/complete', async (req, res) => {
  const session = resumableSessionFor(req);
  if (!session) return res.status(404).json({ ok: false, msg: 'Subida no encontrada' });
  if (session.received.size !== session.totalChunks) {
    return res.status(409).json({
      ok: false,
      msg: 'Faltan fragmentos',
      received: [...session.received.keys()].sort((a, b) => a - b)
    });
  }
  if (session.completing) {
    return res.status(409).json({ ok: false, code: 'upload_completion_in_progress', msg: 'La subida ya se está completando' });
  }
  session.completing = true;

  const extension = path.extname(session.originalName).toLowerCase();
  const finalName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${path.basename(session.originalName, extension).slice(0, 100) || 'archivo'}${extension}`;
  const finalPath = path.join(chatUploadDirectory, finalName);
  await fs.promises.writeFile(finalPath, Buffer.alloc(0));
  for (let index = 0; index < session.totalChunks; index += 1) {
    const chunk = await fs.promises.readFile(path.join(session.directory, `${index}.part`));
    const actualHash = crypto.createHash('sha256').update(chunk).digest('hex');
    if (actualHash !== session.received.get(index)) {
      await fs.promises.unlink(finalPath).catch(() => {});
      session.completing = false;
      return res.status(409).json({ ok: false, code: 'chunk_integrity_failed', msg: 'La integridad de un fragmento no coincide' });
    }
    await fs.promises.appendFile(finalPath, chunk);
  }
  const assembled = await fs.promises.stat(finalPath);
  if (assembled.size !== session.totalSize) {
    await fs.promises.unlink(finalPath).catch(() => {});
    session.completing = false;
    return res.status(409).json({ ok: false, msg: 'El archivo reconstruido no coincide' });
  }

  req.file = {
    fieldname: 'file',
    originalname: session.originalName,
    encoding: '7bit',
    mimetype: session.mimeType,
    destination: chatUploadDirectory,
    filename: finalName,
    path: finalPath,
    size: assembled.size
  };
  req.body = {
    conversationId: session.conversationId,
    clientMessageId: session.clientUploadId,
    type: session.requestedType,
    originSource: session.originSource,
    viewOnce: session.viewOnce
  };
  await removeResumableSession(session.uploadId);
  return uploadChatFileHandler(req, res);
});


router.delete('/files/resumable/:uploadId', async (req, res) => {
  const session = resumableSessionFor(req);
  if (!session) return res.status(404).json({ ok: false, msg: 'Subida no encontrada' });
  if (session.completing) {
    return res.status(409).json({ ok: false, code: 'upload_session_finalizing', msg: 'La subida se está finalizando' });
  }
  await removeResumableSession(session.uploadId);
  return res.json({ ok: true });
});


setInterval(() => {
  const expiredBefore = Date.now() - RESUMABLE_UPLOAD_TTL;
  for (const session of resumableUploads.values()) {
    if (session.updatedAt < expiredBefore) removeResumableSession(session.uploadId);
  }
}, 15 * 60 * 1000).unref();


/* ========================================================
   PROCESAR ARCHIVO DE CHAT

   Compatible con:

   POST /api/chat/upload

   y:

   POST /api/chat/files
======================================================== */

async function uploadChatFileHandler(
  req,
  res
) {

  const userId =
    currentUserId(req);


  const conversationId =
    cleanId(
      req.body.conversationId ||
      req.body.conversation_id
    );

  const rawClientMessageId = String(
    req.body.clientMessageId || req.body.client_message_id || ''
  ).trim();
  const clientMessageId = /^[A-Za-z0-9_-]{8,100}$/.test(rawClientMessageId)
    ? rawClientMessageId
    : null;


  /* ======================================================
     VALIDACIONES
  ====================================================== */

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

  if (!clientMessageId) {
    removeUploadedFile(req.file);
    return res.status(400).json({
      ok:false,
      code:'client_message_id_required',
      msg:'El archivo necesita un identificador seguro'
    });
  }


  try {

    /* ==================================================
       SEGURIDAD 1X1

       EL ARCHIVO NO SE GUARDA EN LA CONVERSACIÓN
       SI EL USUARIO NO PERTENECE A ELLA.
    ================================================== */

    const room =
      await validatePrivateRoom(
        conversationId,
        userId
      );


    if (!room.ok) {

      removeUploadedFile(
        req.file
      );


      return res
        .status(room.status)
        .json({
          ok: false,
          msg:
            room.msg
        });

    }


    /* ==================================================
       BLOQUEO
    ================================================== */

    const blocked =
      await usersAreBlocked(
        userId,
        room.otherUser.id
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


    const childPolicy =
      await childProtection.communicationDecision(
        database,
        userId,
        room.otherUser.id
      );


    if (!childPolicy.allowed) {

      removeUploadedFile(
        req.file
      );


      return res
        .status(403)
        .json({
          ok: false,
          msg:
            'Archivo no autorizado por la protección familiar'
        });

    }


    /* ==================================================
       TIPO REAL
    ================================================== */

    const messageType =
      detectUploadedMessageType(
        req.file,
        req.body.messageType ||
        req.body.message_type ||
        req.body.type
      );

    if (!messageType) {
      removeUploadedFile(req.file);
      return res.status(400).json({ ok:false, code:'voice_audio_required', msg:'La nota de voz debe ser un archivo de audio' });
    }

    const viewOnce =
      Boolean(req.body.viewOnce || req.body.view_once) &&
      ['image', 'video', 'voice', 'audio'].includes(messageType);


    const fileUrl =
      chatFileUrl(
        req.file
      );

    /* ==================================================
       CAPA 4.1 — COPIA PERMANENTE EN R2
       Se completa ANTES de crear el mensaje. Si R2 falla,
       no se publica un mensaje con un archivo roto.
    ================================================== */

    const permanentObjectKey =
      'chat/' +
      req.file.filename;

    await r2Storage.putChatFile({
      key: permanentObjectKey,
      filePath: req.file.path,
      contentType: req.file.mimetype,
      originalName: req.file.originalname
    });


    const originalFileName =
      String(
        req.file.originalname ||
        'archivo'
      )
        .trim()
        .slice(
          0,
          255
        );


    const mimeType =
      String(
        req.file.mimetype ||
        'application/octet-stream'
      )
        .trim()
        .slice(
          0,
          150
        );

    // CAPA 102 — La huella se calcula desde los bytes recibidos, antes de
    // publicar el mensaje. El origen describe cómo entró el archivo en Vobix;
    // no afirma quién lo creó fuera de la aplicación.
    const originSha256 = await sha256File(req.file.path);
    const originSource = normalizeOriginSource(req.body.originSource, messageType);
    const capturedInsideVobix = ['vobix-camera', 'vobix-recorder'].includes(originSource);
    const originCapturedAt = capturedInsideVobix ? new Date().toISOString() : null;
    const originUserVerified = capturedInsideVobix ? req.vobixUser?.verified === true : null;
    const originDeviceRecognized = capturedInsideVobix ? Boolean(req.vobixSession?.recognizedAt) : null;


    /* ==================================================
       GUARDAR COMO MENSAJE
    ================================================== */

    const result =
      await database.query(
        `
        INSERT INTO messages
        (
          conversation_id,
          sender_user_id,
          content,
          message_type,
          file_url,
          file_name,
          mime_type,
          created_at,
          updated_at,
          edited,
          deleted,
          expires_at,
          view_once,
          origin_sha256,
          origin_source,
          origin_sealed_at,
          origin_user_verified,
          origin_device_recognized,
          origin_location_shared,
          origin_capture_at,
          origin_session_id,
          client_message_id
        )

        VALUES
        (
          $1,
          $2,
          '',
          $3,
          $4,
          $5,
          $6,
          NOW(),
          NOW(),
          FALSE,
          FALSE,
          CASE
            WHEN COALESCE((SELECT disappearing_seconds FROM conversations WHERE id = $1), 0) > 0
            THEN NOW() + (SELECT disappearing_seconds * INTERVAL '1 second' FROM conversations WHERE id = $1)
            ELSE NULL
          END,
          $7,
          $8,
          $9,
          NOW(),
          $10,
          $11,
          FALSE,
          $12,
          $13,
          $14
        )

        ON CONFLICT (sender_user_id, client_message_id)
        WHERE client_message_id IS NOT NULL
        DO UPDATE SET client_message_id = EXCLUDED.client_message_id

        RETURNING
          id,
          conversation_id,
          sender_user_id,
          content,
          message_type,
          file_url,
          file_name,
          mime_type,
          created_at,
          updated_at,
          edited,
          deleted,
          expires_at,
          view_once,
          origin_sha256,
          origin_source,
          origin_sealed_at,
          origin_user_verified,
          origin_device_recognized,
          origin_location_shared,
          origin_capture_at,
          origin_session_id,
          origin_attestation_hmac,
          client_message_id,
          (xmax = 0) AS inserted
        `,
        [
          conversationId,
          userId,
          messageType,
          fileUrl,
          originalFileName,
          mimeType,
          viewOnce,
          originSha256,
          originSource,
          originUserVerified,
          originDeviceRecognized,
          originCapturedAt,
          capturedInsideVobix ? req.vobixSession?.id : null,
          clientMessageId
        ]
      );

    let persistedRow = result.rows[0];
    if (!matchesPersistedMessage(persistedRow, {
      conversationId,
      content:'',
      messageType,
      originSha256
    })) {
      await r2Storage.deleteChatFile(permanentObjectKey).catch(() => {});
      removeUploadedFile(req.file);
      return res.status(409).json({ok:false,code:'client_message_id_conflict',msg:'El identificador ya pertenece a otro archivo'});
    }
    const inserted = persistedRow.inserted !== false;
    if (!inserted) {
      await r2Storage.deleteChatFile(permanentObjectKey).catch(() => {});
      removeUploadedFile(req.file);
    }
    if (inserted && capturedInsideVobix) {
      const payload = {
        messageId:persistedRow.id,
        sha256:originSha256,
        userId,
        sessionId:req.vobixSession?.id,
        userVerified:originUserVerified,
        deviceRecognized:originDeviceRecognized,
        locationShared:false,
        capturedAt:originCapturedAt
      };
      const signature = originAttestation.sign(payload, process.env.ORIGIN_ATTESTATION_SECRET);
      if (signature) {
        const attested = await database.query(
          `UPDATE messages SET origin_attestation_hmac=$1 WHERE id=$2
           RETURNING id,conversation_id,sender_user_id,content,message_type,file_url,file_name,mime_type,
           created_at,updated_at,edited,deleted,expires_at,view_once,origin_sha256,origin_source,
           origin_sealed_at,origin_user_verified,origin_device_recognized,origin_location_shared,
           origin_capture_at,origin_session_id,origin_attestation_hmac,client_message_id`,
          [signature, persistedRow.id]
        );
        persistedRow = attested.rows[0];
      }
    }


    if (inserted) await database.query(
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
        persistedRow,
        userId
      );


    if (inserted) {
      await notifyPrivateConversation(
        req,
        room,
        message
      );
    }


    return res
      .status(201)
      .json({

        ok: true,

        duplicate: !inserted,

        message,

        /*
          Compatibilidad con el chat.html
          que acabamos de preparar.
        */

        file: {

          url:
            message.fileUrl || fileUrl,

          fileUrl:
            message.fileUrl || fileUrl,

          file_url:
            message.fileUrl || fileUrl,

          name:
            message.fileName || originalFileName,

          fileName:
            message.fileName || originalFileName,

          file_name:
            message.fileName || originalFileName,

          mimeType:
            mimeType,

          mime_type:
            mimeType,

          messageType:
            messageType,

          message_type:
            messageType,

          originSeal:
            message.originSeal

        }

      });


  } catch (error) {

    if (req.file && req.file.filename) {
      r2Storage
        .deleteChatFile('chat/' + req.file.filename)
        .catch(() => {});
    }

    removeUploadedFile(
      req.file
    );


    console.error(
      'VOBIXCHAT UPLOAD ERROR:',
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


/* ========================================================
   RUTAS DE SUBIDA

   La primera conserva compatibilidad con el chat antiguo.

   La segunda corresponde al chat.html nuevo.
======================================================== */

router.post(
  '/upload',
  receiveChatFile,
  uploadChatFileHandler
);


router.post(
  '/files',
  receiveChatFile,
  uploadChatFileHandler
);


/* ========================================================
   CAPA 102 — VERIFICAR SELLO ORIGINAL

   Recalcula SHA-256 desde el archivo almacenado. Solo los participantes
   pueden consultar el resultado y nunca se confunde "sellado por Vobix"
   con identidad o autoría legal.
======================================================== */

router.get('/messages/:messageId/origin-seal', async (req, res) => {
  const userId = currentUserId(req);
  const messageId = cleanId(req.params.messageId);
  if (!messageId) return res.status(400).json({ ok: false, msg: 'Mensaje no válido' });

  try {
    const found = await database.query(
      `SELECT id, conversation_id, sender_user_id, file_url, origin_sha256, origin_source, origin_sealed_at,
              origin_user_verified,origin_device_recognized,origin_location_shared,origin_capture_at,
              origin_session_id,origin_attestation_hmac,
              deleted, expires_at
       FROM messages WHERE id=$1 LIMIT 1`,
      [messageId]
    );
    const message = found.rows[0];
    if (!message) return res.status(404).json({ ok: false, msg: 'Sello no encontrado' });
    const room = await validatePrivateRoom(message.conversation_id, userId);
    if (!room.ok) return res.status(room.status).json({ ok: false, msg: room.msg });
    if (message.deleted || (message.expires_at && new Date(message.expires_at) <= new Date())) {
      return res.status(410).json({ ok: false, msg: 'El archivo ya no está disponible' });
    }
    if (!message.origin_sha256 || !message.file_url) {
      return res.status(404).json({ ok: false, msg: 'Este archivo no tiene Sello Original' });
    }

    const actualSha256 = await currentStoredFileSha256(message.file_url);
    if (!actualSha256) {
      return res.status(503).json({ ok: false, msg: 'No se pudo acceder al archivo para verificarlo' });
    }
    const intact = crypto.timingSafeEqual(
      Buffer.from(actualSha256, 'hex'),
      Buffer.from(message.origin_sha256, 'hex')
    );
    const attestationPayload = {
      messageId:message.id,
      sha256:message.origin_sha256,
      userId:message.sender_user_id,
      sessionId:message.origin_session_id,
      userVerified:message.origin_user_verified === true,
      deviceRecognized:message.origin_device_recognized === true,
      locationShared:message.origin_location_shared === true,
      capturedAt:message.origin_capture_at ? new Date(message.origin_capture_at).toISOString() : ''
    };
    const attestationValid = Boolean(message.origin_attestation_hmac) && originAttestation.verify(
      attestationPayload,
      message.origin_attestation_hmac,
      process.env.ORIGIN_ATTESTATION_SECRET
    );
    return res.json({
      ok: true,
      seal: {
        algorithm: 'SHA-256',
        sha256: message.origin_sha256,
        source: message.origin_source || 'vobix-upload',
        sealedAt: message.origin_sealed_at,
        status: intact ? 'intact' : 'modified',
        intact,
        attestation: {
          signed: Boolean(message.origin_attestation_hmac),
          valid: attestationValid,
          userVerified: message.origin_user_verified === true,
          deviceRecognized: message.origin_device_recognized === true,
          locationShared: message.origin_location_shared === true,
          capturedAt: message.origin_capture_at || null
        }
      }
    });
  } catch (error) {
    console.error('VOBIXCHAT ORIGIN SEAL VERIFY ERROR:', error);
    return res.status(500).json({ ok: false, msg: 'No se pudo verificar el Sello Original' });
  }
});


/* ========================================================
   INFORMACIÓN DE PARTICIPANTES DE UNA SALA

   GET:
   /api/chat/conversations/:conversationId/participants

   IMPORTANTE:
   Primero validamos que quien pregunta pertenece
   realmente a la conversación.
======================================================== */

router.get(
  '/conversations/:conversationId/participants',
  async (req, res) => {

    const userId =
      currentUserId(req);


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

      const room =
        await validatePrivateRoom(
          conversationId,
          userId
        );


      if (!room.ok) {

        return res
          .status(room.status)
          .json({
            ok: false,
            msg:
              room.msg
          });

      }


      const result =
        await database.query(
          `
          SELECT
            u.id,
            u.username,
            u.vobix_id,
            u.avatar_url,
            u.bio,
            u.verified,
            u.online,
            u.last_seen

          FROM conversation_participants cp

          INNER JOIN users u
            ON
              u.id =
              cp.user_id

          WHERE
            cp.conversation_id = $1

          ORDER BY
            cp.joined_at ASC
          `,
          [
            conversationId
          ]
        );


      /*
        Seguridad adicional:
        una sala privada debe devolver exactamente 2.
      */

      if (
        result.rows.length !== 2
      ) {

        return res
          .status(403)
          .json({
            ok: false,
            msg:
              'Sala privada no válida'
          });

      }


      return res.json({

        ok: true,

        conversationId,

        participants:
          result.rows,

        otherUser:
          room.otherUser

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


/* ========================================================
   HEALTH DEL ROUTER DE CHAT

   Sirve para comprobar que chat.js está montado.
======================================================== */

/* ========================================================
   CIFRADO E2E · CLAVES PÚBLICAS

   El navegador crea y conserva la clave privada localmente.
   Render solo almacena la clave pública necesaria para que el otro
   participante cifre un mensaje dirigido a este dispositivo.
======================================================== */

router.put('/e2e/key', async (req, res) => {
  const publicKey = req.body?.publicKey;
  const fingerprint = String(req.body?.fingerprint || '').trim().slice(0, 128);
  if (!publicKey || typeof publicKey !== 'object' || !fingerprint) {
    return res.status(400).json({ ok:false, msg:'Clave de seguridad no válida' });
  }
  try {
    await database.query(`
      INSERT INTO user_e2e_keys (user_id, public_key_jwk, fingerprint, created_at, updated_at)
      VALUES ($1, $2::jsonb, $3, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        public_key_jwk=EXCLUDED.public_key_jwk,
        fingerprint=EXCLUDED.fingerprint,
        updated_at=NOW()
    `, [currentUserId(req), JSON.stringify(publicKey), fingerprint]);
    return res.json({ ok:true, fingerprint });
  } catch (error) {
    console.error('VOBIXCHAT E2E KEY SAVE ERROR:', error.message);
    return res.status(500).json({ ok:false, msg:'No se pudo preparar la seguridad' });
  }
});

router.get('/e2e/key/:userId', async (req, res) => {
  const peerId = cleanId(req.params.userId);
  if (!peerId) return res.status(400).json({ ok:false, msg:'Usuario no válido' });
  try {
    const result = await database.query(`
      SELECT public_key_jwk, fingerprint, updated_at
      FROM user_e2e_keys WHERE user_id=$1 LIMIT 1
    `, [peerId]);
    if (!result.rows[0]) return res.status(404).json({ ok:false, msg:'El contacto debe abrir la versión segura de VobixChat primero' });
    return res.json({ ok:true, publicKey:result.rows[0].public_key_jwk, fingerprint:result.rows[0].fingerprint, updatedAt:result.rows[0].updated_at });
  } catch (error) {
    console.error('VOBIXCHAT E2E KEY READ ERROR:', error.message);
    return res.status(500).json({ ok:false, msg:'No se pudo preparar la seguridad' });
  }
});


/* ========================================================
   CAPA 2.2 — ENCUESTAS PRIVADAS

   Reglas:
   - Solo miembros del chat 1×1 pueden crear, leer y votar.
   - Cada usuario vota una vez por encuesta (BD).
   - Solo quien la creó puede cerrarla antes de tiempo.
======================================================== */

function cleanPollText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function emitPollUpdate(req, conversationId, pollId) {
  const io = req.app && req.app.get('io');
  if (!io) return;
  const payload = { conversationId, pollId };
  io.to(`conversation:${conversationId}`).emit('poll:updated', payload);
}

async function getPollForViewer(pollId, conversationId, viewerUserId) {
  const result = await database.query(`
    SELECT
      p.id, p.conversation_id, p.creator_user_id, p.question,
      p.created_at, p.closes_at, p.closed_at,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', o.id,
          'label', o.label,
          'position', o.position,
          'votes', (SELECT COUNT(*)::int FROM chat_poll_votes v WHERE v.option_id = o.id)
        ) ORDER BY o.position)
        FROM chat_poll_options o WHERE o.poll_id = p.id
      ), '[]'::json) AS options,
      (SELECT COUNT(*)::int FROM chat_poll_votes v WHERE v.poll_id = p.id) AS total_votes,
      (SELECT v.option_id::text FROM chat_poll_votes v WHERE v.poll_id = p.id AND v.voter_user_id = $3 LIMIT 1) AS viewer_option_id
    FROM chat_polls p
    WHERE p.id = $1 AND p.conversation_id = $2
    LIMIT 1
  `, [pollId, conversationId, viewerUserId]);

  const poll = result.rows[0] || null;
  if (!poll) return null;

  const isExpired = poll.closes_at && new Date(poll.closes_at).getTime() <= Date.now();
  return {
    id: poll.id,
    conversationId: poll.conversation_id,
    creatorUserId: poll.creator_user_id,
    question: poll.question,
    options: poll.options,
    totalVotes: poll.total_votes,
    viewerOptionId: poll.viewer_option_id,
    createdAt: poll.created_at,
    closesAt: poll.closes_at,
    closedAt: poll.closed_at,
    closed: Boolean(poll.closed_at || isExpired)
  };
}

router.post('/polls', async (req, res) => {
  const userId = currentUserId(req);
  const conversationId = cleanId(req.body?.conversationId);
  const question = cleanPollText(req.body?.question, 280);
  const options = Array.isArray(req.body?.options)
    ? req.body.options.map(item => cleanPollText(item, 160)).filter(Boolean)
    : [];
  const closesInHours = Number(req.body?.closesInHours || 0);

  if (!conversationId || !question || options.length < 2 || options.length > 8) {
    return res.status(400).json({ ok:false, msg:'Escribe una pregunta y entre 2 y 8 opciones' });
  }
  if (new Set(options.map(item => item.toLocaleLowerCase('es'))).size !== options.length) {
    return res.status(400).json({ ok:false, msg:'No repitas opciones en la encuesta' });
  }

  const room = await validatePrivateRoom(conversationId, userId);
  if (!room.ok) return res.status(room.status).json({ ok:false, msg:room.msg });

  const client = await database.pool.connect();
  try {
    await client.query('BEGIN');
    const closesAt = Number.isFinite(closesInHours) && closesInHours > 0 && closesInHours <= 24 * 90
      ? new Date(Date.now() + closesInHours * 60 * 60 * 1000)
      : null;
    const pollResult = await client.query(`
      INSERT INTO chat_polls(conversation_id, creator_user_id, question, closes_at)
      VALUES($1,$2,$3,$4) RETURNING id
    `, [conversationId, userId, question, closesAt]);
    const pollId = pollResult.rows[0].id;
    for (const [position, label] of options.entries()) {
      await client.query(`
        INSERT INTO chat_poll_options(poll_id, label, position) VALUES($1,$2,$3)
      `, [pollId, label, position]);
    }
    await client.query('COMMIT');
    const poll = await getPollForViewer(pollId, conversationId, userId);
    await emitPollUpdate(req, conversationId, pollId);
    return res.status(201).json({ ok:true, poll });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('VOBIXCHAT POLL CREATE ERROR:', error.message);
    return res.status(500).json({ ok:false, msg:'No se pudo crear la encuesta' });
  } finally {
    client.release();
  }
});

router.get('/conversations/:conversationId/polls', async (req, res) => {
  const userId = currentUserId(req);
  const conversationId = cleanId(req.params.conversationId);
  const room = await validatePrivateRoom(conversationId, userId);
  if (!room.ok) return res.status(room.status).json({ ok:false, msg:room.msg });
  try {
    const result = await database.query(`
      SELECT id FROM chat_polls WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 50
    `, [conversationId]);
    const polls = [];
    for (const row of result.rows) {
      const poll = await getPollForViewer(row.id, conversationId, userId);
      if (poll) polls.push(poll);
    }
    return res.json({ ok:true, polls });
  } catch (error) {
    console.error('VOBIXCHAT POLL LIST ERROR:', error.message);
    return res.status(500).json({ ok:false, msg:'No se pudieron cargar las encuestas' });
  }
});

router.post('/polls/:pollId/vote', async (req, res) => {
  const userId = currentUserId(req);
  const pollId = cleanId(req.params.pollId);
  const optionId = cleanId(req.body?.optionId);
  if (!pollId || !optionId) return res.status(400).json({ ok:false, msg:'Selecciona una opción' });
  try {
    const pollResult = await database.query(`SELECT conversation_id, closed_at, closes_at FROM chat_polls WHERE id=$1 LIMIT 1`, [pollId]);
    const rawPoll = pollResult.rows[0];
    if (!rawPoll) return res.status(404).json({ ok:false, msg:'Encuesta no encontrada' });
    const room = await validatePrivateRoom(rawPoll.conversation_id, userId);
    if (!room.ok) return res.status(room.status).json({ ok:false, msg:room.msg });
    if (rawPoll.closed_at || (rawPoll.closes_at && new Date(rawPoll.closes_at).getTime() <= Date.now())) {
      return res.status(409).json({ ok:false, msg:'La encuesta está cerrada' });
    }
    const option = await database.query(`SELECT 1 FROM chat_poll_options WHERE id=$1 AND poll_id=$2`, [optionId, pollId]);
    if (!option.rows[0]) return res.status(400).json({ ok:false, msg:'La opción no pertenece a esta encuesta' });
    await database.query(`INSERT INTO chat_poll_votes(poll_id, option_id, voter_user_id) VALUES($1,$2,$3)`, [pollId, optionId, userId]);
    const poll = await getPollForViewer(pollId, rawPoll.conversation_id, userId);
    await emitPollUpdate(req, rawPoll.conversation_id, pollId);
    return res.json({ ok:true, poll });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ ok:false, msg:'Ya votaste en esta encuesta' });
    console.error('VOBIXCHAT POLL VOTE ERROR:', error.message);
    return res.status(500).json({ ok:false, msg:'No se pudo registrar tu voto' });
  }
});

router.post('/polls/:pollId/close', async (req, res) => {
  const userId = currentUserId(req);
  const pollId = cleanId(req.params.pollId);
  try {
    const result = await database.query(`
      SELECT conversation_id, creator_user_id FROM chat_polls WHERE id=$1 LIMIT 1
    `, [pollId]);
    const rawPoll = result.rows[0];
    if (!rawPoll) return res.status(404).json({ ok:false, msg:'Encuesta no encontrada' });
    const room = await validatePrivateRoom(rawPoll.conversation_id, userId);
    if (!room.ok) return res.status(room.status).json({ ok:false, msg:room.msg });
    if (String(rawPoll.creator_user_id) !== String(userId)) return res.status(403).json({ ok:false, msg:'Solo quien creó la encuesta puede cerrarla' });
    await database.query(`UPDATE chat_polls SET closed_at=COALESCE(closed_at,NOW()) WHERE id=$1`, [pollId]);
    const poll = await getPollForViewer(pollId, rawPoll.conversation_id, userId);
    await emitPollUpdate(req, rawPoll.conversation_id, pollId);
    return res.json({ ok:true, poll });
  } catch (error) {
    console.error('VOBIXCHAT POLL CLOSE ERROR:', error.message);
    return res.status(500).json({ ok:false, msg:'No se pudo cerrar la encuesta' });
  }
});

router.get(
  '/health',
  (req, res) => {

    return res.json({

      ok: true,

      service:
        'VOBIXCHAT PRIVATE CHAT',

      mode:
        '1x1'

    });

  }
);


/* ========================================================
   MANEJADOR DE ERRORES DEL ROUTER
======================================================== */

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


/* ========================================================
   FIN DEFINITIVO routes/chat.js
======================================================== */

module.exports = router;
