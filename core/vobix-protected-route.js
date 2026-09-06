'use strict';

const EARTH_RADIUS_M = 6371000;

function safeCoordinate(latitude, longitude, accuracy) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const acc = Number(accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return {
    latitude: Number(lat.toFixed(5)),
    longitude: Number(lon.toFixed(5)),
    accuracy: Number.isFinite(acc) && acc >= 0 ? Math.min(10000, Math.round(acc)) : null
  };
}

function distanceMetres(a, b) {
  if (!a || !b) return Infinity;
  const toRad = value => Number(value) * Math.PI / 180;
  const dLat = toRad(Number(b.latitude) - Number(a.latitude));
  const dLon = toRad(Number(b.longitude) - Number(a.longitude));
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

function safeExpectedAt(value, now = Date.now()) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= now + 5 * 60 * 1000 && time <= now + 24 * 60 * 60 * 1000
    ? new Date(time)
    : null;
}

function safeDestinationLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

module.exports = { safeCoordinate, distanceMetres, safeExpectedAt, safeDestinationLabel };
