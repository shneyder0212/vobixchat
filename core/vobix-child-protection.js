'use strict';

const DAY_MINUTES = 24 * 60;

function safeMinute(value) {
  const minute = Number(value);
  return Number.isInteger(minute) && minute >= 0 && minute < DAY_MINUTES ? minute : null;
}

function validSchedule(startValue, endValue) {
  const start = safeMinute(startValue);
  const end = safeMinute(endValue);
  return start !== null && end !== null && start !== end ? { start, end } : null;
}

function isAllowedNow(schedule, date = new Date()) {
  if (!schedule) return true;
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  return schedule.start < schedule.end
    ? minute >= schedule.start && minute < schedule.end
    : minute >= schedule.start || minute < schedule.end;
}

function policyDecision({ active, blockUnknown, knownContact, emergency, schedule, now }) {
  if (emergency === true) return { allowed:true, reason:'emergency' };
  if (active !== true) return { allowed:true, reason:'inactive' };
  if (blockUnknown === true && knownContact !== true) return { allowed:false, reason:'unknown_contact' };
  if (!isAllowedNow(schedule, now)) return { allowed:false, reason:'outside_schedule' };
  return { allowed:true, reason:'allowed' };
}

module.exports = { DAY_MINUTES, isAllowedNow, policyDecision, safeMinute, validSchedule };
