
'use strict';

/*
==========================================================
 VOBIXCHAT CORE
 users.js

 Motor interno de usuarios.
 Este archivo NO pertenece a /public.
==========================================================
*/

const crypto = require('crypto');

// Usuarios mantenidos por el núcleo.
// Posteriormente esta capa se conectará al almacenamiento
// persistente sin cambiar el resto de VobixChat.
const users = new Map();


/*
==========================================================
 CREAR ID INTERNO
==========================================================
*/

function createUserId() {
  return crypto.randomUUID();
}


/*
==========================================================
 NORMALIZAR TELÉFONO
==========================================================
*/

function normalizePhone(phone) {

  if (typeof phone !== 'string') {
    return '';
  }

  return phone
    .trim()
    .replace(/[^\d+]/g, '');
}


/*
==========================================================
 BUSCAR USUARIO POR TELÉFONO
==========================================================
*/

function getUserByPhone(phone) {

  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    return null;
  }

  return users.get(normalizedPhone) || null;
}


/*
==========================================================
 CREAR / ACTUALIZAR USUARIO
==========================================================
*/

function upsertUser({ username, phone }) {

  const cleanUsername =
    typeof username === 'string'
      ? username.trim()
      : '';

  const normalizedPhone = normalizePhone(phone);

  if (!cleanUsername) {
    throw new Error('USERNAME_REQUIRED');
  }

  if (!normalizedPhone) {
    throw new Error('PHONE_REQUIRED');
  }

  const existing = users.get(normalizedPhone);

  if (existing) {

    existing.username = cleanUsername;
    existing.updatedAt = Date.now();

    return {
      ...existing
    };
  }

  const now = Date.now();

  const user = {

    id: createUserId(),

    username: cleanUsername,

    phone: normalizedPhone,

    verified: false,

    createdAt: now,

    updatedAt: now,

    lastSeenAt: null,

    online: false

  };

  users.set(normalizedPhone, user);

  return {
    ...user
  };
}


/*
==========================================================
 MARCAR COMO VERIFICADO
==========================================================
*/

function verifyUser(phone) {

  const normalizedPhone = normalizePhone(phone);

  const user = users.get(normalizedPhone);

  if (!user) {
    return null;
  }

  user.verified = true;
  user.updatedAt = Date.now();

  return {
    ...user
  };
}


/*
==========================================================
 ONLINE / OFFLINE
==========================================================
*/

function setOnline(phone, online) {

  const normalizedPhone = normalizePhone(phone);

  const user = users.get(normalizedPhone);

  if (!user) {
    return null;
  }

  user.online = Boolean(online);

  if (!online) {
    user.lastSeenAt = Date.now();
  }

  user.updatedAt = Date.now();

  return {
    ...user
  };
}


/*
==========================================================
 LISTADO SEGURO
==========================================================
*/

function getPublicUsers() {

  return Array
    .from(users.values())
    .map(user => ({

      id: user.id,

      username: user.username,

      verified: user.verified,

      online: user.online,

      lastSeenAt: user.lastSeenAt

    }));

}


/*
==========================================================
 TOTAL DE USUARIOS
==========================================================
*/

function countUsers() {
  return users.size;
}


/*
==========================================================
 EXPORTACIONES
==========================================================
*/

module.exports = {

  normalizePhone,

  getUserByPhone,

  upsertUser,

  verifyUser,

  setOnline,

  getPublicUsers,

  countUsers

};
