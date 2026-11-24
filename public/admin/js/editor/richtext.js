// =============================================================================
// Ducks Unlimited — Rich-text box with a formatting toolbar
// =============================================================================
// Replaces "type <br> and <p> by hand" with a normal text box that has
// buttons: Bold · Italic · Link · New line · Clear formatting.
//
//   const box = mountRichText(hostElement, {
//     value: '<p>Hello <strong>world</strong></p>',
//     onChange: (html) => { ...save it... },   // always cleaned-up HTML
//     singleLine: true                          // e.g. the hero headline
//   });
//
// Keys:
//   Enter        → new paragraph (in single-line boxes: a line break)
//   Shift+Enter  → line break
//
// Pasting from Word, Google Docs or a web page keeps only bold, italic,
// links and paragraphs — colours, fonts and anything risky are dropped by
// sanitizeHtml() in /js/safe-html.js. Whatever we hand to onChange has been
// through that same cleaner, so the website only ever gets safe HTML.
//
// About document.execCommand(): browsers call it "deprecated", but every
// browser still supports it, and it is by far the simplest way to make
// Bold/Italic/Link work in a text box. If it is ever removed, this is the one
// file to change.
// =============================================================================

import { sanitizeHtml, safeUrl, normalizeLinkInput } from '/js/safe-html.js';

// Quick picks in the Link box — the pages people link to most.
const QUICK_LINKS = [
  { label: 'Shop',        href: '/shop.html' },
  { label: 'Men',         href: '/shop.html?category=men' },
  { label: 'Women',       href: '/shop.html?category=women' },
  { label: 'Stores',      href: '/stores.html' },
  { label: 'Track order', href: '/track-order.html' },
  { label: 'Size guide',  href: '/size-guide.html' }
];

export function mountRichText(host, { value = '', onChange = () => {}, singleLine = false } = {}) {
  host.classList.add('rt');
  host.innerHTML = `
    <div class="rt__toolbar" role="toolbar" aria-label="Text formatting">
      <button type="button" data-rt="bold"   title="Bold (Ctrl+B)"   aria-label="Bold"><strong>B</strong></button>
      <button type="button" data-rt="italic" title="Italic (Ctrl+I)" aria-label="Italic"><em>I</em></button>
      <button type="button" data-rt="link"   title="Link"            aria-label="Link">🔗</button>
      <button type="button" data-rt="break"  title="New line (Shift+Enter)" aria-label="New line">↵</button>
      <button type="button" data-rt="clear"  title="Clear formatting" aria-label="Clear formatting">⌫</button>
    </div>
    <div class="rt__box${singleLine ? ' rt__box--single' : ''}" contenteditable="true" role="textbox"
         aria-multiline="${singleLine ? 'false' : 'true'}" data-placeholder="Type your text here"></div>
    <div class="rt__link" hidden>
      <label>Link to
        <input type="text" placeholder="/shop.html or https://…" data-rt-link-input>
      </label>
      <div class="rt__picks">
        ${QUICK_LINKS.map((q) => `<button type="button" data-rt-pick="${q.href}">${q.label}</button>`).join('')}
      </div>
      <p class="rt__link-error" data-rt-link-error hidden>That isn't a web address we can link to. Try one like /shop.html or https://…</p>
      <div class="rt__link-actions">
        <button type="button" data-rt-link-apply class="btn-primary">Add link</button>
        <button type="button" data-rt-link-remove class="btn-ghost">Remove link</button>
        <button type="button" data-rt-link-cancel class="btn-ghost">Cancel</button>
      </div>
    </div>
  `;

  const box      = host.querySelector('.rt__box');
  const linkBox  = host.querySelector('.rt__link');
  const linkIn   = host.querySelector('[data-rt-link-input]');
  let savedRange = null; // where the cursor was when the Link box opened

  // Enter makes <p> paragraphs (not <div>s).
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch {}

  setValue(value);

  // ── Typing ────────────────────────────────────────────────────────────────
  const emit = () => onChange(clean(box.innerHTML));
  box.addEventListener('input', emit);

  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.shiftKey || singleLine)) {
      e.preventDefault();
      insertLineBreak();
    }
  });

  // ── Paste: keep only safe, simple formatting ─────────────────────────────
  box.addEventListener('paste', (e) => {
    e.preventDefault();
    const data = e.clipboardData;
    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    let safe = html ? sanitizeHtml(stylesToTags(html)) : plainTextToHtml(text);
    // Pasting inside an existing paragraph: paragraphs become line breaks,
    // so we never end up with a paragraph inside a paragraph.
    if (singleLine || cursorInsideParagraph()) safe = paragraphsToBreaks(safe);
    insertHtmlAtCursor(safe);
    emit();
  });

  // ── Toolbar ───────────────────────────────────────────────────────────────
  host.querySelector('.rt__toolbar').addEventListener('mousedown', (e) => {
    // Keep the text selected when a toolbar button is pressed.
    if (e.target.closest('button')) e.preventDefault();
  });
  host.querySelector('.rt__toolbar').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rt]');
    if (!btn) return;
    box.focus();
    const cmd = btn.dataset.rt;
    if (cmd === 'bold' || cmd === 'italic') document.execCommand(cmd);
    if (cmd === 'break') insertLineBreak();
    if (cmd === 'clear') { document.execCommand('removeFormat'); document.execCommand('unlink'); }
    if (cmd === 'link') { openLinkBox(); return; }
    emit();
  });

  // ── Link box ──────────────────────────────────────────────────────────────
  function openLinkBox() {
    const sel = window.getSelection();
    savedRange = sel.rangeCount && box.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    // If the cursor is inside a link already, show where it goes.
    const current = sel.anchorNode?.parentElement?.closest('a');
    linkIn.value = current && box.contains(current) ? current.getAttribute('href') : '';
    linkBox.hidden = false;
    linkIn.focus();
  }
  function closeLinkBox() {
    linkBox.hidden = true;
    box.focus();
    restoreRange();
  }
  function restoreRange() {
    if (!savedRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }
  function applyLink(href, labelIfEmpty) {
    // "www.ducksunlimited.ph" → "https://www.ducksunlimited.ph", etc.
    href = normalizeLinkInput(href);
    const error = host.querySelector('[data-rt-link-error]');
    // Not a usable address → say so (otherwise the link would silently
    // disappear when the text is saved).
    if (href && !safeUrl(href)) { error.hidden = false; linkIn.focus(); return; }
    error.hidden = true;
    linkBox.hidden = true;
    box.focus();
    restoreRange();
    if (!href) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) {
      // Nothing selected: add the link's name as new linked text.
      const a = document.createElement('a');
      a.href = href;
      a.textContent = labelIfEmpty || href;
      insertHtmlAtCursor(a.outerHTML);
    } else {
      document.execCommand('createLink', false, href);
    }
    emit();
  }

  host.querySelector('[data-rt-link-apply]').addEventListener('click', () => applyLink(linkIn.value));
  host.querySelector('[data-rt-link-cancel]').addEventListener('click', closeLinkBox);
  host.querySelector('[data-rt-link-remove]').addEventListener('click', () => {
    closeLinkBox();
    document.execCommand('unlink');
    emit();
  });
  host.querySelectorAll('[data-rt-pick]').forEach((b) => {
    b.addEventListener('click', () => applyLink(b.dataset.rtPick, b.textContent));
  });
  linkIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); applyLink(linkIn.value); }
    if (e.key === 'Escape') { e.preventDefault(); closeLinkBox(); }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function insertLineBreak() {
    // insertLineBreak is the cleanest; insertHTML('<br>') is the fallback.
    if (!document.execCommand('insertLineBreak')) document.execCommand('insertHTML', false, '<br>');
  }

  // Put cleaned HTML where the cursor is. (We don't use the browser's
  // insertHTML command here: Chrome rewrites <strong>/<em> into styled
  // <span>s, which the cleaner would then throw away.)
  function insertHtmlAtCursor(html) {
    const sel = window.getSelection();
    if (!sel.rangeCount || !box.contains(sel.anchorNode)) {
      box.insertAdjacentHTML('beforeend', html);
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const fragment = range.createContextualFragment(html);
    const last = fragment.lastChild;
    range.insertNode(fragment);
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function cursorInsideParagraph() {
    const node = window.getSelection().anchorNode;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    const p = el?.closest('p');
    return !!(p && box.contains(p));
  }

  function clean(html) {
    let out = sanitizeHtml(html);
    if (singleLine) out = paragraphsToBreaks(out);
    // An emptied box often leaves a stray <br> behind.
    if (/^(\s|<br\s*\/?>|<p>(\s|<br\s*\/?>)*<\/p>)*$/i.test(out)) out = '';
    return out;
  }

  function setValue(html) {
    box.innerHTML = sanitizeHtml(html || '');
  }

  return {
    setValue,
    destroy() { host.innerHTML = ''; host.classList.remove('rt'); }
  };
}

// Google Docs (and some websites) show bold/italic with styles instead of
// <b>/<i> tags — and Docs wraps a whole paste in <b style="font-weight:normal">,
// which would otherwise turn EVERYTHING bold. Before cleaning, we read those
// styles and turn them into real <strong>/<em> (or drop the fake <b>).
// DOMParser makes an inert copy: nothing in it runs or loads.
function stylesToTags(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const isBold   = (w) => w === 'bold' || w === 'bolder' || Number(w) >= 600;
  const isNormal = (w) => w === 'normal' || w === 'lighter' || (Number(w) > 0 && Number(w) < 600);

  for (const el of [...doc.body.querySelectorAll('*')]) {
    const weight = el.style?.fontWeight || '';
    const italic = el.style?.fontStyle === 'italic';
    const tag = el.tagName.toLowerCase();

    // <b style="font-weight:normal"> → not actually bold: keep the contents only.
    if ((tag === 'b' || tag === 'strong') && isNormal(weight)) {
      el.replaceWith(...el.childNodes);
      continue;
    }
    if (tag !== 'b' && tag !== 'strong' && isBold(weight)) wrapInside(el, 'strong');
    if (tag !== 'i' && tag !== 'em' && italic) wrapInside(el, 'em');
  }
  return doc.body.innerHTML;

  function wrapInside(el, name) {
    const w = doc.createElement(name);
    while (el.firstChild) w.appendChild(el.firstChild);
    el.appendChild(w);
  }
}

// "Line one\n\nLine two" → "<p>Line one</p><p>Line two</p>"
function plainTextToHtml(text) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return String(text || '')
    .split(/\r?\n\s*\r?\n/)
    .map((para) => `<p>${esc(para).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}

// For one-line boxes (a headline): paragraphs become line breaks.
function paragraphsToBreaks(html) {
  return html
    .replace(/<\/p>\s*<p>/gi, '<br>')
    .replace(/<\/?p>/gi, '');
}
