// =============================================================================
// Import window — choose a file → see a preview → Confirm or Cancel
// =============================================================================
// Shared by the product import (Products page) and the stock imports
// (Inventory page). The window itself doesn't know anything about products
// or stock: the page hands it two functions.
//
// USAGE:
//   import { openImportModal } from '/admin/js/import-modal.js';
//
//   openImportModal({
//     title:    'Import products',
//     intro:    'Upload a CSV in the Oboda product template format…',  // HTML allowed
//     templateName: 'products-template.csv',
//     templateCsv:  () => blankProductTemplate(),
//     analyze:  async (fileText) => result,   // checks the file, saves NOTHING
//     apply:    async (result) => 'Toast message',  // saves, after Confirm
//     onDone:   (message) => { showToast(message); reloadTable(); },
//   });
//
// `analyze` must return:
//   { fatal: string|null,                 // whole file unusable (wrong format)
//     problems: [{ line, message }],      // blockers — Confirm stays disabled
//     warnings: [{ line, message }],      // FYI only
//     summary:  [{ label, value }],       // the big numbers at the top
//     previewHeaders: [...], previewRows: [[...], ...],
//     changeCount: number }               // 0 → nothing to save
// =============================================================================

import { readSpreadsheetAsCsvText, downloadCsv } from '/admin/js/csv.js';

// How many preview rows to draw before "…and N more"
const PREVIEW_LIMIT = 100;

let stylesAdded = false;

function addStyles() {
  if (stylesAdded) return;
  stylesAdded = true;
  const style = document.createElement('style');
  style.textContent = `
    .imp-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.4);
      z-index: 400; display: flex; align-items: center; justify-content: center;
      padding: 1rem;
    }
    .imp-box {
      background: #fff; border-radius: 8px; width: 100%; max-width: 760px;
      max-height: calc(100dvh - 2rem); display: flex; flex-direction: column;
      box-shadow: 0 8px 40px rgba(0,0,0,0.2); font-family: 'DM Sans', sans-serif;
    }
    /* Phones: use the whole screen */
    @media (max-width: 600px) {
      .imp-overlay { padding: 0; }
      .imp-box { max-height: 100dvh; height: 100dvh; border-radius: 0; }
    }
    .imp-header {
      background: #1B4D2E; color: #fff; display: flex; align-items: center;
      justify-content: space-between; padding: 0 1.25rem; height: 56px;
      border-radius: 8px 8px 0 0; flex-shrink: 0;
    }
    @media (max-width: 600px) { .imp-header { border-radius: 0; } }
    .imp-title { font-family: 'Cormorant Garamond', serif; font-size: 1.15rem; font-weight: 600; }
    .imp-close { background: none; border: none; color: rgba(255,255,255,0.75); font-size: 1.5rem; cursor: pointer; }
    .imp-close:hover { color: #fff; }
    .imp-body { padding: 1.25rem; overflow-y: auto; flex: 1; font-size: 0.9rem; color: #1A1A1A; }
    .imp-intro { color: #555; line-height: 1.5; margin-bottom: 1rem; }
    .imp-intro strong { color: #1A1A1A; }
    .imp-file-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
    .imp-file-row input[type=file] { font-family: inherit; font-size: 0.85rem; max-width: 100%; }
    .imp-link {
      background: none; border: none; color: #1B4D2E; text-decoration: underline;
      font-family: inherit; font-size: 0.85rem; cursor: pointer; padding: 0;
    }
    .imp-status { color: #888; font-style: italic; padding: 1rem 0; }
    .imp-fatal, .imp-problems {
      background: #fdf0f0; border: 1px solid #e8c0c0; color: #b33a3a;
      border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 1rem;
    }
    .imp-warnings {
      background: #fbf6e8; border: 1px solid #e6d5a3; color: #7a6220;
      border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 1rem;
    }
    .imp-problems h4, .imp-warnings h4 { font-size: 0.85rem; margin-bottom: 0.4rem; }
    .imp-problems ul, .imp-warnings ul { padding-left: 1.1rem; font-size: 0.85rem; line-height: 1.5; }
    .imp-summary {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 0.6rem; margin-bottom: 1rem;
    }
    .imp-stat { background: #faf7f2; border-radius: 6px; padding: 0.6rem 0.8rem; }
    .imp-stat-value { font-family: 'Cormorant Garamond', serif; font-size: 1.6rem; font-weight: 600; line-height: 1; }
    .imp-stat-label { font-size: 0.7rem; letter-spacing: 0.06em; text-transform: uppercase; color: #888; margin-top: 0.2rem; }
    .imp-table-wrap { overflow-x: auto; border: 1px solid #eee; border-radius: 6px; }
    .imp-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .imp-table th {
      background: #faf7f2; text-align: left; font-weight: 500; font-size: 0.7rem;
      letter-spacing: 0.06em; text-transform: uppercase; color: #555;
      padding: 0.5rem 0.6rem; border-bottom: 1px solid #eee; white-space: nowrap;
    }
    .imp-table td { padding: 0.45rem 0.6rem; border-bottom: 1px solid #f5f0e8; vertical-align: top; }
    .imp-more { color: #888; font-size: 0.8rem; padding: 0.5rem 0.6rem; }
    .imp-footer {
      padding: 1rem 1.25rem; border-top: 1px solid #eee; display: flex;
      gap: 0.75rem; justify-content: flex-end; flex-shrink: 0;
    }
    .imp-btn {
      padding: 0.65rem 1.25rem; border-radius: 5px; font-family: inherit;
      font-size: 0.9rem; cursor: pointer; border: 1px solid #ddd; background: none; color: #555;
    }
    .imp-btn-primary { background: #1B4D2E; border-color: #1B4D2E; color: #fff; font-weight: 500; }
    .imp-btn-primary:hover:not(:disabled) { background: #163d24; }
    .imp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  `;
  document.head.appendChild(style);
}

// Escape text before putting it into HTML (file contents are untrusted)
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// A list of { line, message } as <li>s, capped so a 500-error file stays readable
function issueList(items) {
  const shown = items.slice(0, 50)
    .map(i => `<li>${i.line ? `Row ${i.line}: ` : ''}${esc(i.message)}</li>`).join('');
  const more = items.length > 50 ? `<li>…and ${items.length - 50} more.</li>` : '';
  return `<ul>${shown}${more}</ul>`;
}


export function openImportModal({ title, intro, templateName, templateCsv, analyze, apply, onDone }) {
  addStyles();

  const overlay = document.createElement('div');
  overlay.className = 'imp-overlay';
  overlay.innerHTML = `
    <div class="imp-box" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="imp-header">
        <span class="imp-title">${esc(title)}</span>
        <button type="button" class="imp-close" aria-label="Close">×</button>
      </div>
      <div class="imp-body">
        <div class="imp-intro">${intro}</div>
        <div class="imp-file-row">
          <input type="file" accept=".csv,text/csv,.xlsx,.xls" />
          <button type="button" class="imp-link" data-template>Download template</button>
        </div>
        <div data-results></div>
      </div>
      <div class="imp-footer">
        <button type="button" class="imp-btn" data-cancel>Cancel</button>
        <button type="button" class="imp-btn imp-btn-primary" data-confirm disabled>Confirm import</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const fileInput  = overlay.querySelector('input[type=file]');
  const resultsEl  = overlay.querySelector('[data-results]');
  const confirmBtn = overlay.querySelector('[data-confirm]');
  let current = null;    // the latest analyze() result
  let saving  = false;

  function close() {
    if (saving) return;  // don't let them close mid-save
    overlay.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  overlay.querySelector('.imp-close').addEventListener('click', close);
  overlay.querySelector('[data-cancel]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);

  overlay.querySelector('[data-template]').addEventListener('click', () => {
    downloadCsv(templateName, templateCsv());
  });

  // ── Step 1: a file was chosen → check it and show the preview ──
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    confirmBtn.disabled = true;
    current = null;
    if (!file) { resultsEl.innerHTML = ''; return; }

    resultsEl.innerHTML = '<div class="imp-status">Checking the file…</div>';
    try {
      // CSV or Excel — either way we get CSV text back (see /admin/js/csv.js)
      const text = await readSpreadsheetAsCsvText(file);
      current = await analyze(text);
    } catch (err) {
      console.error(err);
      resultsEl.innerHTML = `<div class="imp-fatal">Couldn't read the file: ${esc(err.message || err)}</div>`;
      return;
    }
    render(current);
  });

  function render(r) {
    if (r.fatal) {
      resultsEl.innerHTML = `<div class="imp-fatal">${esc(r.fatal)}</div>`;
      return;
    }

    let html = '';

    if (r.problems.length) {
      html += `<div class="imp-problems">
        <h4>${r.problems.length} problem${r.problems.length === 1 ? '' : 's'} — nothing will be saved until these are fixed in the file:</h4>
        ${issueList(r.problems)}
      </div>`;
    }
    if (r.warnings.length) {
      html += `<div class="imp-warnings"><h4>Heads up:</h4>${issueList(r.warnings)}</div>`;
    }

    html += '<div class="imp-summary">' + r.summary.map(s => `
      <div class="imp-stat">
        <div class="imp-stat-value">${s.value}</div>
        <div class="imp-stat-label">${esc(s.label)}</div>
      </div>`).join('') + '</div>';

    if (r.previewRows.length) {
      const head = r.previewHeaders.map(h => `<th>${esc(h)}</th>`).join('');
      const body = r.previewRows.slice(0, PREVIEW_LIMIT)
        .map(row => `<tr>${row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
      const more = r.previewRows.length > PREVIEW_LIMIT
        ? `<div class="imp-more">…and ${r.previewRows.length - PREVIEW_LIMIT} more changes.</div>` : '';
      html += `<div class="imp-table-wrap"><table class="imp-table">
        <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${more}</div>`;
    } else if (!r.problems.length) {
      html += '<div class="imp-status">Everything in this file already matches the website — nothing to change.</div>';
    }

    resultsEl.innerHTML = html;
    confirmBtn.disabled = r.problems.length > 0 || r.changeCount === 0;
  }

  // ── Step 2: Confirm → save everything (or nothing) ──
  confirmBtn.addEventListener('click', async () => {
    if (!current || confirmBtn.disabled) return;
    saving = true;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving…';
    fileInput.disabled = true;

    try {
      const message = await apply(current);
      saving = false;
      close();
      onDone?.(message);
    } catch (err) {
      console.error(err);
      saving = false;
      confirmBtn.textContent = 'Confirm import';
      confirmBtn.disabled = false;
      fileInput.disabled = false;
      resultsEl.insertAdjacentHTML('afterbegin',
        `<div class="imp-fatal">Saving failed, so nothing was changed. ${esc(err.message || '')}</div>`);
    }
  });
}
