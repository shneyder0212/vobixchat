'use strict';
const crypto = require('crypto');
const users = new Map();
function createUserId(){ return crypto.randomUUID(); }
function normalizePhone(phone){ if(typeof phone!=='string') return ''; return phone.trim().replace(/[^\d+]/g,''); }
function getUserByPhone(phone){ const p=normalizePhone(phone); return p ? (users.get(p)||null) : null; }
function upsertUser({username,phone}){ const u=typeof username==='string'?username.trim():''; const p=normalizePhone(phone); if(!u) throw new Error('USERNAME_REQUIRED'); if(!p) throw new Error('PHONE_REQUIRED'); const e=users.get(p); if(e){e.username=u;e.updatedAt=Date.now();return {...e};} const now=Date.now(); const user={id:createUserId(),username:u,phone:p,verified:false,createdAt:now,updatedAt:now,lastSeenAt:null,online:false}; users.set(p,user); return {...user}; }
function verifyUser(phone){ const u=users.get(normalizePhone(phone)); if(!u)return null;u.verified=true;u.updatedAt=Date.now();return {...u}; }
function setOnline(phone,online){const u=users.get(normalizePhone(phone));if(!u)return null;u.online=Boolean(online);if(!online)u.lastSeenAt=Date.now();u.updatedAt=Date.now();return {...u};}
function getPublicUsers(){return Array.from(users.values()).map(u=>({id:u.id,username:u.username,verified:u.verified,online:u.online,lastSeenAt:u.lastSeenAt}));}
function countUsers(){return users.size;}
module.exports={normalizePhone,getUserByPhone,upsertUser,verifyUser,setOnline,getPublicUsers,countUsers};
