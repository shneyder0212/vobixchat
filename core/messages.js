'use strict';

/*
==========================================================
 VOBIXCHAT CORE
 messages.js

 Motor interno de conversaciones y mensajes.
 Este archivo NO pertenece a /public.
==========================================================
*/

const crypto = require('crypto');


// ========================================================
// ALMACENAMIENTO TEMPORAL EN MEMORIA
// Más adelante lo conectaremos al almacenamiento persistente.
// ========================================================

const conversations = new Map();


// ========================================================
// CREAR ID ÚNICO
// ========================================================

function createId() {
  return crypto.randomUUID();
}


// ========================================================
// CREAR CONVERSACIÓN PRIVADA
// ========================================================

function createPrivateConversation(userA, userB) {

  if (!userA || !userB) {
    throw new Error('USERS_REQUIRED');
  }

  if (userA === userB) {
    throw new Error('CANNOT_CHAT_WITH_SELF');
  }

  // Evita crear dos conversaciones privadas
  // entre las mismas dos personas.

  const existing = findPrivateConversation(userA, userB);

  if (existing) {
    return existing;
  }

  const now = Date.now();

  const conversation = {

    id: createId(),

    type: 'private',

    participants: [userA, userB],

    createdAt: now,

    updatedAt: now,

    messages: []

  };

  conversations.set(conversation.id, conversation);

  return cloneConversation(conversation);
}


// ========================================================
// BUSCAR CONVERSACIÓN PRIVADA
// ========================================================

function findPrivateConversation(userA, userB) {

  for (const conversation of conversations.values()) {

    if (conversation.type !== 'private') {
      continue;
    }

    const participants = conversation.participants;

    if (
      participants.length === 2 &&
      participants.includes(userA) &&
      participants.includes(userB)
    ) {

      return cloneConversation(conversation);

    }

  }

  return null;
}


// ========================================================
// OBTENER CONVERSACIÓN
// ========================================================

function getConversation(conversationId) {

  const conversation = conversations.get(conversationId);

  if (!conversation) {
    return null;
  }

  return cloneConversation(conversation);
}


// ========================================================
// LISTAR CONVERSACIONES DE UN USUARIO
// ========================================================

function getUserConversations(userId) {

  const result = [];

  for (const conversation of conversations.values()) {

    if (conversation.participants.includes(userId)) {

      result.push(
        cloneConversation(conversation)
      );

    }

  }

  return result.sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
}


// ========================================================
// CREAR MENSAJE
// ========================================================

function createMessage({
  conversationId,
  senderId,
  text,
  encrypted = false
}) {

  const conversation =
    conversations.get(conversationId);

  if (!conversation) {
    throw new Error('CONVERSATION_NOT_FOUND');
  }

  if (!conversation.participants.includes(senderId)) {
    throw new Error('SENDER_NOT_IN_CONVERSATION');
  }

  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('MESSAGE_EMPTY');
  }

  const now = Date.now();

  const message = {

    id: createId(),

    conversationId,

    senderId,

    type: 'text',

    text: text.trim(),

    encrypted: Boolean(encrypted),

    createdAt: now,

    editedAt: null,

    deletedAt: null,

    status: 'sent',

    deliveredTo: [],

    readBy: []

  };

  conversation.messages.push(message);

  conversation.updatedAt = now;

  return {
    ...message,
    deliveredTo: [...message.deliveredTo],
    readBy: [...message.readBy]
  };
}


// ========================================================
// MARCAR MENSAJE COMO ENTREGADO
// ========================================================

function markDelivered(
  conversationId,
  messageId,
  userId
) {

  const message =
    findMessage(conversationId, messageId);

  if (!message) {
    return null;
  }

  if (!message.deliveredTo.includes(userId)) {
    message.deliveredTo.push(userId);
  }

  message.status = 'delivered';

  return cloneMessage(message);
}


// ========================================================
// MARCAR MENSAJE COMO LEÍDO
// ========================================================

function markRead(
  conversationId,
  messageId,
  userId
) {

  const message =
    findMessage(conversationId, messageId);

  if (!message) {
    return null;
  }

  if (!message.deliveredTo.includes(userId)) {
    message.deliveredTo.push(userId);
  }

  if (!message.readBy.includes(userId)) {
    message.readBy.push(userId);
  }

  message.status = 'read';

  return cloneMessage(message);
}


// ========================================================
// BUSCAR MENSAJE INTERNO
// ========================================================

function findMessage(
  conversationId,
  messageId
) {

  const conversation =
    conversations.get(conversationId);

  if (!conversation) {
    return null;
  }

  return (
    conversation.messages.find(
      message => message.id === messageId
    ) || null
  );
}


// ========================================================
// OBTENER MENSAJES
// ========================================================

function getMessages(conversationId, userId) {

  const conversation =
    conversations.get(conversationId);

  if (!conversation) {
    return [];
  }

  // Un usuario ajeno a la conversación
  // nunca recibe sus mensajes.

  if (!conversation.participants.includes(userId)) {
    return [];
  }

  return conversation.messages.map(
    cloneMessage
  );
}


// ========================================================
// COPIAS SEGURAS
// ========================================================

function cloneMessage(message) {

  return {

    ...message,

    deliveredTo: [
      ...message.deliveredTo
    ],

    readBy: [
      ...message.readBy
    ]

  };
}


function cloneConversation(conversation) {

  return {

    ...conversation,

    participants: [
      ...conversation.participants
    ],

    messages:
      conversation.messages.map(
        cloneMessage
      )

  };
}


// ========================================================
// ESTADÍSTICAS
// ========================================================

function countConversations() {
  return conversations.size;
}


function countMessages() {

  let total = 0;

  for (const conversation of conversations.values()) {
    total += conversation.messages.length;
  }

  return total;
}


// ========================================================
// EXPORTACIONES
// ========================================================

module.exports = {

  createPrivateConversation,

  findPrivateConversation,

  getConversation,

  getUserConversations,

  createMessage,

  markDelivered,

  markRead,

  getMessages,

  countConversations,

  countMessages

};