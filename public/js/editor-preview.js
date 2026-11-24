// =============================================================================
// Ducks Unlimited — Editor live preview (runs INSIDE the preview iframe)
// =============================================================================
// Loaded by /preview-home.html?preview=1&editor=1&brand=<slug> when the page
// sits inside the admin Design editor. Instead of reading sections from the
// database, it waits for the editor to send the page it is editing (including
// changes that aren't saved yet) and draws that. The editor half lives in
// /admin/js/editor/preview-bridge.js.
//
// It also makes the page clickable for editing:
//   - hovering a section outlines it and shows its name
//   - clicking a section tells the editor to open it
//   - links, buttons and forms do nothing here (so you can't click away)
// =============================================================================

import { renderSectionsFromData, loadRenderContext } from '/js/sections-render.js?v=20261124';

const container = document.getElementById('sections');

// Product rails (and later stores and lookbooks) need data from the database.
// We only fetch again when the page starts referring to different things —
// not on every letter typed.
let cachedKey = null;
let cachedCtx = {};
let selectedId = null;
let renderRun = 0; // makes sure an older, slower draw never wins over a newer one
let drawing = false;      // true while a draw is waiting for product data
let pendingScroll = null; // a "scroll to" that arrived during a draw

addEditorStyles();
blockNavigation();

window.addEventListener('message', async (event) => {
  // Only the editor page (same website, our parent window) may talk to us.
  if (event.origin !== location.origin) return;
  if (event.source !== window.parent) return;
  const msg = event.data || {};

  if (msg.type === 'du-editor:render') {
    await draw(msg);
  } else if (msg.type === 'du-editor:scroll-to') {
    // Mid-draw? Scroll once the draw is done, or the draw would undo it.
    if (drawing) pendingScroll = msg.id;
    else scrollToSection(msg.id);
  }
});

// Tell the editor we're ready to receive the page.
if (window.parent !== window) {
  window.parent.postMessage({ type: 'du-editor:ready' }, location.origin);
}


// ── Drawing ─────────────────────────────────────────────────────────────────

async function draw(msg) {
  drawing = true;
  try {
    await drawPage(msg);
  } finally {
    drawing = false;
    if (pendingScroll) { scrollToSection(pendingScroll); pendingScroll = null; }
  }
}

async function drawPage({ page, brandId, selectedId: sel }) {
  const run = ++renderRun;
  const sections = (page?.sections || []).map((s) => ({
    id: s.id,
    section_type: s.section_type,
    position: s.position,
    settings: s.settings || {}
  }));

  const key = contextKey(sections);
  if (key !== cachedKey) {
    try {
      cachedCtx = await loadRenderContext(sections, brandId);
      cachedKey = key;
    } catch (err) {
      console.warn('[editor-preview] could not load products:', err);
    }
  }
  if (run !== renderRun) return; // a newer change arrived while we waited

  // Keep the scroll position — redrawing shouldn't jump the page to the top.
  const y = window.scrollY;
  renderSectionsFromData(container, sections, page?.theme || null, { ...cachedCtx, editor: true });
  window.scrollTo(0, y);

  selectedId = sel || null;
  markSelected();
}

// What data this list of sections needs, as one string. Same string → the
// data we already have is still right.
function contextKey(sections) {
  const needs = new Set();
  for (const s of sections) {
    if (s.section_type === 'product-rail' && s.settings?.collection) needs.add('c:' + s.settings.collection);
    if (s.section_type === 'store-visit' && s.settings?.store_id) needs.add('s:' + s.settings.store_id);
    if (s.section_type === 'lookbook-feature' && s.settings?.lookbook_id) needs.add('l:' + s.settings.lookbook_id);
  }
  return JSON.stringify([...needs].sort());
}

function markSelected() {
  container.querySelectorAll('.is-editor-selected')
    .forEach((el) => el.classList.remove('is-editor-selected'));
  if (!selectedId) return;
  const el = findSection(selectedId);
  if (el) el.classList.add('is-editor-selected');
}

function scrollToSection(id) {
  const el = findSection(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function findSection(id) {
  return [...container.querySelectorAll('[data-editor-section-id]')]
    .find((el) => el.dataset.editorSectionId === id) || null;
}


// ── Click to edit; links don't navigate ─────────────────────────────────────

function blockNavigation() {
  // "Capture" = we see the click before the page's own code does.
  document.addEventListener('click', (e) => {
    const section = e.target.closest('[data-editor-section-id]');

    // Links and buttons anywhere (sections, nav, footer) do nothing in the editor.
    if (e.target.closest('a, button, input, select, textarea, label, summary')) {
      e.preventDefault();
    }

    if (section) {
      e.preventDefault();
      selectedId = section.dataset.editorSectionId;
      markSelected();
      window.parent.postMessage({ type: 'du-editor:select', id: selectedId }, location.origin);
    }
  }, true);

  // Forms (e.g. an email sign-up) never send in the editor.
  document.addEventListener('submit', (e) => e.preventDefault(), true);
}

function addEditorStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* Outline + name tag on the section under the mouse */
    [data-editor-section-id] { position: relative; cursor: pointer; }
    [data-editor-section-id]:hover { outline: 2px dashed #C9A84C; outline-offset: -2px; }
    [data-editor-section-id]:hover::before {
      content: attr(data-editor-section-name);
      position: absolute; top: 0; left: 0; z-index: 50;
      background: #C9A84C; color: #1A1A1A;
      font: 600 11px/1 'DM Sans', sans-serif; letter-spacing: .06em;
      text-transform: uppercase; padding: 5px 8px;
    }
    /* The section being edited keeps a solid outline */
    [data-editor-section-id].is-editor-selected { outline: 2px solid #1B4D2E; outline-offset: -2px; }
    [data-editor-section-id].is-editor-selected::before {
      content: attr(data-editor-section-name);
      position: absolute; top: 0; left: 0; z-index: 50;
      background: #1B4D2E; color: #fff;
      font: 600 11px/1 'DM Sans', sans-serif; letter-spacing: .06em;
      text-transform: uppercase; padding: 5px 8px;
    }
  `;
  document.head.appendChild(style);
}
