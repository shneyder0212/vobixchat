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

async function communicationDecision(database, firstUserId, secondUserId, now = new Date()) {
  const result = await database.query(
    `SELECT child_user_id,guardian_user_id,block_unknown,allowed_from_minute,allowed_until_minute
     FROM child_protection_profiles WHERE status='active' AND child_user_id IN ($1,$2)`,
    [firstUserId, secondUserId]
  );
  for (const profile of result.rows) {
    const childId=String(profile.child_user_id);
    const otherId=childId===String(firstUserId)?String(secondUserId):String(firstUserId);
    let knownContact=String(profile.guardian_user_id)===otherId;
    if(!knownContact){
      const contact=await database.query(`SELECT 1 FROM child_allowed_contacts WHERE child_user_id=$1 AND contact_user_id=$2 LIMIT 1`,[childId,otherId]);
      knownContact=contact.rows.length>0;
    }
    const schedule=profile.allowed_from_minute==null||profile.allowed_until_minute==null?null:{start:Number(profile.allowed_from_minute),end:Number(profile.allowed_until_minute)};
    const decision=policyDecision({active:true,blockUnknown:profile.block_unknown===true,knownContact,schedule,now});
    if(!decision.allowed)return decision;
  }
  return {allowed:true,reason:'allowed'};
}

module.exports = { DAY_MINUTES, communicationDecision, isAllowedNow, policyDecision, safeMinute, validSchedule };
