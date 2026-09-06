'use strict';

const DESIGNED_CONCURRENT_CONNECTIONS = 50_000;
const INTERACTIVE_ROOM_MAX_PARTICIPANTS = 1_000;

function positiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function getVideoCapacity(env = process.env) {
  const configuredConnections = positiveInteger(env.LIVEKIT_MAX_CONNECTIONS);
  const providerConfigured = Boolean(
    String(env.LIVEKIT_URL || '').trim() &&
    String(env.LIVEKIT_API_KEY || '').trim() &&
    String(env.LIVEKIT_API_SECRET || '').trim()
  );
  const capacityVerified = env.VOBIX_MEET_CAPACITY_VERIFIED === 'true';
  const enterpriseContractConfirmed = env.LIVEKIT_ENTERPRISE_CONTRACT === 'true';
  const operational = providerConfigured &&
    enterpriseContractConfirmed &&
    configuredConnections >= DESIGNED_CONCURRENT_CONNECTIONS &&
    capacityVerified;

  return Object.freeze({
    provider: 'livekit-cloud',
    designedConcurrentConnections: DESIGNED_CONCURRENT_CONNECTIONS,
    interactiveRoomMaxParticipants: INTERACTIVE_ROOM_MAX_PARTICIPANTS,
    configuredConnections,
    providerConfigured,
    enterpriseContractConfirmed,
    capacityVerified,
    operational
  });
}

module.exports = {
  DESIGNED_CONCURRENT_CONNECTIONS,
  INTERACTIVE_ROOM_MAX_PARTICIPANTS,
  getVideoCapacity
};
