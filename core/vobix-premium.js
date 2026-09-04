'use strict';

const PLAN_ORDER = Object.freeze({ free: 0, premium: 1, business: 2 });

const PLANS = Object.freeze([
  Object.freeze({
    id: 'free',
    name: 'Vobix Gratis',
    rank: PLAN_ORDER.free,
    billingEnabled: false
  }),
  Object.freeze({
    id: 'premium',
    name: 'Vobix Plus',
    rank: PLAN_ORDER.premium,
    billingEnabled: false,
    promise: 'Más almacenamiento, traducción avanzada y herramientas de IA.'
  }),
  Object.freeze({
    id: 'business',
    name: 'Vobix Business',
    rank: PLAN_ORDER.business,
    billingEnabled: false
  })
]);

const CAPABILITIES = Object.freeze([
  Object.freeze({ id: 'chat', name: 'VobixChat personal', minimumPlan: 'free', status: 'active', advertisingInPrivateChats:false }),
  Object.freeze({ id: 'plus-storage', name: 'Almacenamiento ampliado', minimumPlan: 'premium', status: 'preparation' }),
  Object.freeze({ id: 'plus-translation', name: 'Traducción avanzada', minimumPlan: 'premium', status: 'preparation' }),
  Object.freeze({ id: 'plus-ai', name: 'Herramientas de IA', minimumPlan: 'premium', status: 'preparation' }),
  Object.freeze({ id: 'meet', name: 'Vobix Meet Pro', minimumPlan: 'premium', status: 'preparation' }),
  Object.freeze({ id: 'remote', name: 'Vobix Remote', minimumPlan: 'premium', status: 'preparation' }),
  Object.freeze({ id: 'verify-sign', name: 'Vobix Verify Sign', minimumPlan: 'premium', status: 'legal-design' }),
  Object.freeze({ id: 'politics', name: 'Vobix Política', minimumPlan: 'premium', status: 'preparation' }),
  Object.freeze({ id: 'trade', name: 'Vobix Trade', minimumPlan: 'premium', status: 'regulated-design', isolated:true, riskControlsRequired:true }),
  Object.freeze({ id: 'business', name: 'Vobix Business', minimumPlan: 'business', status: 'preparation', features:['catalog','bookings','invoices','multi-agent','analytics'] })
]);

const COMMERCIAL_PRINCIPLES = Object.freeze({
  privateChatPrice:'free',
  advertisingInPrivateChats:false,
  sellPrivateConversationData:false,
  billingEnabled:false,
  premiumActivation:'explicit-user-consent',
  tradeIsolation:'separate-service-and-data-boundary'
});

function normalizePlan(plan) {
  const value = String(plan || '').trim().toLowerCase();
  return Object.hasOwn(PLAN_ORDER, value) ? value : 'free';
}

function planAllows(plan, minimumPlan) {
  return PLAN_ORDER[normalizePlan(plan)] >= PLAN_ORDER[normalizePlan(minimumPlan)];
}

function capabilityAccess(capability, plan = 'free') {
  const entitled = planAllows(plan, capability.minimumPlan);
  const operational = capability.status === 'active';
  return {
    ...capability,
    entitled,
    operational,
    available: entitled && operational,
    reason: !entitled
      ? 'plan_required'
      : operational
        ? null
        : 'service_not_operational'
  };
}

function getCapabilityAccess(capabilityId, plan = 'free') {
  const id = String(capabilityId || '').trim().toLowerCase();
  const capability = CAPABILITIES.find(item => item.id === id);
  return capability ? capabilityAccess(capability, plan) : null;
}

function isConfigurableCapability(capabilityId) {
  const access = getCapabilityAccess(capabilityId, 'business');
  return !!access && access.id !== 'chat';
}

function getPremiumCatalog(plan = 'free') {
  const normalizedPlan = normalizePlan(plan);
  return {
    billingEnabled: false,
    principles: { ...COMMERCIAL_PRINCIPLES },
    currentPlan: normalizedPlan,
    plans: PLANS.map(item => ({ ...item })),
    capabilities: CAPABILITIES.map(item => capabilityAccess(item, normalizedPlan))
  };
}

module.exports = {
  CAPABILITIES,
  COMMERCIAL_PRINCIPLES,
  PLANS,
  capabilityAccess,
  getCapabilityAccess,
  getPremiumCatalog,
  isConfigurableCapability,
  normalizePlan,
  planAllows
};
