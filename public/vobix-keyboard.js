'use strict';

(() => {
  const root = document.documentElement;
  const editableSelector = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea, select, [contenteditable="true"]';
  let baselineHeight = Math.max(window.innerHeight || 0, window.visualViewport?.height || 0);
  let updateFrame = 0;
  let nativeKeyboardVisible = false;
  let nativeViewportHeight = 0;

  try {
    if (navigator.virtualKeyboard) navigator.virtualKeyboard.overlaysContent = false;
  } catch (_) {}

  function activeEditable() {
    return document.activeElement?.matches?.(editableSelector) ? document.activeElement : null;
  }

  function keyboardGeometryHeight() {
    const height = Number(navigator.virtualKeyboard?.boundingRect?.height || 0);
    return Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0;
  }

  function updateViewport() {
    updateFrame = 0;
    const viewport = window.visualViewport;
    // Algunos WebView Android conservan visualViewport.height sin reducir
    // aunque innerHeight ya refleje el teclado. Elegir la menor altura válida
    // mantiene el compositor dentro del área que realmente se ve.
    let heightCandidates = [viewport?.height, window.innerHeight];
    if (nativeKeyboardVisible) heightCandidates.push(nativeViewportHeight);
    heightCandidates = heightCandidates
      .map(Number)
      .filter(height => Number.isFinite(height) && height > 0);
    const visibleHeight = Math.max(
      1,
      Math.round(heightCandidates.length ? Math.min(...heightCandidates) : baselineHeight)
    );
    const visibleWidth = Math.max(1, Math.round(viewport?.width || window.innerWidth || 1));
    const offsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
    const offsetLeft = Math.max(0, Math.round(viewport?.offsetLeft || 0));
    const geometryHeight = keyboardGeometryHeight();
    const focused = activeEditable();

    if (!focused && geometryHeight < 80) baselineHeight = Math.max(baselineHeight, visibleHeight);
    const viewportReduction = Math.max(0, baselineHeight - visibleHeight);
    const keyboardHeight = Math.max(geometryHeight, viewportReduction);
    const keyboardOpen = Boolean(focused && keyboardHeight >= 80);

    root.style.setProperty('--vobix-visual-height', `${visibleHeight}px`);
    root.style.setProperty('--vobix-visual-width', `${visibleWidth}px`);
    root.style.setProperty('--vobix-visual-top', `${offsetTop}px`);
    root.style.setProperty('--vobix-visual-left', `${offsetLeft}px`);
    root.style.setProperty('--vobix-keyboard-height', `${keyboardOpen ? keyboardHeight : 0}px`);
    root.style.setProperty('--vobix-viewport-height', `${visibleHeight}px`);
    root.style.setProperty('--vobix-viewport-top', `${offsetTop}px`);
    root.style.setProperty('--vobix-inbox-height', `${visibleHeight}px`);
    root.style.setProperty('--vobix-login-height', `${visibleHeight}px`);
    root.classList.toggle('vobixKeyboardOpen', keyboardOpen);
    root.classList.toggle('vobixKeyboardFocus', Boolean(focused));
    root.classList.toggle('vobixNativeKeyboardOpen', nativeKeyboardVisible && Boolean(focused));
    document.body?.classList.toggle('keyboardOpen', keyboardOpen);

    if (keyboardOpen && focused) {
      const rect = focused.getBoundingClientRect();
      const visibleTop = offsetTop + 8;
      const visibleBottom = offsetTop + visibleHeight - 12;
      if (rect.top < visibleTop || rect.bottom > visibleBottom) {
        focused.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      }
    }

    window.dispatchEvent(new CustomEvent('vobixviewportchange', {
      detail: { visibleHeight, visibleWidth, offsetTop, offsetLeft, keyboardHeight, keyboardOpen }
    }));
  }

  function scheduleUpdate() {
    if (updateFrame) cancelAnimationFrame(updateFrame);
    updateFrame = requestAnimationFrame(updateViewport);
  }

  window.visualViewport?.addEventListener('resize', scheduleUpdate, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('pageshow', scheduleUpdate, { passive: true });
  window.addEventListener('orientationchange', () => {
    baselineHeight = Math.max(window.innerHeight || 0, window.visualViewport?.height || 0);
    setTimeout(scheduleUpdate, 120);
    setTimeout(scheduleUpdate, 420);
  }, { passive: true });
  navigator.virtualKeyboard?.addEventListener?.('geometrychange', scheduleUpdate);
  window.addEventListener('vobix:native-keyboard', event => {
    const detail = event.detail || {};
    nativeKeyboardVisible = Boolean(detail.visible);
    nativeViewportHeight = Math.max(0, Math.round(Number(detail.viewportHeight) || 0));
    scheduleUpdate();
    setTimeout(scheduleUpdate, 80);
  });
  document.addEventListener('focusin', event => {
    if (!event.target.matches?.(editableSelector)) return;
    root.classList.add('vobixKeyboardFocus');
    scheduleUpdate();
    setTimeout(scheduleUpdate, 80);
    setTimeout(scheduleUpdate, 260);
    setTimeout(scheduleUpdate, 520);
  });
  document.addEventListener('focusout', () => {
    setTimeout(scheduleUpdate, 120);
    setTimeout(scheduleUpdate, 360);
  });

  window.VobixKeyboard = Object.freeze({ update: scheduleUpdate });
  scheduleUpdate();
})();
