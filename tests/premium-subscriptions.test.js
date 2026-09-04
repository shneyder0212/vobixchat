'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('la migración Premium es aditiva y vinculada al usuario', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS premium_subscriptions/);
  assert.match(schema, /user_id UUID PRIMARY KEY REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(schema, /CHECK \(plan IN \('free', 'premium', 'business'\)\)/);
  assert.match(schema, /CHECK \(status IN \('active', 'trialing', 'past_due', 'cancelled', 'expired'\)\)/);
});

test('cada usuario recibe un plan gratuito idempotente', () => {
  assert.match(server, /function getUserPremiumSubscription\(userId\)/);
  assert.match(server, /INSERT INTO premium_subscriptions/);
  assert.match(server, /ON CONFLICT \(user_id\) DO NOTHING/);
});

test('suscripciones no vigentes pierden permisos de pago', () => {
  assert.match(server, /row\.status === 'active' \|\| row\.status === 'trialing'/);
  assert.match(server, /\? row\.plan : 'free'/);
  assert.match(server, /getPremiumCatalog\(subscription\.plan\)/);
});
