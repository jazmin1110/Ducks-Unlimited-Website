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
import { SECTION_SCHEMAS, buildDefaultSettings, buildDefaultBlock } from '/js/section-schemas.js';
import { createPreviewBridge } from '/admin/js/editor/preview-bridge.js';
import {
  sectionFormHtml, fieldsHtml, applyShowIf, readFieldValue, escapeHtml
} from '/admin/js/editor/forms.js';


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
  saved:      new Map(),                    // section id → JSON of { settings, position }
  savedTheme: '',                           // JSON of the theme
  hasUnpublished: false,                    // drafts exist that aren't live yet
  dirty: false                              // changes not saved yet
};

let bridge = null;


// ── Theme fields ─────────────────────────────────────────────────────────────
// Shape mirrors what the storefront reads. Keep in sync with migration 015.
const THEME_FIELDS = [
  { id: 'brand_color',  type: 'color',  label: 'Brand color',       default: '#1B4D2E' },
  { id: 'accent_color', type: 'color',  label: 'Accent color',      default: '#C9A84C' },
  { id: 'bg_color',     type: 'color',  label: 'Background color',  default: '#F5F0E8' },
  { id: 'text_color',   type: 'color',  label: 'Text color',        default: '#1A1A1A' },
  { id: 'heading_font', type: 'text',   label: 'Heading font',      default: 'Cormorant Garamond' },
  { id: 'body_font',    type: 'text',   label: 'Body font',         default: 'DM Sans' },
];


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

  // Warn before leaving with changes that aren't saved yet.
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
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
  const theme = {};
  for (const f of THEME_FIELDS) theme[f.id] = base[f.id] ?? f.default;
  for (const [k, v] of Object.entries(base)) if (!(k in theme)) theme[k] = v;

  state.page = { sections, theme };
  state.saved = new Map(sections.map((s) => [s.id, savedKey(s)]));
  state.savedTheme = JSON.stringify(theme);
  state.hasUnpublished = (rows || []).some((r) => r.draft || r.draft_position != null) || !!themeRow?.draft;
  state.dirty = false;
  if (!sections.some((s) => s.id === state.selectedId)) state.selectedId = sections[0]?.id || null;

  renderAll();
}

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
}

function refreshPreview() {
  bridge?.render(state.page, {
    brandSlug:  state.brandSlug,
    brandId:    state.brandId,
    selectedId: state.showTheme ? null : state.selectedId
  });
}

// Left: the list of sections.
function renderList() {
  document.querySelector('[data-theme-btn]').classList.toggle('is-active', state.showTheme);

  const ul = document.querySelector('[data-section-list]');
  ul.innerHTML = '';

  const visible = state.page.sections.filter((s) => !s.settings?._removed);
  for (const s of visible) {
    const schema = SECTION_SCHEMAS[s.section_type];
    const li = document.createElement('li');
    li.dataset.sectionId = s.id;
    if (!state.showTheme && s.id === state.selectedId) li.classList.add('is-active');
    li.innerHTML = `
      <span class="section-list__name">
        ${escapeHtml(schema?.name || s.section_type)}
        <small>${escapeHtml(sectionHint(s))}</small>
      </span>
    `;
    li.addEventListener('click', () => selectSection(s.id, { scroll: true }));
    ul.appendChild(li);
  }

  if (!visible.length) {
    const li = document.createElement('li');
    li.style.cssText = 'color: var(--color-text-muted); font-style: italic; padding: 1rem; cursor: default;';
    li.textContent = 'No sections yet.';
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
    host.innerHTML = `
      <h2>Theme</h2>
      <p class="section-form__desc">Colours and fonts used by every section on the page.</p>
      ${fieldsHtml(THEME_FIELDS, state.page.theme)}
    `;
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
    if (settings && !blockId) applyShowIf(host, settings);
  });

  // Block buttons: add, move up/down, remove.
  host.addEventListener('click', (e) => {
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
  commit(page);
  return s.settings;
}

function changeTheme(fieldId, value) {
  const page = structuredClone(state.page);
  page.theme[fieldId] = value;
  commit(page);
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

// Every change ends here: keep the new page, redraw the list and preview.
function commit(page) {
  state.page = page;
  state.dirty = true;
  renderList();
  refreshPreview();
  updateStatus();
}


// ── Top bar ──────────────────────────────────────────────────────────────────
function wireTopBar() {
  document.querySelector('[data-save-draft-btn]').addEventListener('click', saveDraft);
  document.querySelector('[data-publish-btn]').addEventListener('click', publish);

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


// ── Save / Publish ───────────────────────────────────────────────────────────
// Writes every changed section's settings and order to its DRAFT, and the
// theme to the theme draft. The live site doesn't change.
// Returns true if everything saved.
async function saveDraft() {
  const btn = document.querySelector('[data-save-draft-btn]');
  btn.disabled = true;
  setStatus('Saving…');
  try {
    for (const s of state.page.sections) {
      const key = savedKey(s);
      if (state.saved.get(s.id) === key) continue; // unchanged
      const { error } = await supabase.from('page_sections')
        .update({ draft: s.settings, draft_position: s.position })
        .eq('id', s.id);
      if (error) throw error;
      state.saved.set(s.id, key);
      state.hasUnpublished = true;
    }

    const themeKey = JSON.stringify(state.page.theme);
    if (themeKey !== state.savedTheme) {
      const { error } = await supabase.from('theme_settings')
        .upsert({ brand_id: state.brandId, draft: state.page.theme }, { onConflict: 'brand_id' });
      if (error) throw error;
      state.savedTheme = themeKey;
      state.hasUnpublished = true;
    }

    state.dirty = false;
    updateStatus();
    return true;
  } catch (err) {
    console.error(err);
    alert('Save failed: ' + err.message);
    setStatus("Couldn't save", 'is-error');
    return false;
  } finally {
    btn.disabled = false;
  }
}

// Publish = save, then one database call (publish_page) that makes the whole
// draft live in one go — if anything fails, nothing on the live site changes.
async function publish() {
  if (state.dirty && !(await saveDraft())) return;
  if (!confirm(`Make these changes live on the ${state.brandName} homepage?`)) return;

  const btn = document.querySelector('[data-publish-btn]');
  btn.disabled = true;
  setStatus('Publishing…');
  try {
    const { error } = await supabase.rpc('publish_page', { p_page_key: PAGE_KEY, p_brand_id: state.brandId });
    if (error) throw error;
    await load();
    setStatus('Published ✓ ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 'is-saved');
  } catch (err) {
    console.error(err);
    alert('Publish failed: ' + err.message);
    updateStatus();
  } finally {
    btn.disabled = false;
  }
}


// ── Status ───────────────────────────────────────────────────────────────────
function updateStatus() {
  document.querySelector('[data-unpublished]').hidden = !(state.hasUnpublished || state.dirty);
  setStatus(state.dirty ? 'Not saved yet' : 'Saved ✓', state.dirty ? 'is-dirty' : 'is-saved');
}

function setStatus(text, cls = '') {
  const el = document.querySelector('[data-status]');
  if (!el) return;
  el.textContent = text;
  el.className = 'design-top__status ' + cls;
}
