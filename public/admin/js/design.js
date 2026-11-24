// =============================================================================
// Ducks Unlimited — Admin Design editor (controller)
// =============================================================================
// Powers /admin/design.html — a Shopify-style editor for the homepage:
//
//   Left:   Theme + the list of sections
//   Middle: the real homepage in an <iframe>, redrawn as you type
//   Right:  the settings form for whatever is selected
//
// The page being edited lives in memory as `state.page`:
//   { sections: [{ id, section_type, position, settings, isNew }], theme }
// (see /admin/js/editor/page-state.js). Nothing changes on the live website
// until someone presses Publish.
//
// Helpers this file uses:
//   /admin/js/editor/preview-bridge.js → talks to the preview iframe
//   /admin/js/editor/forms.js          → builds the settings forms
//   /js/section-schemas.js             → what settings each section type has
//
// Guardrails:
//   - Only signed-in admins get in (requireAdmin).
//   - Edits one brand at a time: the brand picked in the admin nav. "All
//     brands" edits Ducks Unlimited. Sections shared by both brands are
//     not shown — every section belongs to exactly one brand.
// =============================================================================

import { supabase } from '/lib/supabase.js';
import { requireAdmin } from '/admin/js/admin-guard.js';
import { getAdminBrandSlug } from '/js/brand.js';
import {
  SECTION_SCHEMAS, buildDefaultSettings, buildDefaultBlock, listSectionTypes
} from '/js/section-schemas.js';
import { createPreviewBridge } from '/admin/js/editor/preview-bridge.js';
import { createHistory } from '/admin/js/editor/history.js';
import { createAutosave } from '/admin/js/editor/autosave.js';
import { mountRichText } from '/admin/js/editor/richtext.js';
import { openVersionsPanel } from '/admin/js/editor/versions.js';
import {
  moveSection, duplicateSection, setHidden, markRemoved, unmarkRemoved, addSection, canPublish,
  restoreSnapshot
} from '/admin/js/editor/page-state.js';
import {
  sectionFormHtml, themeFormHtml, applyShowIf, readFieldValue, escapeHtml
} from '/admin/js/editor/forms.js';
import { HEADING_FONTS, BODY_FONTS } from '/js/theme-fonts.js';


const PAGE_KEY = 'home';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  brandId:   null,
  brandSlug: null,
  brandName: '',
  page:      { sections: [], theme: {} },  // what the editor shows right now
  selectedId: null,                         // the section open on the right
  showTheme:  false,                        // true → right panel shows the theme form
  // What the database holds, so we only save what changed:
  themeDefaults: {},                        // colours "Reset to brand default" goes back to
  saved:      new Map(),                    // section id → JSON of { settings, position }
  savedTheme: '',                           // JSON of the theme
  hasUnpublished: false,                    // drafts exist that aren't live yet
  previewSnapshot: null,                    // a saved version shown in the preview (History)
  saveStatus: 'saved',                      // 'saving' | 'saved' | 'error' (from autosave)
  versionTime: null                         // when this page was last published, as of opening
};

let bridge = null;
// Undo / redo memory for this visit (see /admin/js/editor/history.js).
const history = createHistory();


// ── Theme defaults ───────────────────────────────────────────────────────────
// What a theme setting is when nothing has been chosen. These are the Ducks
// Unlimited brand colours and fonts. "Reset to brand default" uses them for
// Ducks Unlimited; for another brand (Rocwood) it uses that brand's colours
// as they are live now — see load().
const THEME_DEFAULTS = {
  brand_color:  '#1B4D2E',
  accent_color: '#C9A84C',
  bg_color:     '#F5F0E8',
  text_color:   '#1A1A1A',
  heading_font: HEADING_FONTS[0],   // Cormorant Garamond
  body_font:    BODY_FONTS[0],      // DM Sans
  button_shape: 'rounded'
};
const COLOUR_KEYS = ['brand_color', 'accent_color', 'bg_color', 'text_color'];


// ── Boot ─────────────────────────────────────────────────────────────────────
(async function boot() {
  // Only signed-in admins get past this line (see /admin/js/admin-guard.js)
  await requireAdmin();

  // Which brand are we editing? The admin nav's brand picker decides.
  const slug = getAdminBrandSlug();
  state.brandSlug = (slug === 'all') ? 'du' : slug;

  const { data: brand, error: bErr } = await supabase
    .from('brands').select('id, name').eq('slug', state.brandSlug).maybeSingle();
  if (bErr || !brand) { alert('Could not find brand: ' + state.brandSlug); return; }
  state.brandId   = brand.id;
  state.brandName = brand.name;
  document.querySelector('[data-editor-title]').textContent = `${brand.name} · Homepage`;

  // The live preview in the middle.
  const iframe = document.querySelector('[data-preview-frame]');
  bridge = createPreviewBridge(iframe, {
    // Clicking a section in the preview opens it on the right.
    onSelect: (id) => selectSection(id, { scroll: false })
  });
  iframe.src = `/preview-home.html?preview=1&editor=1&brand=${encodeURIComponent(state.brandSlug)}`;

  wireTopBar();
  wireForm();
  wireList();
  wirePicker();
  wireShortcuts();

  // Warn before leaving with changes that aren't saved yet.
  window.addEventListener('beforeunload', (e) => {
    if (autosave.hasPending()) { e.preventDefault(); e.returnValue = ''; }
  });

  await load();
})().catch((err) => {
  console.error('[design] boot failed:', err);
  alert('The Design editor could not load. Please refresh the page. If it keeps happening, check your internet connection.');
});


// ── Load the page from the database ──────────────────────────────────────────
async function load() {
  const [{ data: rows, error }, { data: themeRow, error: tErr }] = await Promise.all([
    supabase
      .from('page_sections')
      .select('id, section_type, position, draft_position, published, draft')
      .eq('page_key', PAGE_KEY)
      .eq('brand_id', state.brandId)   // this brand only — never shared sections
      .is('deleted_at', null)
      .order('position', { ascending: true }),
    supabase
      .from('theme_settings')
      .select('published, draft')
      .eq('brand_id', state.brandId)
      .maybeSingle()
  ]);
  if (error) { console.error(error); alert('Load failed: ' + error.message); return; }
  if (tErr) console.warn('[design] theme load:', tErr.message);

  // Each section shows its draft if there is one, otherwise what's live.
  // The order is the draft order if one was saved, otherwise the live order.
  const sections = (rows || []).map((row) => ({
    id: row.id,
    section_type: row.section_type,
    position: row.draft_position ?? row.position,
    settings: structuredClone(row.draft || row.published || buildDefaultSettings(row.section_type)),
    isNew: false
  })).sort((a, b) => a.position - b.position);

  // Theme: draft, else live, with defaults for anything missing.
  const base = themeRow?.draft || themeRow?.published || {};
  const theme = { ...THEME_DEFAULTS, ...base };

  // "Reset to brand default" colours: Ducks Unlimited → the brand palette;
  // any other brand → its colours as they are live now (if it has any).
  state.themeDefaults = { ...THEME_DEFAULTS };
  if (state.brandSlug !== 'du') {
    for (const k of COLOUR_KEYS) {
      if (themeRow?.published?.[k]) state.themeDefaults[k] = themeRow.published[k];
    }
  }

  state.page = { sections, theme };
  state.saved = new Map(sections.map((s) => [s.id, savedKey(s)]));
  state.savedTheme = JSON.stringify(theme);
  state.hasUnpublished = (rows || []).some((r) => r.draft || r.draft_position != null) || !!themeRow?.draft;
  // Remember the newest published version, to spot someone else publishing.
  state.versionTime = await latestVersionTime();
  if (!sections.some((s) => s.id === state.selectedId)) state.selectedId = sections[0]?.id || null;

  history.reset(state.page);
  renderAll();
}

// A new section now has a row in the database. Undo history may still hold
// copies of it marked isNew, so we fix those too: undoing must never try to
// create the same row twice.
function markSaved(id) {
  const s = state.page.sections.find((x) => x.id === id);
  if (s) s.isNew = false;
  savedNewIds.add(id);
}
const savedNewIds = new Set();

// What we compare to decide whether a section needs saving.
function savedKey(section) {
  return JSON.stringify({ settings: section.settings, position: section.position });
}


// ── Drawing the three panels ─────────────────────────────────────────────────
function renderAll() {
  renderList();
  renderForm();
  refreshPreview();
  updateStatus();
  updateUndoButtons();
}

function refreshPreview() {
  // History → Preview shows a saved version instead of the draft.
  if (state.previewSnapshot) {
    bridge?.render({ sections: state.previewSnapshot.sections || [], theme: state.previewSnapshot.theme || state.page.theme }, {
      brandSlug: state.brandSlug, brandId: state.brandId, selectedId: null
    });
    return;
  }
  bridge?.render(state.page, {
    brandSlug:  state.brandSlug,
    brandId:    state.brandId,
    selectedId: state.showTheme ? null : state.selectedId
  });
}

// Left: the list of sections. Each row:
//   ⠿ drag handle · name + headline · 👁 hide/show · ⋯ menu
// Removed sections aren't listed (they go away for real on Publish).
function renderList() {
  document.querySelector('[data-theme-btn]').classList.toggle('is-active', state.showTheme);

  const ul = document.querySelector('[data-section-list]');
  ul.innerHTML = '';

  const visible = state.page.sections.filter((s) => !s.settings?._removed);
  visible.forEach((s, i) => {
    const schema = SECTION_SCHEMAS[s.section_type];
    const hidden = !!s.settings?._hidden;
    const li = document.createElement('li');
    li.dataset.sectionId = s.id;
    if (!state.showTheme && s.id === state.selectedId) li.classList.add('is-active');
    if (hidden) li.classList.add('is-hidden');
    li.innerHTML = `
      <span class="section-list__drag" title="Drag to reorder" aria-hidden="true">⠿</span>
      <span class="section-list__name">
        ${escapeHtml(schema?.name || s.section_type)}${hidden ? '<span class="tag-hidden">Hidden</span>' : ''}
        <small>${escapeHtml(sectionHint(s))}</small>
      </span>
      <button type="button" class="section-list__icon-btn" data-row-action="toggle-hidden"
              title="${hidden ? 'Show on the website' : 'Hide from the website'}"
              aria-label="${hidden ? 'Show section' : 'Hide section'}" aria-pressed="${hidden}">${hidden ? '🙈' : '👁'}</button>
      <details class="row-menu">
        <summary title="More" aria-label="More actions">⋯</summary>
        <div class="row-menu__items">
          <button type="button" data-row-action="duplicate">Duplicate</button>
          <button type="button" data-row-action="up"   ${i === 0 ? 'disabled' : ''}>Move up</button>
          <button type="button" data-row-action="down" ${i === visible.length - 1 ? 'disabled' : ''}>Move down</button>
          <button type="button" data-row-action="remove">Remove</button>
        </div>
      </details>
    `;
    ul.appendChild(li);
  });

  if (!visible.length) {
    const li = document.createElement('li');
    li.style.cssText = 'color: var(--color-text-muted); font-style: italic; padding: 1rem; cursor: default;';
    li.textContent = 'No sections yet. Add one below.';
    ul.appendChild(li);
  }
}

// Under each section's name we show its own headline (e.g. "New Arrivals"),
// so two sections of the same kind are easy to tell apart.
function sectionHint(sec) {
  const text = sec.settings?.heading || sec.settings?.headline || '';
  const plain = String(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > 34 ? plain.slice(0, 33) + '…' : plain;
}

// Open a section on the right (from the list or from a click in the preview).
function selectSection(id, { scroll }) {
  if (!state.page.sections.some((s) => s.id === id)) return;
  state.selectedId = id;
  state.showTheme = false;
  renderList();
  renderForm();
  refreshPreview();
  if (scroll) bridge?.scrollTo(id);
}

// Right: the settings form.
function renderForm() {
  const host = document.querySelector('[data-section-form]');

  if (state.showTheme) {
    host.innerHTML = themeFormHtml(state.page.theme, state.themeDefaults, {
      headingFonts: HEADING_FONTS,
      bodyFonts: BODY_FONTS
    });
    return;
  }

  const s = selectedSection();
  if (!s) {
    host.innerHTML = `<div class="section-form__empty">Click a section in the list or in the preview to edit it.</div>`;
    return;
  }
  const schema = SECTION_SCHEMAS[s.section_type];
  if (!schema) {
    host.innerHTML = `<div class="section-form__empty">This section type (${escapeHtml(s.section_type)}) can't be edited here.</div>`;
    return;
  }
  host.innerHTML = sectionFormHtml(schema, s.settings);
  mountRichTextFields(host, s);
}

// Put a formatting toolbar + text box in every rich-text spot of the form.
function mountRichTextFields(host, section) {
  host.querySelectorAll('[data-richtext]').forEach((spot) => {
    const fieldId = spot.dataset.richtext;
    const blockId = spot.dataset.richtextBlock || null;
    const value = blockId
      ? (section.settings.blocks || []).find((b) => b.id === blockId)?.[fieldId]
      : section.settings[fieldId];
    mountRichText(spot, {
      value: value || '',
      singleLine: spot.hasAttribute('data-single-line'),
      onChange: (html) => changeSection(section.id, fieldId, html, blockId)
    });
  });
}

function selectedSection() {
  return state.page.sections.find((x) => x.id === state.selectedId) || null;
}


// ── Changes from the form ────────────────────────────────────────────────────
// One listener for the whole right panel (the form inside is redrawn often).
function wireForm() {
  const host = document.querySelector('[data-section-form]');

  host.addEventListener('input', (e) => {
    const input = e.target.closest('[data-field-id]');
    if (!input) return;
    const fieldId = input.dataset.fieldId;
    const kind    = input.dataset.fieldKind;
    const blockId = input.dataset.blockId || null;
    const value   = readFieldValue(input, kind);

    const settings = state.showTheme
      ? changeTheme(fieldId, value)
      : changeSection(state.selectedId, fieldId, value, blockId);

    // Small live touches inside the form itself.
    const field = input.closest('.field');
    if (kind === 'range') {
      const label = field?.querySelector('[data-range-label]');
      if (label) label.textContent = value;
    }
    if (kind === 'image') {
      const img = field?.querySelector('[data-image-preview]');
      if (img) img.src = value || '';
    }
    if (kind === 'color' && state.showTheme) {
      const hex = field?.querySelector('.colour-row__hex');
      if (hex) hex.textContent = value;
      const reset = field?.querySelector('[data-theme-reset]');
      if (reset) reset.disabled = String(value).toLowerCase() === String(state.themeDefaults[fieldId]).toLowerCase();
    }
    if (settings && !blockId) applyShowIf(host, settings);
  });

  // Leaving a field ends its typing "group": the next typing there is a
  // new undo step.
  host.addEventListener('focusout', () => history.endGroup());

  // Block buttons: add, move up/down, remove.
  host.addEventListener('click', (e) => {
    // Theme: "Reset to brand default" for one colour.
    const reset = e.target.closest('[data-theme-reset]');
    if (reset && state.showTheme) {
      changeTheme(reset.dataset.themeReset, state.themeDefaults[reset.dataset.themeReset]);
      history.endGroup();
      renderForm();
      return;
    }
    const btn = e.target.closest('[data-block-action]');
    if (!btn || state.showTheme) return;
    blockAction(btn.dataset.blockAction, btn.dataset.blockId);
  });
}

// Change one setting of one section (or of one block inside it).
// Returns the section's new settings.
function changeSection(sectionId, fieldId, value, blockId = null) {
  const page = structuredClone(state.page);
  const s = page.sections.find((x) => x.id === sectionId);
  if (!s) return null;
  if (blockId) {
    const block = (s.settings.blocks || []).find((b) => b.id === blockId);
    if (!block) return null;
    block[fieldId] = value;
  } else {
    s.settings[fieldId] = value;
  }
  commit(page, `${sectionId}.${blockId || ''}.${fieldId}`);
  return s.settings;
}

function changeTheme(fieldId, value) {
  const page = structuredClone(state.page);
  page.theme[fieldId] = value;
  commit(page, `theme.${fieldId}`);
  return page.theme;
}

function blockAction(action, blockId) {
  const page = structuredClone(state.page);
  const s = page.sections.find((x) => x.id === state.selectedId);
  if (!s) return;
  const blocks = s.settings.blocks || (s.settings.blocks = []);
  const max = SECTION_SCHEMAS[s.section_type]?.blocks?.max || 0;

  if (action === 'add') {
    if (max && blocks.length >= max) return;
    blocks.push(buildDefaultBlock(s.section_type));
  } else {
    const i = blocks.findIndex((b) => b.id === blockId);
    if (i < 0) return;
    if (action === 'remove') blocks.splice(i, 1);
    if (action === 'up'   && i > 0)                 [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]];
    if (action === 'down' && i < blocks.length - 1) [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]];
  }
  commit(page);
  renderForm();
}

// Every change ends here: remember it for Undo, keep the new page, redraw
// the list and preview, and (from the next step on) save it automatically.
//   groupKey → for typing: changes to the same field close together
//              become ONE undo step (see history.js)
function commit(page, groupKey = null) {
  // Editing while looking at an old version → show the draft again.
  if (state.previewSnapshot) {
    state.previewSnapshot = null;
    document.querySelector('[data-preview-note]').hidden = true;
  }
  state.page = page;
  history.record(page, groupKey);
  renderList();
  refreshPreview();
  updateStatus();
  updateUndoButtons();
  scheduleSave();
}

// Save automatically ~2 seconds after the last change.
function scheduleSave() {
  autosave.schedule();
  updateStatus();
}


// ── List actions: drag, hide, duplicate, move, remove ────────────────────────
function wireList() {
  const ul = document.querySelector('[data-section-list]');

  // Clicks on a row: an action button, or anywhere else = select it.
  ul.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-section-id]');
    if (!li) return;
    const id = li.dataset.sectionId;
    const actionBtn = e.target.closest('[data-row-action]');
    if (actionBtn) { rowAction(actionBtn.dataset.rowAction, id); return; }
    if (e.target.closest('details')) return; // opening the ⋯ menu
    selectSection(id, { scroll: true });
  });

  // Close an open ⋯ menu when clicking anywhere else.
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.row-menu[open]').forEach((d) => {
      if (!d.contains(e.target)) d.open = false;
    });
  });

  // Drag to reorder — only by the ⠿ handle (SortableJS, loaded in design.html).
  if (window.Sortable) {
    window.Sortable.create(ul, {
      handle: '.section-list__drag',
      animation: 150,
      onEnd: (evt) => {
        if (evt.oldIndex === evt.newIndex) return;
        const movedId = evt.item.dataset.sectionId;
        const nextId  = evt.item.nextElementSibling?.dataset.sectionId || null;
        reorder(movedId, nextId);
      }
    });
  }
}

// Put section `movedId` just before `nextId` (or after the last listed
// section when nextId is null). Removed sections aren't listed, so we work
// with ids rather than list positions.
function reorder(movedId, nextId) {
  const from = state.page.sections.findIndex((s) => s.id === movedId);
  if (from < 0) return;
  const rest = state.page.sections.filter((s) => s.id !== movedId);
  let to;
  if (nextId) {
    to = rest.findIndex((s) => s.id === nextId);
  } else {
    // After the last section that is still listed (not removed).
    let lastListed = -1;
    rest.forEach((s, i) => { if (!s.settings?._removed) lastListed = i; });
    to = lastListed + 1;
  }
  if (to < 0) return;
  commit(moveSection(state.page, from, to));
}

function rowAction(action, id) {
  document.querySelectorAll('.row-menu[open]').forEach((d) => { d.open = false; });
  const listed = state.page.sections.filter((s) => !s.settings?._removed);
  const pos = listed.findIndex((s) => s.id === id);
  const section = listed[pos];
  if (!section) return;

  if (action === 'toggle-hidden') {
    commit(setHidden(state.page, id, !section.settings?._hidden));
  } else if (action === 'duplicate') {
    if (listed.length >= 25) { alert('A page can have at most 25 sections.'); return; }
    const newId = crypto.randomUUID();
    commit(duplicateSection(state.page, id, newId));
    selectSection(newId, { scroll: true });
  } else if (action === 'up' || action === 'down') {
    const neighbour = listed[action === 'up' ? pos - 1 : pos + 1];
    if (!neighbour) return;
    // Moving down = putting it before the section after the neighbour.
    const nextId = action === 'up' ? neighbour.id : (listed[pos + 2]?.id || null);
    reorder(id, nextId);
  } else if (action === 'remove') {
    commit(markRemoved(state.page, id));
    if (state.selectedId === id) {
      const remaining = state.page.sections.filter((s) => !s.settings?._removed);
      state.selectedId = (remaining[pos] || remaining[pos - 1])?.id || null;
      renderList(); renderForm(); refreshPreview();
    }
    showToast('Section removed.', 'Undo', () => {
      commit(unmarkRemoved(state.page, id));
      selectSection(id, { scroll: true });
    });
  }
}


// ── "Add section" picker ─────────────────────────────────────────────────────
function wirePicker() {
  const dialog = document.querySelector('[data-picker]');
  const grid   = document.querySelector('[data-picker-grid]');

  // One card per section type: picture, name, one-line description.
  grid.innerHTML = listSectionTypes().map((t) => `
    <button type="button" class="picker__card" data-add-type="${escapeHtml(t.type)}">
      <img src="/admin/images/sections/${escapeHtml(t.type)}.svg" alt="" loading="lazy"
           onerror="this.style.visibility='hidden'">
      <strong>${escapeHtml(t.name)}</strong>
      <span>${escapeHtml(t.description || '')}</span>
    </button>
  `).join('');

  document.querySelector('[data-add-section]').addEventListener('click', () => dialog.showModal());
  document.querySelector('[data-picker-close]').addEventListener('click', () => dialog.close());
  // Clicking the dark area around the picker closes it.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('[data-add-type]');
    if (!card) return;
    dialog.close();
    addNewSection(card.dataset.addType);
  });
}

// New sections go right after the selected one (or at the end) and open
// straight away. They exist only in the draft until Publish.
function addNewSection(type) {
  const section = {
    id: crypto.randomUUID(),
    section_type: type,
    position: 0,
    settings: buildDefaultSettings(type),
    isNew: true
  };
  const afterId = state.showTheme ? null : state.selectedId;
  try {
    commit(addSection(state.page, section, afterId));
  } catch (err) {
    alert(err.message); // "A page can have at most 25 sections."
    return;
  }
  selectSection(section.id, { scroll: true });
}


// ── Undo / redo ──────────────────────────────────────────────────────────────
function undo() { applyHistory(history.undo()); }
function redo() { applyHistory(history.redo()); }

function applyHistory(page) {
  if (!page) return;
  state.page = page;
  // The selected section may not exist (or be removed) in that version.
  const listed = page.sections.filter((s) => !s.settings?._removed);
  if (!listed.some((s) => s.id === state.selectedId)) state.selectedId = listed[0]?.id || null;
  renderAll();
  scheduleSave();
}

function updateUndoButtons() {
  document.querySelector('[data-undo]').disabled = !history.canUndo();
  document.querySelector('[data-redo]').disabled = !history.canRedo();
}

// Ctrl/Cmd+Z = undo, Shift+Ctrl/Cmd+Z or Ctrl+Y = redo.
// While typing in a box outside the settings panel (e.g. the browser's own
// search), we leave the keys alone.
function wireShortcuts() {
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    const isUndo = key === 'z' && !e.shiftKey;
    const isRedo = (key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey);
    if (!isUndo && !isRedo) return;

    const el = document.activeElement;
    const typing = el && (el.matches('input, textarea, select, [contenteditable="true"]'));
    if (typing && !el.closest('[data-section-form]')) return;

    e.preventDefault();
    if (isUndo) undo(); else redo();
  });
}


// ── Toast ────────────────────────────────────────────────────────────────────
// A short message at the bottom, with an optional button (e.g. Undo).
let toastTimer = null;
function showToast(text, actionLabel = null, onAction = null, ms = 8000) {
  const el = document.querySelector('[data-toast]');
  el.innerHTML = `<span>${escapeHtml(text)}</span>${actionLabel ? `<button type="button">${escapeHtml(actionLabel)}</button>` : ''}`;
  el.hidden = false;
  if (actionLabel) {
    el.querySelector('button').addEventListener('click', () => {
      el.hidden = true;
      clearTimeout(toastTimer);
      onAction?.();
    });
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}


// ── History (saved versions) ─────────────────────────────────────────────────
function openHistory() {
  openVersionsPanel({
    pageKey: PAGE_KEY,
    brandId: state.brandId,
    onPreview: (snapshot) => showVersionInPreview(snapshot),
    onRestore: (snapshot) => {
      showVersionInPreview(null);
      // Sections deleted since that version come back as new sections.
      const page = restoreSnapshot(state.page, snapshot, () => crypto.randomUUID());
      commit(page); // one Undo step; saved as a draft — live only after Publish
      const listed = page.sections.filter((s) => !s.settings?._removed);
      if (!listed.some((s) => s.id === state.selectedId)) state.selectedId = listed[0]?.id || null;
      renderForm();
      renderList();
      showToast('Version restored as your draft. Press Publish to make it live.');
    },
    onClose: () => showVersionInPreview(null)
  });
}

// Show a saved version in the preview (snapshot), or go back to the draft (null).
function showVersionInPreview(snapshot) {
  state.previewSnapshot = snapshot;
  document.querySelector('[data-preview-note]').hidden = !snapshot;
  refreshPreview();
}


// ── Top bar ──────────────────────────────────────────────────────────────────
function wireTopBar() {
  document.querySelector('[data-publish-btn]').addEventListener('click', publish);
  document.querySelector('[data-undo]').addEventListener('click', undo);
  document.querySelector('[data-history-btn]').addEventListener('click', openHistory);
  document.querySelector('[data-preview-back]').addEventListener('click', () => showVersionInPreview(null));
  document.querySelector('[data-redo]').addEventListener('click', redo);

  document.querySelector('[data-theme-btn]').addEventListener('click', () => {
    state.showTheme = !state.showTheme;
    renderList();
    renderForm();
    refreshPreview();
  });

  // Phone / desktop preview.
  document.querySelectorAll('[data-device]').forEach((btn) => {
    btn.addEventListener('click', () => {
      bridge?.setDevice(btn.dataset.device);
      document.querySelectorAll('[data-device]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
    });
  });
}


// ── Save (automatic) / Publish ───────────────────────────────────────────────
// Writes every changed section's settings and order to its DRAFT, and the
// theme to the theme draft. The live site doesn't change. Called by autosave
// (/admin/js/editor/autosave.js) about 2 seconds after the last change; if it
// fails (no internet), autosave keeps the changes and tries again.
// Throws on any error so autosave knows to retry.
async function saveDraft() {
  for (const s of state.page.sections) {
    const key = savedKey(s);
    if (state.saved.get(s.id) === key) continue; // unchanged

    if (s.isNew && !savedNewIds.has(s.id)) {
      // Added (or duplicated) and removed again before ever being saved:
      // nothing to keep.
      if (s.settings?._removed) continue;
      // A brand-new section: create its row. `published` stays empty, so
      // the live site can't show it until Publish. Its live `position` is
      // set far down so it can never collide; Publish uses draft_position.
      const { error } = await supabase.from('page_sections').insert({
        id: s.id,
        page_key: PAGE_KEY,
        brand_id: state.brandId,
        section_type: s.section_type,
        position: 100000 + s.position,
        draft_position: s.position,
        published: null,
        draft: s.settings
      });
      if (error) throw error;
      markSaved(s.id);
    } else {
      const { error } = await supabase.from('page_sections')
        .update({ draft: s.settings, draft_position: s.position })
        .eq('id', s.id);
      if (error) throw error;
    }
    state.saved.set(s.id, key);
    state.hasUnpublished = true;
  }

  // Sections saved earlier that are no longer on the page at all (e.g. an
  // "Add" that was undone): mark them removed in the draft, so they don't
  // come back next time and Publish clears them away.
  const onPage = new Set(state.page.sections.map((s) => s.id));
  for (const [id, key] of state.saved) {
    if (onPage.has(id)) continue;
    const { settings, position } = JSON.parse(key);
    if (settings?._removed) continue;
    const draft = { ...settings, _removed: true };
    const { error } = await supabase.from('page_sections').update({ draft }).eq('id', id);
    if (error) throw error;
    state.saved.set(id, JSON.stringify({ settings: draft, position }));
  }

  const themeKey = JSON.stringify(state.page.theme);
  if (themeKey !== state.savedTheme) {
    const { error } = await supabase.from('theme_settings')
      .upsert({ brand_id: state.brandId, draft: state.page.theme }, { onConflict: 'brand_id' });
    if (error) throw error;
    state.savedTheme = themeKey;
    state.hasUnpublished = true;
  }
}

const autosave = createAutosave({
  save: saveDraft,
  onStatus: (status) => {
    state.saveStatus = status;
    if (status === 'error') console.warn('[design] autosave failed — will retry');
    updateStatus();
  }
});

// Publish = save anything left, then ONE database call (publish_page) that
// makes the whole draft live in one go. If anything fails, nothing on the
// live site changes.
let publishing = false;
async function publish() {
  if (publishing) return; // a second click while the first is still going
  publishing = true;
  const btn = document.querySelector('[data-publish-btn]');
  btn.disabled = true;
  try {
    // An empty homepage can't be published.
    const check = canPublish(state.page);
    if (!check.ok) { alert(check.message); return; }

    // Save whatever hasn't been saved yet.
    try {
      await autosave.flushNow();
    } catch {
      alert("Your latest changes couldn't be saved, so nothing was published. Check your internet connection and try again.");
      return;
    }

    // Did someone else publish this page since this editor was opened?
    const newest = await latestVersionTime();
    if (newest && state.versionTime && newest > state.versionTime) {
      const when = new Date(newest).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (!confirm(`Someone else published this page at ${when}. Publishing now will replace their changes. Publish anyway?`)) return;
    }

    if (!confirm(`Make these changes live on the ${state.brandName} homepage?`)) return;

    setStatus('Publishing…');
    const { error } = await supabase.rpc('publish_page', { p_page_key: PAGE_KEY, p_brand_id: state.brandId });
    if (error) {
      alert('Publish failed: ' + error.message);
      updateStatus();
      return;
    }
    await load(); // fresh from the database; also resets Undo
    setStatus('Published ✓ ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 'is-saved');
  } finally {
    publishing = false;
    btn.disabled = false;
  }
}

// When this page was last published (newest saved version), or null.
async function latestVersionTime() {
  const { data, error } = await supabase
    .from('page_versions')
    .select('published_at')
    .eq('page_key', PAGE_KEY)
    .eq('brand_id', state.brandId)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.warn('[design] version check:', error.message); return null; }
  return data?.published_at || null;
}


// ── Status ───────────────────────────────────────────────────────────────────
// Left of Publish: "Saving…" / "Saved ✓" / "Couldn't save — retrying", and an
// "Unpublished changes" badge whenever the draft differs from the live site.
function updateStatus() {
  const pending = autosave.hasPending();
  document.querySelector('[data-unpublished]').hidden = !(state.hasUnpublished || pending);

  if (state.saveStatus === 'error')       setStatus("Couldn't save — retrying", 'is-error');
  else if (state.saveStatus === 'saving') setStatus('Saving…');
  else if (pending)                       setStatus('Saving…');
  else                                    setStatus('Saved ✓', 'is-saved');
}

function setStatus(text, cls = '') {
  const el = document.querySelector('[data-status]');
  if (!el) return;
  el.textContent = text;
  el.className = 'design-top__status ' + cls;
}
