'use strict';

(() => {
  const TOKEN_KEYS = ['vobix_token', 'token', 'vobixToken', 'authToken', 'accessToken'];

  function getToken() {
    for (const key of TOKEN_KEYS) {
      const value = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (value) return value;
    }
    return '';
  }

  function authHeaders(extra = {}) {
    const token = getToken();
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra
    };
  }

  function isMobileDevice() {
    const ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  }

  function urlBase64ToUint8Array(value) {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
  }

  async function registerPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    if (!getToken()) return;

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      // VOBIXCHAT envía notificaciones Push únicamente al móvil.
      // Si Edge/Chrome de escritorio tenía una suscripción antigua, la borramos.
      if (!isMobileDevice()) {
        const oldSubscription = await registration.pushManager.getSubscription();

        if (oldSubscription) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ endpoint: oldSubscription.endpoint })
          }).catch(() => {});

          await oldSubscription.unsubscribe().catch(() => {});
        }

        return;
      }

      const keyResponse = await fetch('/api/push/public-key', {
        headers: authHeaders(),
        cache: 'no-store'
      });

      if (!keyResponse.ok) return;
      const keyData = await keyResponse.json();
      if (!keyData?.ok || !keyData.publicKey) return;

      // El navegador exige que el usuario conceda permiso. No forzamos prompts repetidos.
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
      }
      if (Notification.permission !== 'granted') return;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
        });
      }

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ subscription })
      });
    } catch (error) {
      console.warn('[VOBIX PUSH]', error?.message || error);
    }
  }

  async function unregisterPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager?.getSubscription();
      if (!subscription) return;

      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        credentials: 'same-origin',
        signal: AbortSignal.timeout?.(5000),
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ endpoint: subscription.endpoint })
      }).catch(() => {});

      await subscription.unsubscribe().catch(() => {});
    } catch (error) {
      console.warn('[VOBIX PUSH LOGOUT]', error?.message || error);
    }
  }

  window.addEventListener('load', () => {
    setTimeout(registerPush, 800);
  }, { once: true });

  window.VobixPush = Object.freeze({
    register: registerPush,
    unregister: unregisterPush
  });
})();
