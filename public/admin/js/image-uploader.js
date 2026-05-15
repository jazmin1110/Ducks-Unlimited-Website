// =============================================================================
// Ducks Unlimited — Reusable Single-Image Uploader
// =============================================================================
// Drop-in widget that replaces a "paste an image URL here" text field with a
// real file picker. Used by stores, journal, lookbooks, gift-cards, and
// (Phase 2) the homepage CMS.
//
// What it gives the admin:
//   - Click or drag-and-drop to pick a file
//   - Live thumbnail preview of the chosen image
//   - "Replace" / "Remove" buttons
//   - Inline upload progress + error messages
//   - Validates file type (JPG/PNG/WEBP) and size (≤ 5 MB) before uploading
//
// What the page gets back:
//   - A hidden <input> whose `value` is the public URL of the uploaded image.
//     Existing form-save code keeps working — just read the input's value.
//   - An optional `onChange(url)` callback if you need to react to the change
//     immediately (e.g. update a live preview elsewhere on the page).
//
// USAGE (in any admin page that needs an image upload):
//
//   <!-- 1. Markup: a wrapper div + a hidden input bound by name -->
//   <div data-image-uploader="hero_image"></div>
//   <input type="hidden" id="hero_image" name="hero_image" />
//
//   <!-- 2. Script: import + mount -->
//   <script type="module">
//     import { mountImageUploader } from '/admin/js/image-uploader.js';
//
//     mountImageUploader({
//       container:  document.querySelector('[data-image-uploader="hero_image"]'),
//       hiddenInput: document.getElementById('hero_image'),
//       bucket:     'site-content',          // or 'product-images'
//       pathPrefix: 'stores',                 // folder inside the bucket
//       currentUrl: existingRow?.image_url,   // pre-fill when editing
//       onChange:   (url) => console.log(url) // optional
//     });
//   </script>
//
// Files end up at: <bucket>/<pathPrefix>/<random-uuid>.<ext>
// =============================================================================

import { supabase } from '/lib/supabase.js';

// Same limits as the products uploader so behavior is consistent.
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES     = 5 * 1024 * 1024; // 5 MB

// ---- Tiny helpers ----------------------------------------------------------

// Returns null if the file is OK, otherwise a human-readable error message.
function validateFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Only JPG, PNG, or WEBP images are allowed.';
  }
  if (file.size > MAX_BYTES) {
    return 'Image must be 5 MB or smaller.';
  }
  return null;
}

// Build a unique storage path under the configured bucket prefix.
// Example: "stores/3a7b...e9.jpg"
function buildStoragePath(pathPrefix, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const randomId = crypto.randomUUID();
  // Strip a leading slash if the caller passed one — keeps Supabase happy.
  const cleanPrefix = (pathPrefix || '').replace(/^\/+|\/+$/g, '');
  return cleanPrefix
    ? `${cleanPrefix}/${randomId}.${ext}`
    : `${randomId}.${ext}`;
}


// =============================================================================
// PUBLIC: mountImageUploader
// =============================================================================
// Renders the uploader UI inside `container`, wires file/drag handlers, and
// keeps `hiddenInput.value` in sync with the chosen image's public URL.
// =============================================================================

export function mountImageUploader({
  container,
  hiddenInput,
  bucket = 'site-content',
  pathPrefix = '',
  currentUrl = '',
  onChange = null,
} = {}) {
  if (!container) {
    console.error('[image-uploader] No container element provided');
    return;
  }
  if (!hiddenInput) {
    console.error('[image-uploader] No hiddenInput element provided');
    return;
  }

  // Seed the hidden input with the existing URL (when editing an existing row).
  hiddenInput.value = currentUrl || '';

  // ── Build the UI once ───────────────────────────────────────────────────
  // Three states the same DOM can show:
  //   (a) "empty"   — no image picked yet → drop zone with "+ Upload"
  //   (b) "preview" — image picked        → thumbnail with Replace/Remove
  //   (c) "busy"    — uploading           → spinner-ish text
  container.classList.add('image-uploader');
  container.innerHTML = `
    <div class="image-uploader__zone" data-state="empty">
      <!-- Empty state: drop zone -->
      <div class="image-uploader__empty">
        <span class="image-uploader__icon">＋</span>
        <span class="image-uploader__hint">Click or drop image here</span>
        <span class="image-uploader__sub">JPG · PNG · WEBP — max 5 MB</span>
      </div>

      <!-- Preview state: thumbnail + actions -->
      <div class="image-uploader__preview">
        <img alt="" />
        <div class="image-uploader__actions">
          <button type="button" data-action="replace">Replace</button>
          <button type="button" data-action="remove">Remove</button>
        </div>
      </div>

      <!-- Busy state -->
      <div class="image-uploader__busy">Uploading…</div>

      <!-- Inline error message -->
      <div class="image-uploader__error" role="alert"></div>

      <!-- Hidden file input — opened by clicking the zone or "Replace" -->
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        class="image-uploader__file"
        hidden
      />
    </div>
  `;

  // Style block — injected once per page so it can be reused everywhere.
  ensureStylesInjected();

  // ── Element refs ────────────────────────────────────────────────────────
  const zone        = container.querySelector('.image-uploader__zone');
  const previewImg  = container.querySelector('.image-uploader__preview img');
  const errorEl     = container.querySelector('.image-uploader__error');
  const fileInput   = container.querySelector('.image-uploader__file');
  const replaceBtn  = container.querySelector('[data-action="replace"]');
  const removeBtn   = container.querySelector('[data-action="remove"]');
  const emptyEl     = container.querySelector('.image-uploader__empty');

  // ── State machine ───────────────────────────────────────────────────────
  function setState(state) {
    zone.dataset.state = state; // 'empty' | 'preview' | 'busy'
    errorEl.textContent = '';
  }

  function showError(msg) {
    errorEl.textContent = msg;
  }

  function showPreview(url) {
    previewImg.src = url;
    setState('preview');
  }

  // Apply initial state based on whether an existing URL was passed in.
  if (currentUrl) showPreview(currentUrl);
  else            setState('empty');

  // ── Event wiring ────────────────────────────────────────────────────────
  // Click on empty zone → open file picker
  emptyEl.addEventListener('click', () => fileInput.click());
  replaceBtn.addEventListener('click', () => fileInput.click());

  // Remove → clear the hidden input + go back to empty state.
  // Note: we DON'T delete the file from Supabase Storage on "remove" because
  // the admin might just be swapping it; storage cleanup happens elsewhere
  // (e.g. on a future "purge orphans" job). Cheap to leave a few stragglers.
  removeBtn.addEventListener('click', () => {
    hiddenInput.value = '';
    fileInput.value = '';
    previewImg.src = '';
    setState('empty');
    if (typeof onChange === 'function') onChange('');
  });

  // Drag and drop on the zone
  ['dragenter', 'dragover'].forEach((evt) =>
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add('is-dragover');
    })
  );
  ['dragleave', 'dragend', 'drop'].forEach((evt) =>
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.remove('is-dragover');
    })
  );
  zone.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  // File chosen via picker
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (file) handleFile(file);
  });

  // ── Upload pipeline ─────────────────────────────────────────────────────
  async function handleFile(file) {
    const validationErr = validateFile(file);
    if (validationErr) {
      showError(validationErr);
      return;
    }

    setState('busy');

    const storagePath = buildStoragePath(pathPrefix, file);

    // Upload binary to Supabase Storage. `upsert: false` so we never
    // accidentally overwrite a different image at the same path (the random
    // UUID basically guarantees uniqueness anyway).
    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file, { upsert: false, contentType: file.type });

    if (uploadErr) {
      console.error('[image-uploader] upload failed:', uploadErr);
      showError('Upload failed. Please try again.');
      // Restore previous state — preview if we had one, empty if not.
      if (hiddenInput.value) showPreview(hiddenInput.value);
      else                    setState('empty');
      return;
    }

    // Fetch the public URL we'll save into the DB.
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(storagePath);

    hiddenInput.value = publicUrl;
    showPreview(publicUrl);

    if (typeof onChange === 'function') onChange(publicUrl);
  }
}


// =============================================================================
// One-time CSS injection
// =============================================================================
// Inserts the uploader's styles into <head> the first time mountImageUploader
// is called. Keeps the JS file self-contained so admin pages don't need to
// remember to load a separate stylesheet.
// =============================================================================
function ensureStylesInjected() {
  if (document.getElementById('image-uploader-styles')) return;

  const style = document.createElement('style');
  style.id = 'image-uploader-styles';
  style.textContent = `
    .image-uploader { display: block; }

    .image-uploader__zone {
      position: relative;
      border: 2px dashed #d8d2c4;
      background: #faf7f2;
      border-radius: 6px;
      min-height: 180px;
      transition: border-color 0.15s, background-color 0.15s;
    }

    .image-uploader__zone.is-dragover {
      border-color: #1B4D2E;
      background: #f0e9da;
    }

    /* Show only the section that matches the current data-state */
    .image-uploader__empty,
    .image-uploader__preview,
    .image-uploader__busy { display: none; }

    .image-uploader__zone[data-state="empty"]   .image-uploader__empty   { display: flex; }
    .image-uploader__zone[data-state="preview"] .image-uploader__preview { display: block; }
    .image-uploader__zone[data-state="busy"]    .image-uploader__busy    { display: flex; }

    /* Empty state */
    .image-uploader__empty {
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      padding: 2rem 1rem;
      cursor: pointer;
      min-height: 180px;
      text-align: center;
    }

    .image-uploader__icon {
      font-size: 2rem;
      color: #1B4D2E;
      line-height: 1;
    }

    .image-uploader__hint {
      font-size: 0.9rem;
      color: #1A1A1A;
    }

    .image-uploader__sub {
      font-size: 0.75rem;
      color: #888;
    }

    /* Preview state */
    .image-uploader__preview {
      padding: 0.75rem;
    }

    .image-uploader__preview img {
      display: block;
      max-width: 100%;
      max-height: 280px;
      margin: 0 auto;
      border-radius: 4px;
      object-fit: contain;
      background: #fff;
    }

    .image-uploader__actions {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
      margin-top: 0.75rem;
    }

    .image-uploader__actions button {
      background: none;
      border: 1px solid #d8d2c4;
      color: #1A1A1A;
      font-size: 0.78rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 0.4rem 0.85rem;
      border-radius: 4px;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s, background-color 0.15s;
    }

    .image-uploader__actions button:hover {
      border-color: #1B4D2E;
      color: #1B4D2E;
    }

    .image-uploader__actions [data-action="remove"]:hover {
      border-color: #b33a3a;
      color: #b33a3a;
    }

    /* Busy state */
    .image-uploader__busy {
      align-items: center;
      justify-content: center;
      min-height: 180px;
      font-size: 0.9rem;
      color: #1B4D2E;
      letter-spacing: 0.04em;
    }

    /* Inline error */
    .image-uploader__error {
      color: #b33a3a;
      font-size: 0.78rem;
      padding: 0.4rem 0.75rem 0;
      min-height: 1.2em;
    }
  `;
  document.head.appendChild(style);
}
