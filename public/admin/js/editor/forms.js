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


import { youtubeId } from '/js/section-templates.js?v=20261124';

// Choices for 'ref' fields (a dropdown of stores or lookbooks), loaded once
// by design.js:  setRefOptions({ stores: [{ value, label }], lookbooks: [...] })
let refOptions = {};
export function setRefOptions(options) { refOptions = options || {}; }

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
      // An empty spot that design.js fills with the formatting toolbar and
      // text box (/admin/js/editor/richtext.js). It deliberately has no
      // data-field-id: the toolbar reports changes itself.
      input = `<div data-richtext="${escapeAttr(f.id)}"${blockId ? ` data-richtext-block="${escapeAttr(blockId)}"` : ''}${f.singleLine ? ' data-single-line' : ''}></div>`;
      break;
    case 'image':
      // An upload box (filled by design.js with /admin/js/image-uploader.js),
      // plus — for photos already online — a box to paste a web address.
      input = `
        <div data-image-upload="${escapeAttr(f.id)}"${blockId ? ` data-image-upload-block="${escapeAttr(blockId)}"` : ''}></div>
        <details class="field__paste-url"${v && !/supabase\.co\/storage/.test(v) ? ' open' : ''}>
          <summary>…or paste a photo's web address</summary>
          <input type="url" value="${escapeAttr(v)}" placeholder="https://…" ${common}>
        </details>
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
    case 'ref': {
      // A dropdown of rows from another admin page (Stores, Lookbooks).
      const opts = refOptions[f.source] || [];
      const missing = v && !opts.some((o) => o.value === v);
      input = `<select ${common}>
        <option value="">Choose…</option>
        ${opts.map((o) => `<option value="${escapeAttr(o.value)}"${o.value === v ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
        ${missing ? `<option value="${escapeAttr(v)}" selected>(no longer available)</option>` : ''}
      </select>
      ${opts.length ? '' : `<small class="field__hint">Nothing to choose yet — add one in Admin → ${f.source === 'stores' ? 'Stores' : 'Lookbooks'} first.</small>`}`;
      break;
    }
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

  // A YouTube link box says so when the link isn't a YouTube link.
  if (f.id === 'youtube_url') {
    const bad = v && !youtubeId(v);
    input += `<small class="field__error" data-youtube-error${bad ? '' : ' hidden'}>That doesn't look like a YouTube link. Copy it from the video's Share button.</small>`;
  }

  return `
    <div class="field"${showIfAttrs}${hidden}>
      <label>${escapeHtml(f.label)}</label>
      ${input}
    </div>
  `;
}

// Show/hide the "not a YouTube link" message while typing.
export function checkYoutubeField(input) {
  const msg = input.closest('.field')?.querySelector('[data-youtube-error]');
  if (msg) msg.hidden = !input.value || !!youtubeId(input.value);
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


// ── Theme form ───────────────────────────────────────────────────────────────
// Colours (each with "Reset to brand default"), heading and body font picked
// from our menu — each choice written in its own font — and button shape.
//
//   themeFormHtml(theme, defaults, { headingFonts, bodyFonts })
//     theme    → the settings being edited
//     defaults → the brand's own colours, for the Reset buttons

export const THEME_COLOURS = [
  { id: 'brand_color',  label: 'Brand colour',      hint: 'Buttons, headings and dark backgrounds' },
  { id: 'accent_color', label: 'Accent colour',     hint: 'Small highlights and labels' },
  { id: 'bg_color',     label: 'Background colour', hint: 'Behind every section' },
  { id: 'text_color',   label: 'Text colour',       hint: 'Body text' }
];

export const BUTTON_SHAPES = [
  { value: 'square',  label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'pill',    label: 'Pill' }
];

export function themeFormHtml(theme, defaults, { headingFonts, bodyFonts }) {
  const colour = (c) => {
    const value = theme[c.id] || defaults[c.id] || '#000000';
    const isDefault = String(value).toLowerCase() === String(defaults[c.id] || '').toLowerCase();
    return `
      <div class="field field--colour">
        <label for="theme-${c.id}">${escapeHtml(c.label)}</label>
        <div class="colour-row">
          <input type="color" id="theme-${c.id}" value="${escapeAttr(value)}" data-field-id="${c.id}" data-field-kind="color">
          <span class="colour-row__hex">${escapeHtml(value)}</span>
          <button type="button" class="btn-ghost colour-row__reset" data-theme-reset="${c.id}" ${isDefault ? 'disabled' : ''}>Reset to brand default</button>
        </div>
        <small class="field__hint">${escapeHtml(c.hint)}</small>
      </div>`;
  };

  // A font choice = a radio button whose label is written in that font.
  // (Radio buttons work with the keyboard and screen readers out of the box.)
  const fontGroup = (id, label, fonts, sample) => `
    <fieldset class="font-choices">
      <legend>${escapeHtml(label)}</legend>
      ${fonts.map((name) => `
        <label class="font-choice">
          <input type="radio" name="${id}" value="${escapeAttr(name)}" data-field-id="${id}" data-field-kind="radio"
                 ${theme[id] === name ? 'checked' : ''}>
          <span class="font-choice__sample" style="font-family:'${escapeAttr(name)}', serif">${escapeHtml(sample)}</span>
          <span class="font-choice__name">${escapeHtml(name)}</span>
        </label>`).join('')}
    </fieldset>`;

  return `
    <h2>Theme</h2>
    <p class="section-form__desc">Colours, fonts and buttons used by every section on the homepage.</p>

    <h3 class="form-group-title form-group-title--first">Colours</h3>
    ${THEME_COLOURS.map(colour).join('')}

    <h3 class="form-group-title">Fonts</h3>
    ${fontGroup('heading_font', 'Headings', headingFonts, 'Affordable luxury')}
    ${fontGroup('body_font', 'Body text', bodyFonts, 'Egyptian cotton, made locally')}

    <h3 class="form-group-title">Buttons</h3>
    <fieldset class="shape-choices">
      <legend>Button shape</legend>
      ${BUTTON_SHAPES.map((s) => `
        <label class="shape-choice">
          <input type="radio" name="button_shape" value="${s.value}" data-field-id="button_shape" data-field-kind="radio"
                 ${theme.button_shape === s.value ? 'checked' : ''}>
          <span class="shape-choice__sample shape-choice__sample--${s.value}">Shop now</span>
          <span>${escapeHtml(s.label)}</span>
        </label>`).join('')}
    </fieldset>
  `;
}
