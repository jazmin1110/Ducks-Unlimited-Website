// =============================================================================
// Ducks Unlimited — Editor settings forms (the right-hand panel)
// =============================================================================
// Builds the form for a section from its schema in /js/section-schemas.js, so
// nobody hand-writes a form per section type. The controller (design.js)
// puts the HTML on the page and listens for changes.
//
// Every input carries:
//   data-field-id    → which setting it edits (e.g. "headline")
//   data-field-kind  → its type (text, image, select, toggle…)
//   data-block-id    → only for fields inside a block (a tile, a slide…)
//
// Fields marked group: 'style' (space above/below, background, width) are
// shown under a "Style" heading. Fields with showIf only appear when another
// field has a certain value (e.g. "Custom background colour" only when
// Background = Custom).
// =============================================================================


// The whole form for one section.
export function sectionFormHtml(schema, settings) {
  return `
    <h2>${escapeHtml(schema.name)}</h2>
    <p class="section-form__desc">${escapeHtml(schema.description || '')}</p>
    ${fieldsHtml(schema.settings.filter((f) => f.group !== 'style'), settings)}
    ${schema.blocks ? blocksHtml(schema.blocks, settings.blocks || []) : ''}
    ${fieldsHtml(schema.settings.filter((f) => f.group === 'style'), settings)}
  `;
}

// A list of fields, with the "Style" heading before the first style field.
export function fieldsHtml(fields, settings, blockId = null) {
  let out = '';
  let styleStarted = false;
  for (const f of fields) {
    if (f.group === 'style' && !styleStarted) {
      // Style fields come last in every schema; give them a clear heading.
      out +=`<h3 class="form-group-title">Style</h3>`;
      styleStarted = true;
    }
    out += fieldHtml(f, settings?.[f.id], blockId, settings);
  }
  return out;
}

// One labelled field.
export function fieldHtml(f, value, blockId = null, allSettings = {}) {
  const v = value ?? f.default ?? '';
  const common = `data-field-id="${escapeAttr(f.id)}" data-field-kind="${escapeAttr(f.type)}"` +
    (blockId ? ` data-block-id="${escapeAttr(blockId)}"` : '');
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
      // A plain box for now; the formatting toolbar replaces it (richtext.js).
      input = `<textarea ${common} placeholder="Type your text here">${escapeHtml(v)}</textarea>`;
      break;
    case 'image':
      input = `
        <input type="url" value="${escapeAttr(v)}" placeholder="Paste the photo's web address (https://…)" ${common}>
        <img data-image-preview src="${escapeAttr(v)}" class="field__image-preview" alt=""
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
        <span class="field__range-value" data-range-label>${escapeHtml(v || f.min || 0)}</span>${f.unit ? `<span class="field__range-value">${escapeHtml(f.unit)}</span>` : ''}
      `;
      break;
    case 'select': {
      const opts = (f.options || []).map((o) =>
        `<option value="${escapeAttr(o.value)}"${String(o.value) === String(v) ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
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

  // showIf: hide this field unless another field has a given value.
  let showIfAttrs = '';
  let hidden = '';
  if (f.showIf) {
    showIfAttrs = ` data-show-if-field="${escapeAttr(f.showIf.field)}" data-show-if-equals="${escapeAttr(f.showIf.equals)}"`;
    const current = allSettings?.[f.showIf.field];
    if (String(current ?? '') !== String(f.showIf.equals)) hidden = ' hidden';
  }

  return `
    <div class="field"${showIfAttrs}${hidden}>
      <label>${escapeHtml(f.label)}</label>
      ${input}
    </div>
  `;
}

// The list of blocks (tiles, slides…) under a section's own fields.
export function blocksHtml(blocksSchema, blocks) {
  const max = blocksSchema.max || 0;
  const canAdd = !max || blocks.length < max;
  return `
    <div class="blocks">
      <div class="blocks__head">
        <h3>${escapeHtml(blocksSchema.name)}s (${blocks.length}${max ? ' of ' + max : ''})</h3>
        <button type="button" class="btn-secondary" data-block-action="add" ${canAdd ? '' : 'disabled'}>+ Add ${escapeHtml(blocksSchema.name)}</button>
      </div>
      <div data-block-list>
      ${blocks.map((b, i) => `
        <div class="block" data-block-row="${escapeAttr(b.id)}">
          <div class="block__head">
            <span class="block__title"><span class="block__drag" aria-hidden="true" title="Drag to reorder">⠿</span> ${escapeHtml(blocksSchema.name)} ${i + 1}</span>
            <span class="block__controls">
              <button type="button" title="Move up"   aria-label="Move up"   data-block-action="up"     data-block-id="${escapeAttr(b.id)}">↑</button>
              <button type="button" title="Move down" aria-label="Move down" data-block-action="down"   data-block-id="${escapeAttr(b.id)}">↓</button>
              <button type="button" title="Remove"    aria-label="Remove"    data-block-action="remove" data-block-id="${escapeAttr(b.id)}">🗑</button>
            </span>
          </div>
          ${blocksSchema.settings.map((f) => fieldHtml(f, b[f.id], b.id, b)).join('')}
        </div>
      `).join('')}
      </div>
    </div>
  `;
}

// After a change, show/hide fields that depend on another field.
export function applyShowIf(host, settings) {
  host.querySelectorAll('[data-show-if-field]').forEach((el) => {
    const current = settings?.[el.dataset.showIfField];
    el.hidden = String(current ?? '') !== el.dataset.showIfEquals;
  });
}

// Turn an input's value into the right kind of value for the settings.
export function readFieldValue(input, kind) {
  if (kind === 'toggle') return !!input.checked;
  if (kind === 'number' || kind === 'range') return input.value === '' ? '' : Number(input.value);
  return input.value;
}


// ── Escape helpers (stop typed text from being read as HTML) ────────────────
export function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
