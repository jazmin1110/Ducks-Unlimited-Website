// =============================================================================
// CSV helpers — read and write spreadsheet (.csv) files
// =============================================================================
// Used by the bulk import/export on the Products and Inventory pages.
//
// A CSV file is just text: one line per row, cells separated by commas.
// The tricky parts this file handles for you:
//   - Cells that contain commas or line breaks are wrapped in "double quotes"
//     (e.g.  "Soft, breathable cotton"). Those commas are NOT cell breaks.
//   - A double quote inside a quoted cell is written twice:  "6"" zipper"
//   - Excel adds an invisible marker (a "BOM") at the very start of the file.
//
// USAGE:
//   import { parseCsv, toCsv, downloadCsv, readFileAsText } from '/admin/js/csv.js';
//
//   const text = await readFileAsText(file);     // file from <input type="file">
//   const { headers, rows } = parseCsv(text);    // rows = [{ name: '...', code: '...' }, ...]
//
//   const csv = toCsv(['name', 'code'], [{ name: 'Polo', code: 'DU-1' }]);
//   downloadCsv('products.csv', csv);
// =============================================================================


// Read a File (from an <input type="file">) as text.
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'UTF-8');
  });
}


// Turn CSV text into a grid: an array of rows, each row an array of cell strings.
function parseGrid(text) {
  // Strip Excel's invisible BOM marker if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const grid = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }  // "" → one literal quote
        else inQuotes = false;                           // closing quote
      } else {
        cell += ch;                                      // anything else, incl. commas/newlines
      }
      continue;
    }

    if (ch === '"')       inQuotes = true;
    else if (ch === ',')  { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); grid.push(row); row = []; cell = ''; }
    else if (ch === '\r') { /* ignore — Windows line endings are \r\n */ }
    else                  cell += ch;
  }

  // Last cell/row (files often don't end with a newline)
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    grid.push(row);
  }

  return grid;
}


// Parse CSV text into { headers, rows }.
//   headers: the first line's column names, exactly as written
//   rows:    one object per line, keyed by LOWERCASED, trimmed header name,
//            so `row['color']` works whether the file says "Color" or "color".
//            Each row also gets `_line`: its line number in the file (for
//            "row 7: missing code" style messages).
// Completely blank lines are skipped.
export function parseCsv(text) {
  const grid = parseGrid(text);
  if (grid.length === 0) return { headers: [], rows: [] };

  const headers = grid[0].map(h => h.trim());
  const keys    = headers.map(h => h.toLowerCase());

  const rows = [];
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i];
    if (cells.every(c => c.trim() === '')) continue; // blank line

    const obj = { _line: i + 1 };                     // +1 because line 1 is the header
    keys.forEach((key, col) => {
      obj[key] = (cells[col] ?? '').trim();
    });
    rows.push(obj);
  }

  return { headers, rows };
}


// Wrap a cell in quotes only if it needs it (has a comma, quote, or newline).
function escapeCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}


// Build CSV text from a list of column names and a list of row objects.
// Each row object is looked up by the exact column name.
export function toCsv(columns, rows) {
  const lines = [columns.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(columns.map(col => escapeCell(row[col])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}


// Make the browser download `csvText` as a file called `filename`.
// The BOM at the start tells Excel the file is UTF-8, so characters like
// "ñ" (Parañaque) and "₱" show correctly instead of garbled symbols.
export function downloadCsv(filename, csvText) {
  const blob = new Blob(['﻿' + csvText], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


// Today's date as YYYY-MM-DD (local time) — used in exported file names.
export function todayStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
