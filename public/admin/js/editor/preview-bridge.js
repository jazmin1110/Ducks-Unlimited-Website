// =============================================================================
// Ducks Unlimited — Editor ↔ preview messenger (editor side)
// =============================================================================
// The middle of the editor is an <iframe> showing the real homepage. The two
// pages can't call each other's code directly, so they send each other
// small messages with window.postMessage():
//
//   preview → editor  { type: 'du-editor:ready' }           "I've loaded"
//   editor  → preview { type: 'du-editor:render', page, … }  "draw this"
//   editor  → preview { type: 'du-editor:scroll-to', id }   "show this section"
//   preview → editor  { type: 'du-editor:select', id }      "they clicked this"
//
// Safety: both sides only accept messages from the same website address
// (location.origin), so another site can't send fake messages.
// The other half lives in /js/editor-preview.js (inside the iframe).
//
//   const bridge = createPreviewBridge(iframeEl, {
//     onSelect: (id) => { ...select that section in the list... },
//     onReady:  () => { ... }
//   });
//   bridge.render(page, { brandSlug, brandId, selectedId });  // after each change
//   bridge.scrollTo(sectionId);
//   bridge.setDevice('phone');   // or 'desktop'
// =============================================================================

export function createPreviewBridge(iframe, { onSelect = () => {}, onReady = () => {} } = {}) {
  let ready   = false;  // has the preview said "I've loaded"?
  let latest  = null;   // the last "draw this" message, re-sent if the preview reloads
  let timer   = null;
  let pendingScroll = null; // a scroll asked for while a redraw is waiting

  window.addEventListener('message', (event) => {
    // Only listen to our own preview iframe, on our own website.
    if (event.origin !== location.origin) return;
    if (event.source !== iframe.contentWindow) return;
    const msg = event.data || {};

    if (msg.type === 'du-editor:ready') {
      ready = true;
      if (latest) post(latest); // draw straight away if we already have a page
      onReady();
    } else if (msg.type === 'du-editor:select' && typeof msg.id === 'string') {
      onSelect(msg.id);
    }
    // Any other message type is ignored.
  });

  // If the iframe reloads, the new page says "ready" again and we re-send
  // the latest page then. (We don't reset `ready` on the iframe's "load"
  // event: the preview often says "ready" BEFORE that event fires, which
  // would leave the preview blank.)

  function post(msg) {
    iframe.contentWindow?.postMessage(msg, location.origin);
  }

  return {
    // Redraw the preview. Called after every change, so it waits 150ms for
    // typing to pause — the preview then redraws once, not once per letter.
    render(page, { brandSlug, brandId, selectedId = null } = {}) {
      latest = { type: 'du-editor:render', page, brandSlug, brandId, selectedId };
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!ready) return;
        post(latest);
        // Scroll AFTER the redraw, or the redraw would undo it.
        if (pendingScroll) { post({ type: 'du-editor:scroll-to', id: pendingScroll }); pendingScroll = null; }
      }, 150);
    },

    // Scroll the preview so this section is in view.
    scrollTo(id) {
      if (!id) return;
      if (timer) { pendingScroll = id; return; } // a redraw is about to happen
      if (ready) post({ type: 'du-editor:scroll-to', id });
    },

    // Phone = 390px wide (a typical phone), Desktop = full width.
    setDevice(device) {
      const stage = iframe.closest('[data-preview-stage]') || iframe.parentElement;
      stage.classList.toggle('is-phone', device === 'phone');
    }
  };
}
