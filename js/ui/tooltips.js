/* One tooltip portal for app-owned controls. Never traverse activity/preview
 * iframes, capitalize user content, or replace the interactive rich tooltips. */
(function (App) {
  "use strict";
  const CONTROL = 'button, [role="button"], a[aria-label]';
  const CANDIDATE = `${CONTROL}, [title], [data-tooltip], [data-ui-tooltip]`;
  const RICH = '.bubble-time, .call-viewers-eye, .member-activity-more, .member-activities, [data-sched-class-hover], [data-ui-tooltip="off"]';
  const DESCRIPTIVE = '#btn-time-display, #btn-sidebar-call-open, .me-pill-dock, .sched-preview-btn, [data-media-zoom="reset"], [data-tooltip-descriptive]';
  const PRESERVE_CASE = '[data-tooltip-preserve-case], [data-calendar-tooltip], .room-row, [data-room-row], .sidebar-call-summary, .me-pill-dock, .spotify-play, .sticker-tile, .database-toggle, [data-db-action], [data-usercode], [data-avatar-usercode], [data-sticker-id], [data-html-options-id], [data-color-swatch], .file-remove, .att-dl, .att-media, .att-video-card, .ping-item';
  const minorWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'per', 'the', 'to', 'via', 'vs']);
  const labels = new WeakMap();
  const symbols = new Map([['×', 'Close'], ['✕', 'Close'], ['✖', 'Close'], ['+', 'Add'], ['−', 'Remove'], ['…', 'More Options'], ['...', 'More Options'], ['↻', 'Refresh'], ['‹', 'Previous'], ['›', 'Next']]);
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const set = (el, name, value) => { if (el.getAttribute(name) !== value) el.setAttribute(name, value); };

  // For short application action labels only. Mixed-case names and acronyms
  // survive; content-bearing tooltips opt out or use the protected selectors.
  App.uiTitleCase = function (value) {
    const words = clean(value).split(' ');
    return words.map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && i < words.length - 1 && minorWords.has(lower)) return lower;
      return word.replace(/^([^\p{L}]*)(\p{L})/u, (_, prefix, letter) => prefix + letter.toUpperCase());
    }).join(' ');
  };

  function visibleWords(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const words = [];
    while (walker.nextNode()) {
      const node = walker.currentNode, parent = node.parentElement;
      if (!parent || !clean(node.nodeValue) || parent.closest('svg, [hidden], [aria-hidden="true"], .sr-only, .visually-hidden')) continue;
      let visible = true;
      for (let part = parent; part && el.contains(part); part = part.parentElement) {
        const style = getComputedStyle(part);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || (part !== el && parseFloat(style.width) <= 1 && style.overflow === 'hidden')) { visible = false; break; }
      }
      if (visible) words.push(node.nodeValue);
    }
    return clean(words.join(' '));
  }

  function normalize(el) {
    if (!el?.matches?.(CANDIDATE) || el.matches('iframe, object, embed') || el.closest('[contenteditable="true"], [data-user-content]')) return '';
    if (el.closest(".auth-view, .auth-notice")) {
      el.removeAttribute("title"); el.removeAttribute("data-tooltip");
      el.removeAttribute("data-ui-tooltip"); labels.delete(el); return "";
    }
    const native = clean(el.getAttribute('title'));
    const explicit = clean(el.getAttribute('data-tooltip'));
    const state = labels.get(el) || {};
    const aria = clean(el.getAttribute('aria-label'));
    if (state.aria && aria !== state.aria && explicit === state.rendered && !native) {
      for (const key of ['explicit', 'native']) if (state[key]?.toLowerCase() === state.aria.toLowerCase()) state[key] = '';
    }
    state.aria = aria;
    if (explicit && explicit !== state.rendered) { state.explicit = explicit; state.native = ''; }
    if (native) { state.native = native; state.explicit = ''; }
    labels.set(el, state);
    const isControl = el.matches(CONTROL);
    if (native) {
      if (isControl && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) set(el, 'aria-label', native);
      el.removeAttribute('title');
    }
    // Dismiss controls and message content need no hover explanation. Keep
    // accessible names and nested download/playback actions independently usable.
    const closeAction = isControl && (el.matches('#btn-modal-close, #btn-cancel-edit, .file-remove') || /^(?:close|dismiss)\b/i.test(aria || explicit || native) || el.matches('.modal-close:not(.sticker-save-action):not([aria-label*="Expand"]):not([aria-label*="Chat"]), .overlay-close, .file-remove, .user-profile-close, .voice-close, .chat-popup-close, .reply-bar-close') && /close|dismiss|remove/i.test(aria || explicit || native));
    const contentSurface = el.matches('.att-item, .att-file, .att-media, .att-media-card, .att-video-card, .sticker-message') || (!!el.closest('.att-item, .sticker-message') && !isControl && !el.closest('.att-dl'));
    if (closeAction || contentSurface) {
      el.removeAttribute('data-tooltip'); el.removeAttribute('data-ui-tooltip');
      labels.delete(el);
      return '';
    }
    if (el.matches(RICH)) return '';
    const text = isControl ? visibleWords(el) : '';
    const letterIcon = /^[A-Za-z]$/.test(text) && clean(el.getAttribute('aria-label')).toLowerCase() !== text.toLowerCase();
    const hasWords = /[\p{L}\p{N}]/u.test(text) && !symbols.has(text) && !letterIcon;
    if (isControl && hasWords && !el.matches(DESCRIPTIVE)) {
      el.removeAttribute('data-tooltip');
      el.removeAttribute('data-ui-tooltip');
      return '';
    }
    let label = state.explicit || state.native || (isControl ? aria : '');
    if (!label && isControl) {
      label = clean(el.querySelector('svg title')?.textContent || el.querySelector('img[alt]')?.getAttribute('alt')) || symbols.get(text) || '';
    }
    if (!label) return '';
    const content = !isControl || el.matches(PRESERVE_CASE) || el.matches('#btn-time-display') || /[.!?](?:\s|$)|\n/.test(label);
    if (!content) label = App.uiTitleCase(label);
    if (isControl && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) set(el, 'aria-label', label);
    state.rendered = label;
    set(el, 'data-tooltip', label);
    set(el, 'data-ui-tooltip', 'on');
    return label;
  }

  App.refreshTooltips = function (root = document) {
    if (root.nodeType === 1) normalize(root);
    root.querySelectorAll?.(CANDIDATE).forEach(normalize);
  };

  // All tooltips should have the same hover and unhover animation. Allow both
  // transitions to paint before hiding a surface, including rapid re-entry.
  const hideTimers = new WeakMap();
  App.setTooltipVisible = function (surface, visible, visibleClass = 'is-visible') {
    clearTimeout(hideTimers.get(surface));
    hideTimers.delete(surface);
    if (visible) {
      if (surface.hidden) {
        surface.hidden = false;
        void surface.offsetWidth;
      }
      surface.classList.add(visibleClass);
    } else {
      surface.classList.remove(visibleClass);
      if (surface.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) surface.hidden = true;
      else hideTimers.set(surface, setTimeout(() => { surface.hidden = true; hideTimers.delete(surface); }, 130));
    }
  };

  App.register('ui/tooltips', function initializeTooltips() {
    const tip = document.createElement('div');
    tip.id = 'sidebar-tooltip';
    tip.className = 'sidebar-tooltip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    let anchor = null;
    let source = 'pointer';
    function hide() {
      if (anchor) {
        const ids = (anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tip.id);
        if (ids.length) anchor.setAttribute('aria-describedby', ids.join(' ')); else anchor.removeAttribute('aria-describedby');
      }
      anchor = null;
      tip.classList.remove('is-visible');
    }
    App.hideAppTooltip = hide;
    function show(target, trigger = source) {
      if (document.body.dataset.mode !== "chat") return hide();
      const hit = target?.closest?.(`[data-calendar-tooltip], ${CONTROL}, [data-ui-tooltip]`);
      if (!hit || !hit.isConnected || hit.closest('[hidden], [inert]') || hit.matches(RICH) || !hit.getClientRects().length) return hide();
      const calendar = hit.hasAttribute('data-calendar-tooltip');
      if (calendar && hit.scrollWidth <= hit.clientWidth && hit.scrollHeight <= hit.clientHeight) return hide();
      const label = calendar ? hit.getAttribute('data-tooltip') : normalize(hit);
      if (!label) return hide();
      if (anchor !== hit) hide();
      anchor = hit; source = trigger;
      tip.classList.toggle('calendar-full-note-tooltip', calendar);
      if (tip.textContent !== label) tip.textContent = label;
      const ids = new Set((hit.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      ids.add(tip.id); set(hit, 'aria-describedby', [...ids].join(' '));
      const rect = hit.getBoundingClientRect(), bounds = tip.getBoundingClientRect(), viewport = window.visualViewport;
      const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
      const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
      let left = rect.left + (rect.width - bounds.width) / 2, top = rect.top - bounds.height - 9;
      if (top < y + 8) top = rect.bottom + 9;
      left = Math.max(x + 8, Math.min(left, x + width - bounds.width - 8));
      top = Math.max(y + 8, Math.min(top, y + height - bounds.height - 8));
      tip.style.left = `${Math.round(left)}px`; tip.style.top = `${Math.round(top)}px`;
      tip.classList.add('is-visible');
    }
    App.showAppTooltip = show;
    document.addEventListener('pointerover', event => { if (event.pointerType !== 'touch') show(event.target, 'pointer'); });
    document.addEventListener('pointerout', event => { if (source === 'pointer' && anchor && !anchor.contains(event.relatedTarget)) hide(); });
    document.addEventListener('focusin', event => { if (event.target.matches?.(':focus-visible')) show(event.target, 'focus'); });
    document.addEventListener('focusout', event => { if (anchor && !anchor.contains(event.relatedTarget)) hide(); });
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('pointercancel', hide, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
    document.addEventListener('scroll', hide, { passive: true, capture: true });
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', hide);
    window.addEventListener('resize', () => { hide(); App.refreshTooltips(); }, { passive: true });
    window.visualViewport?.addEventListener('resize', hide, { passive: true });
    window.visualViewport?.addEventListener('scroll', hide, { passive: true });
    App.refreshTooltips();
    const pending = new Set();
    let scheduled = false;
    const enqueue = node => { if (node?.nodeType === 1 && !tip.contains(node)) pending.add(node); };
    // Reconcile only changed subtrees, rather than rescanning the app whenever
    // a chat timestamp or live status changes. Own writes are idempotent.
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'childList') record.addedNodes.forEach(enqueue);
        enqueue(record.target.nodeType === 1 ? record.target.closest(CONTROL) || (record.type === 'attributes' ? record.target : null) : record.target.parentElement?.closest(CONTROL));
      }
      if (scheduled || (!pending.size && !anchor)) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const changes = [...pending]; pending.clear();
        changes.forEach(node => { if (node.isConnected) App.refreshTooltips(node); });
        if (anchor) show(anchor);
      });
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'data-tooltip', 'aria-label', 'hidden', 'aria-hidden'] });
  });
})(globalThis.ChatApp);
