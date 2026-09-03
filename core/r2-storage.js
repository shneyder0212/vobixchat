'use strict';

/*
  CAPA 4.1 — ALMACENAMIENTO PERMANENTE DE MEDIOS

  Los archivos se guardan en Cloudflare R2 si sus secretos están
  configurados en Render. Nunca se exponen claves al navegador ni a GitHub.
  Mientras se completa la configuración, VOBIXCHAT conserva la ruta local
  anterior para no interrumpir los chats existentes.
*/

const fs = require('fs');
const { Readable } = require('stream');

let S3Client;
let PutObjectCommand;
let GetObjectCommand;
let DeleteObjectCommand;

try {
  ({ S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3'));
} catch (error) {
  console.warn('VOBIXCHAT R2 | SDK no disponible todavía');
}

function configuration() {
  const accountId = String(process.env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = String(process.env.R2_BUCKET || '').trim();

  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function isConfigured() {
  const value = configuration();
  return Boolean(S3Client && value.accountId && value.accessKeyId && value.secretAccessKey && value.bucket);
}

let client = null;
let clientAccountId = '';

function getClient() {
  const value = configuration();
  if (!isConfigured()) return null;

  if (client && clientAccountId === value.accountId) return client;

  client = new S3Client({
    region: 'auto',
    endpoint: `https://${value.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: value.accessKeyId,
      secretAccessKey: value.secretAccessKey
    }
  });
  clientAccountId = value.accountId;
  return client;
}

function safeObjectKey(value) {
  const key = String(value || '').replace(/^\/+/, '');
  if (!key.startsWith('chat/') || key.includes('..')) {
    throw new Error('R2_INVALID_OBJECT_KEY');
  }
  return key;
}

async function putChatFile({ key, filePath, contentType, originalName }) {
  const r2 = getClient();
  if (!r2) return { stored: false };

  const objectKey = safeObjectKey(key);
  await r2.send(new PutObjectCommand({
    Bucket: configuration().bucket,
    Key: objectKey,
    Body: fs.createReadStream(filePath),
    ContentType: String(contentType || 'application/octet-stream').slice(0, 150),
    ContentDisposition: `inline; filename="${String(originalName || 'archivo').replace(/["\\]/g, '_').slice(0, 180)}"`,
    Metadata: { application: 'vobixchat' }
  }));
  return { stored: true, key: objectKey };
}

async function getChatFile(key) {
  const r2 = getClient();
  if (!r2) return null;
  return r2.send(new GetObjectCommand({ Bucket: configuration().bucket, Key: safeObjectKey(key) }));
}

async function deleteChatFile(key) {
  const r2 = getClient();
  if (!r2) return;
  await r2.send(new DeleteObjectCommand({ Bucket: configuration().bucket, Key: safeObjectKey(key) }));
}

function toNodeStream(body) {
  if (!body) return null;
  if (typeof body.pipe === 'function') return body;
  if (body instanceof Uint8Array) return Readable.from(body);
  return Readable.fromWeb(body);
}

module.exports = Object.freeze({ isConfigured, putChatFile, getChatFile, deleteChatFile, toNodeStream });
