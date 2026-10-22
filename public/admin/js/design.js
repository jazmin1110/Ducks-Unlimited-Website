// =============================================================================
// Ducks Unlimited — Admin Design page controller
// =============================================================================
// Powers /admin/design.html — a Shopify-style page builder.
//
// What the admin can do:
//   - Pick which page to edit (page selector; currently just "home").
//   - See every section in order on the left.
//   - Reorder sections with the ↑ / ↓ buttons.
//   - Delete a section (soft-delete).
//   - Add a new section from the type picker.
//   - Click a section to edit its fields on the right (form generated from
//     the schema in /js/section-schemas.js — no hand-written forms).
//   - Save Draft (writes to the `draft` JSONB column).
//   - Publish (copies draft → published atomically).
//
// Guardrails:
//   - Requires an authenticated session; otherwise bounces to /admin/.
//   - Scoped to the current brand (admin-nav brand filter). "all" is treated
//     as "du" for editing so we never mutate someone's brand by accident.
//   - Dirty state is tracked locally; Save Draft commits it.
// =============================================================================

import { supabase } from '/lib/supabase.js';
import { requireAdmin } from '/admin/js/admin-guard.js';
import { getAdminBrandSlug } from '/js/brand.js';
import {
  SECTION_SCHEMAS,
  buildDefaultSettings,
  buildDefaultBlock,
  listSectionTypes
} from '/js/section-schemas.js';


// ── State ────────────────────────────────────────────────────────────────────
const state = {
  pageKey:  'home',
  brandId:  null,
  brandSlug: null,
  sections: [],              // [{ id, section_type, position, published, draft, deleted_at, _settings }]
  selectedId: null,
  dirty:    false,
  // When "theme" is selected, the right pane shows the global theme form
  // instead of a section form. Theme settings have their own dirty/save path.
  showTheme: false,
  theme:    { brand_id: null, published: null, draft: null, _settings: {} },
};


// ── Theme defaults ──────────────────────────────────────────────────────────
// Shape mirrors what sections-render.js reads. Keep in sync with migration 015.
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
  // Auth gate
  // Only signed-in admins get past this line (see /admin/js/admin-guard.js)
  await requireAdmin();

  // Resolve the brand we're editing. The admin nav's brand filter is the
  // source of truth; "all" falls back to Ducks for editing (we need to pick
  // a brand to attach new sections to).
  const slug = getAdminBrandSlug();
  state.brandSlug = (slug === 'all') ? 'du' : slug;

  const { data: brand, error: bErr } = await supabase
    .from('brands').select('id, name').eq('slug', state.brandSlug).maybeSingle();
  if (bErr || !brand) { alert('Could not find brand: ' + state.brandSlug); return; }
  state.brandId = brand.id;

  // Paint small brand label in the sections header
  const brandLabel = document.querySelector('[data-brand-label]');
  if (brandLabel) brandLabel.textContent = brand.name;

  // Point the Preview button at the brand we're editing (?brand= is read by
  // /js/brand.js), otherwise it would show whichever brand was browsed last.
  const previewBtn = document.querySelector('[data-preview-btn]');
  if (previewBtn) previewBtn.href = `/preview-home.html?preview=1&brand=${encodeURIComponent(state.brandSlug)}`;

  // Populate the "Add section" picker from the schema registry
  const addSel = document.querySelector('[data-add-section]');
  for (const t of listSectionTypes()) {
    const opt = document.createElement('option');
    opt.value = t.type;
    opt.textContent = t.name;
    addSel.appendChild(opt);
  }

  // Wire the top bar
  document.querySelector('[data-save-draft-btn]').addEventListener('click', saveDraft);
  document.querySelector('[data-publish-btn]').addEventListener('click', publish);
  document.querySelector('[data-add-section]').addEventListener('change', onAddSection);
  document.querySelector('[data-page-select]').addEventListener('change', (e) => {
    state.pageKey = e.target.value;
    load();
  });

  // Warn before navigating away with unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // Theme toggle button (opens the theme form in the right pane)
  const themeBtn = document.querySelector('[data-theme-btn]');
  if (themeBtn) themeBtn.addEventListener('click', () => {
    state.showTheme = !state.showTheme;
    renderList();
    if (state.showTheme) renderThemeForm(); else renderForm();
  });

  await load();
  await loadTheme();
})().catch((err) => {
  console.error('[design] boot failed:', err);
  alert('The Homepage editor could not load. Please refresh the page. If it keeps happening, check your internet connection.');
});


// ── Load sections for the current page+brand ─────────────────────────────────
async function load() {
  const { data, error } = await supabase
    .from('page_sections')
    .select('id, page_key, brand_id, section_type, position, published, draft, deleted_at')
    .eq('page_key', state.pageKey)
    .is('deleted_at', null)
    .or(`brand_id.eq.${state.brandId},brand_id.is.null`)
    .order('position', { ascending: true });

  if (error) { console.error(error); alert('Load failed: ' + error.message); return; }

  // Materialise an editable `_settings` on each row = draft || published.
  // The admin edits _settings; Save Draft writes it to the `draft` column.
  state.sections = (data || []).map((row) => ({
    ...row,
    _settings: structuredClone(row.draft || row.published || buildDefaultSettings(row.section_type))
  }));

  state.selectedId = state.sections[0]?.id || null;
  state.dirty = false;
  deletedIds.clear();          // forget removals that were never saved
  renderList();
  renderForm();
  updateStatus();
}


// ── Left column: section list ────────────────────────────────────────────────
function renderList() {
  const ul = document.querySelector('[data-section-list]');
  ul.innerHTML = '';

  // Highlight the Theme button when the theme form is being edited.
  const themeBtn = document.querySelector('[data-theme-btn]');
  if (themeBtn) themeBtn.classList.toggle('is-active', state.showTheme);

  state.sections.forEach((s, idx) => {
    const schema = SECTION_SCHEMAS[s.section_type];
    const li = document.createElement('li');
    if (!state.showTheme && s.id === state.selectedId) li.classList.add('is-active');
    li.setAttribute('draggable', 'true');
    li.dataset.sectionId = s.id;

    li.innerHTML = `
      <span class="section-list__drag" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
      <span class="section-list__name">
        ${escapeHtml(schema?.name || s.section_type)}
        <small>${s.brand_id ? '' : 'global · '}${escapeHtml(s.section_type)}</small>
      </span>
      <button class="section-list__icon-btn" title="Move up"   data-move="up">↑</button>
      <button class="section-list__icon-btn" title="Move down" data-move="down">↓</button>
      <button class="section-list__icon-btn" title="Delete"    data-delete>🗑</button>
    `;

    li.addEventListener('click', (e) => {
      // Clicks on inner buttons don't select; only the row body does.
      if (e.target.closest('button')) return;
      state.selectedId = s.id;
      state.showTheme = false;
      renderList(); renderForm();
    });
    li.querySelector('[data-move="up"]').addEventListener('click', () => move(idx, -1));
    li.querySelector('[data-move="down"]').addEventListener('click', () => move(idx, +1));
    li.querySelector('[data-delete]').addEventListener('click', () => removeSection(s.id));

    // HTML5 drag & drop. We just track the dragged id and reorder on drop.
    li.addEventListener('dragstart', (e) => {
      dragFromId = s.id;
      li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      // Firefox needs some data for dragstart to fire; the value doesn't matter.
      try { e.dataTransfer.setData('text/plain', s.id); } catch {}
    });
    li.addEventListener('dragend',   () => li.classList.remove('is-dragging'));
    li.addEventListener('dragover',  (e) => { e.preventDefault(); li.classList.add('is-drop-target'); });
    li.addEventListener('dragleave', () => li.classList.remove('is-drop-target'));
    li.addEventListener('drop',      (e) => {
      e.preventDefault();
      li.classList.remove('is-drop-target');
      if (!dragFromId || dragFromId === s.id) return;
      dropOnto(dragFromId, s.id);
      dragFromId = null;
    });

    ul.appendChild(li);
  });

  if (!state.sections.length) {
    const li = document.createElement('li');
    li.style.cssText = 'color: var(--color-text-muted); font-style: italic; padding: 1rem; cursor: default;';
    li.textContent = 'No sections yet. Add one below.';
    ul.appendChild(li);
  }
}

function move(idx, delta) {
  const next = idx + delta;
  if (next < 0 || next >= state.sections.length) return;
  const arr = state.sections;
  [arr[idx], arr[next]] = [arr[next], arr[idx]];
  restampPositions();
  markDirty();
  renderList();
}

// Drag-and-drop helper: move the row with id `fromId` to the slot of `toId`,
// placing it before `toId`. State: dragFromId tracked across the list.
let dragFromId = null;
function dropOnto(fromId, toId) {
  const arr = state.sections;
  const fromIdx = arr.findIndex((s) => s.id === fromId);
  const toIdx   = arr.findIndex((s) => s.id === toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
  const [moved] = arr.splice(fromIdx, 1);
  // After the splice, the target's index may have shifted left by one.
  const insertAt = arr.findIndex((s) => s.id === toId);
  arr.splice(insertAt, 0, moved);
  restampPositions();
  markDirty();
  renderList();
}

function restampPositions() {
  // Re-stamp positions in 10's so later inserts don't collide.
  state.sections.forEach((s, i) => { s.position = (i + 1) * 10; });
}

function removeSection(id) {
  // Heads-up: removing is saved with "Save Draft" and takes the section off
  // the live site right away (it doesn't wait for Publish). Until you save,
  // reloading the page brings it back.
  if (!confirm('Remove this section?\n\nIt will disappear from the live site as soon as you click Save Draft. Until then, reloading this page undoes it.')) return;
  state.sections = state.sections.filter((s) => s.id !== id);
  if (state.selectedId === id) state.selectedId = state.sections[0]?.id || null;
  // Track the deletion so saveDraft can soft-delete it in the DB.
  deletedIds.add(id);
  markDirty();
  renderList();
  renderForm();
}
const deletedIds = new Set();

async function onAddSection(e) {
  const type = e.target.value;
  if (!type) return;
  e.target.value = '';

  // Create a row in the DB immediately so we have a stable UUID.
  // Admins expect the new section to appear right away and to survive refresh.
  const maxPos = Math.max(0, ...state.sections.map((s) => s.position));
  const draft  = buildDefaultSettings(type);
  const { data, error } = await supabase
    .from('page_sections')
    .insert({
      page_key: state.pageKey,
      brand_id: state.brandId,
      section_type: type,
      position: maxPos + 10,
      draft
    })
    .select('id, page_key, brand_id, section_type, position, published, draft, deleted_at')
    .single();

  if (error) { alert('Add failed: ' + error.message); return; }

  state.sections.push({ ...data, _settings: structuredClone(draft) });
  state.selectedId = data.id;
  // Not dirty — this was already written to the DB (as a draft).
  renderList();
  renderForm();
  flashStatus('Section added (draft).');
}


// ── Theme loader + form ──────────────────────────────────────────────────────
async function loadTheme() {
  const { data, error } = await supabase
    .from('theme_settings')
    .select('brand_id, published, draft')
    .eq('brand_id', state.brandId)
    .maybeSingle();
  if (error) { console.warn('[design] theme load:', error.message); }

  // Materialise editable _settings = draft || published || all-defaults.
  const base = (data?.draft || data?.published) || {};
  const merged = {};
  for (const f of THEME_FIELDS) merged[f.id] = base[f.id] ?? f.default;

  state.theme = {
    brand_id:  state.brandId,
    published: data?.published || null,
    draft:     data?.draft     || null,
    _settings: merged,
    _exists:   !!data
  };
}

function renderThemeForm() {
  const host = document.querySelector('[data-section-form]');
  host.innerHTML = `
    <h2>Theme settings</h2>
    <p class="section-form__desc">Colors and fonts that apply across every section. Edits save together with the page's sections.</p>
    ${THEME_FIELDS.map((f) => fieldHtml(f, state.theme._settings[f.id])).join('')}
  `;
  host.querySelectorAll('[data-field-id]').forEach((input) => {
    const id = input.dataset.fieldId;
    const kind = input.dataset.fieldKind;
    input.addEventListener('input', () => {
      state.theme._settings[id] = readFieldValue(input, kind);
      markDirty();
    });
  });
}


// ── Right column: section form ───────────────────────────────────────────────
function renderForm() {
  const host = document.querySelector('[data-section-form]');
  const s = state.sections.find((x) => x.id === state.selectedId);
  if (!s) {
    host.innerHTML = `<div class="section-form__empty">Select a section on the left to edit its content.</div>`;
    return;
  }

  const schema = SECTION_SCHEMAS[s.section_type];
  if (!schema) {
    host.innerHTML = `<div class="section-form__empty">Unknown section type: ${escapeHtml(s.section_type)}</div>`;
    return;
  }

  host.innerHTML = `
    <h2>${escapeHtml(schema.name)}</h2>
    <p class="section-form__desc">${escapeHtml(schema.description || '')}</p>
    ${schema.settings.map((f) => fieldHtml(f, s._settings[f.id])).join('')}
    ${schema.blocks ? blocksHtml(schema.blocks, s._settings.blocks || []) : ''}
  `;

  // Wire inputs
  host.querySelectorAll('[data-field-id]').forEach((input) => {
    const id = input.dataset.fieldId;
    const kind = input.dataset.fieldKind;
    input.addEventListener('input', () => {
      s._settings[id] = readFieldValue(input, kind);
      // Live range value label
      if (kind === 'range') {
        const label = host.querySelector(`[data-range-label-for="${id}"]`);
        if (label) label.textContent = s._settings[id];
      }
      // Live image preview
      if (kind === 'image') {
        const prev = host.querySelector(`[data-image-preview-for="${id}"]`);
        if (prev) prev.src = s._settings[id] || '';
      }
      markDirty();
    });
  });

  // Blocks: Add, Remove, Reorder
  host.querySelectorAll('[data-block-action]').forEach((btn) => {
    btn.addEventListener('click', () => blockAction(s, btn));
  });

  // Per-block field inputs
  host.querySelectorAll('[data-block-field]').forEach((input) => {
    const blockId = input.dataset.blockId;
    const fieldId = input.dataset.blockField;
    const kind    = input.dataset.fieldKind;
    input.addEventListener('input', () => {
      const block = s._settings.blocks.find((b) => b.id === blockId);
      if (!block) return;
      block[fieldId] = readFieldValue(input, kind);
      if (kind === 'image') {
        const prev = host.querySelector(`[data-image-preview-for="${blockId}:${fieldId}"]`);
        if (prev) prev.src = block[fieldId] || '';
      }
      markDirty();
    });
  });
}

function fieldHtml(f, value, idPrefix = '', labelKey = null) {
  const v = value ?? '';
  const id = idPrefix + f.id;
  const common = `data-field-id="${id}" data-field-kind="${f.type}"${labelKey ? ` data-block-field="${f.id}" data-block-id="${labelKey}"` : ''}`;
  let input = '';

  switch (f.type) {
    case 'text':
    case 'url':
      input = `<input type="${f.type === 'url' ? 'url' : 'text'}" value="${escapeAttr(v)}" ${common}>`;
      break;
    case 'textarea':
      input = `<textarea ${common}>${escapeHtml(v)}</textarea>`;
      break;
    case 'richtext':
      input = `<textarea ${common} placeholder="HTML allowed (e.g. <br>, <em>)">${escapeHtml(v)}</textarea>`;
      break;
    case 'image':
      input = `
        <input type="url" value="${escapeAttr(v)}" placeholder="https://..." ${common}>
        <img data-image-preview-for="${labelKey ? labelKey + ':' + f.id : f.id}" src="${escapeAttr(v)}" class="field__image-preview" alt=""
             onerror="this.style.display='none'" onload="this.style.display='block'">
      `;
      break;
    case 'color':
      input = `<input type="color" value="${escapeAttr(v || '#000000')}" ${common}>`;
      break;
    case 'number':
      input = `<input type="number" value="${escapeAttr(v)}" ${common}>`;
      break;
    case 'range':
      input = `
        <input type="range" min="${f.min ?? 0}" max="${f.max ?? 100}" step="${f.step ?? 1}" value="${escapeAttr(v || f.min || 0)}" ${common}>
        <span class="field__range-value" data-range-label-for="${id}">${escapeHtml(v || f.min || 0)}</span>${f.unit ? `<span class="field__range-value">${escapeHtml(f.unit)}</span>` : ''}
      `;
      break;
    case 'select': {
      const opts = (f.options || []).map((o) =>
        `<option value="${escapeAttr(o.value)}"${o.value === v ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
      ).join('');
      input = `<select ${common}>${opts}</select>`;
      break;
    }
    case 'toggle':
      input = `<input type="checkbox" ${v ? 'checked' : ''} ${common}>`;
      break;
    default:
      input = `<input type="text" value="${escapeAttr(v)}" ${common}>`;
  }

  return `
    <div class="field">
      <label>${escapeHtml(f.label)}</label>
      ${input}
    </div>
  `;
}

function blocksHtml(blocksSchema, blocks) {
  const canAdd = !blocksSchema.max || blocks.length < blocksSchema.max;
  return `
    <div class="blocks">
      <div class="blocks__head">
        <h3>${escapeHtml(blocksSchema.name)}s (${blocks.length}${blocksSchema.max ? ' / ' + blocksSchema.max : ''})</h3>
        <button type="button" class="btn-secondary" data-block-action="add" ${canAdd ? '' : 'disabled'}>+ Add ${escapeHtml(blocksSchema.name)}</button>
      </div>
      ${blocks.map((b, i) => `
        <div class="block">
          <div class="block__head">
            <span class="block__title">${escapeHtml(blocksSchema.name)} ${i + 1}</span>
            <span class="block__controls">
              <button type="button" title="Move up"   data-block-action="up"     data-block-id="${b.id}">↑</button>
              <button type="button" title="Move down" data-block-action="down"   data-block-id="${b.id}">↓</button>
              <button type="button" title="Remove"    data-block-action="remove" data-block-id="${b.id}">🗑</button>
            </span>
          </div>
          ${blocksSchema.settings.map((f) => fieldHtml(f, b[f.id], '', b.id)).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

function blockAction(section, btn) {
  const action  = btn.dataset.blockAction;
  const blockId = btn.dataset.blockId;
  const blocks  = section._settings.blocks || (section._settings.blocks = []);

  if (action === 'add') {
    blocks.push(buildDefaultBlock(section.section_type));
  } else {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx < 0) return;
    if (action === 'remove') blocks.splice(idx, 1);
    if (action === 'up'   && idx > 0)                [blocks[idx-1], blocks[idx]] = [blocks[idx], blocks[idx-1]];
    if (action === 'down' && idx < blocks.length-1)  [blocks[idx+1], blocks[idx]] = [blocks[idx], blocks[idx+1]];
  }

  markDirty();
  renderForm();
}

function readFieldValue(input, kind) {
  if (kind === 'toggle') return !!input.checked;
  if (kind === 'number' || kind === 'range') return input.value === '' ? '' : Number(input.value);
  return input.value;
}


// ── Save / Publish ───────────────────────────────────────────────────────────
// Returns true if everything saved, false if something failed.
async function saveDraft() {
  const btn = document.querySelector('[data-save-draft-btn]');
  btn.disabled = true;
  setStatus('Saving…');
  try {
    // Soft-delete any rows the admin removed.
    for (const id of deletedIds) {
      const { error } = await supabase.from('page_sections')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    }
    deletedIds.clear();

    // Upsert each remaining section's draft + position.
    for (const s of state.sections) {
      const { error } = await supabase.from('page_sections')
        .update({ draft: s._settings, position: s.position })
        .eq('id', s.id);
      if (error) throw error;
      s.draft = s._settings;
    }

    // Save the theme draft too. Upsert so the row is created on first save.
    {
      const { error } = await supabase.from('theme_settings')
        .upsert({ brand_id: state.brandId, draft: state.theme._settings }, { onConflict: 'brand_id' });
      if (error) throw error;
      state.theme.draft = state.theme._settings;
      state.theme._exists = true;
    }

    state.dirty = false;
    setStatus('Draft saved · ' + new Date().toLocaleTimeString(), 'is-saved');
    return true;
  } catch (err) {
    console.error(err);
    alert('Save failed: ' + err.message);
    setStatus('Save failed', 'is-dirty');
    return false;
  } finally {
    btn.disabled = false;
  }
}

async function publish() {
  if (state.dirty && !confirm('You have unsaved draft changes. Save them before publishing?')) return;
  // Don't publish half-saved work — stop if the save failed.
  if (state.dirty && !(await saveDraft())) return;

  if (!confirm('Publish all current draft changes to the live site?')) return;

  const btn = document.querySelector('[data-publish-btn]');
  btn.disabled = true;
  setStatus('Publishing…');
  try {
    for (const s of state.sections) {
      const publishedPayload = s._settings; // what the admin has been editing
      const { error } = await supabase.from('page_sections')
        .update({ published: publishedPayload, draft: null })
        .eq('id', s.id);
      if (error) throw error;
      s.published = publishedPayload;
      s.draft = null;
    }
    // Theme: promote draft to published.
    {
      const { error } = await supabase.from('theme_settings')
        .upsert({
          brand_id:  state.brandId,
          published: state.theme._settings,
          draft:     null
        }, { onConflict: 'brand_id' });
      if (error) throw error;
      state.theme.published = state.theme._settings;
      state.theme.draft = null;
      state.theme._exists = true;
    }
    setStatus('Published · ' + new Date().toLocaleTimeString(), 'is-saved');
  } catch (err) {
    console.error(err);
    alert('Publish failed: ' + err.message);
    setStatus('Publish failed', 'is-dirty');
  } finally {
    btn.disabled = false;
  }
}


// ── Status + dirty tracking ──────────────────────────────────────────────────
function markDirty() {
  if (!state.dirty) {
    state.dirty = true;
    updateStatus();
  }
}
function updateStatus() {
  setStatus(state.dirty ? 'Unsaved changes' : 'All changes saved', state.dirty ? 'is-dirty' : 'is-saved');
}
function setStatus(text, cls = '') {
  const el = document.querySelector('[data-status]');
  if (!el) return;
  el.textContent = text;
  el.className = 'design-top__status ' + cls;
}
function flashStatus(text) {
  setStatus(text, 'is-saved');
  setTimeout(updateStatus, 1500);
}


// ── Escape helpers ──────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
