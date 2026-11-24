// =============================================================================
// Ducks Unlimited — Safe HTML cleaner
// =============================================================================
// Text that admins type (or paste from Word / Google Docs / a web page) into
// the editor's formatting boxes can contain all sorts of HTML. Before we save
// it, and again before we show it on the website, we run it through
// sanitizeHtml() so only these survive:
//
//     <p>  <br>  <strong>  <em>  <a href="...">
//
// (<b> becomes <strong> and <i> becomes <em>.)
//
// HOW IT STAYS SAFE
//   We never copy the original tags through. We read the text piece by piece:
//     - plain words are "escaped" (so a stray < can't start a tag), and
//     - for each tag we only look at its NAME. If the name is on the allowed
//       list we write a brand-new, attribute-free tag ourselves. Everything
//       else (style=, onclick=, class=, <script>, <img> …) is simply left out.
//   The only attribute that survives is a link's address (href), and only if
//   it starts with /  #  http://  https://  mailto:  or  tel:  — so
//   "javascript:" tricks are removed.
//
// It is written without the browser's DOMParser on purpose, so the same file
// runs in the browser AND in our Node tests (tests/safe-html.test.mjs).
//
// Running it twice gives the same result as running it once, so it's fine
// to clean on save and clean again on display.
// =============================================================================


// Tag name in the input → tag name we write out.
const ALLOWED = {
  p: 'p',
  br: 'br',
  strong: 'strong',
  b: 'strong',
  em: 'em',
  i: 'em',
  a: 'a'
};

// Link addresses must start with one of these (checked in lowercase, with
// all spaces and invisible characters removed first).
const SAFE_LINK_STARTS = ['/', '#', 'http://', 'https://', 'mailto:', 'tel:'];


// ── Public API ──────────────────────────────────────────────────────────────

// Clean a piece of HTML down to the allowed tags. Always returns a string.
export function sanitizeHtml(input) {
  if (input === null || input === undefined) return '';
  let html = String(input);

  // 1. Throw away things whose CONTENT must not show either:
  //    comments, <script>…</script>, <style>…</style>. An unclosed one
  //    swallows the rest of the text, which is the safe choice.
  html = html
    .replace(/<!--[\s\S]*?(-->|$)/g, '')
    .replace(/<(script|style)\b[\s\S]*?(<\/\1\s*>|$)/gi, '');

  let out = '';
  // The tags we've opened and not closed yet. A dropped link is remembered
  // as '-a' so its matching </a> is dropped too.
  const open = [];
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out += escapeText(html.slice(i));
      break;
    }
    // Words before the tag.
    out += escapeText(html.slice(i, lt));

    // Is this really a tag, like <p ...> or </p>?
    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/.exec(html.slice(lt));
    if (!m) {
      // Just a "<" in the text (e.g. "a < b").
      out += '&lt;';
      i = lt + 1;
      continue;
    }
    i = lt + m[0].length;

    const isClosing = m[1] === '/';
    const name = ALLOWED[m[2].toLowerCase()];
    if (!name) continue; // not allowed: drop the tag, keep the words around it

    if (name === 'br') {
      if (!isClosing) out += '<br>';
      continue;
    }

    if (isClosing) {
      out += closeUpTo(open, name);
      continue;
    }

    if (name === 'a') {
      const href = safeHref(m[3]);
      if (!href) { open.push('-a'); continue; } // unsafe link: keep only its words
      const external = /^https?:/i.test(href);
      out += `<a href="${escapeAttr(href)}"${external ? ' rel="noopener" target="_blank"' : ''}>`;
      open.push('a');
      continue;
    }

    out += `<${name}>`;
    open.push(name);
  }

  // Close anything left open, newest first.
  while (open.length) {
    const t = open.pop();
    if (t[0] !== '-') out += `</${t}>`;
  }
  return out;
}

// Turn HTML into plain words (for short previews such as section names in
// the editor's list). The result is NOT HTML — escape it before showing it.
export function htmlToPlainText(input) {
  if (input === null || input === undefined) return '';
  return decodeEntities(String(input).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}


// ── Helpers ─────────────────────────────────────────────────────────────────

// Handle a closing tag: close every tag opened after the matching one, then
// the match itself. A closing tag with no match is ignored.
function closeUpTo(open, name) {
  const want = name === 'a' ? ['a', '-a'] : [name];
  let idx = -1;
  for (let k = open.length - 1; k >= 0; k--) {
    if (want.includes(open[k])) { idx = k; break; }
  }
  if (idx === -1) return '';
  let out = '';
  while (open.length > idx) {
    const t = open.pop();
    if (t[0] !== '-') out += `</${t}>`;
  }
  return out;
}

// Pull the href="..." value out of a tag's attribute text and check it.
// Returns the cleaned address, or '' if there is none or it isn't safe.
function safeHref(attrText) {
  const m = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrText || '');
  if (!m) return '';
  const value = decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').trim();
  // For the check, remove spaces and invisible characters, so tricks like
  // " java\tscript:" are caught.
  // eslint-disable-next-line no-control-regex
  const squashed = value.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
  if (!squashed) return '';
  return SAFE_LINK_STARTS.some((start) => squashed.startsWith(start)) ? value : '';
}

// Turn &amp; &lt; &#39; etc. back into characters. We decode first and then
// escape again, so cleaning twice never turns "&amp;" into "&amp;amp;".
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, code) => {
    const c = code.toLowerCase();
    if (c === 'amp')  return '&';
    if (c === 'lt')   return '<';
    if (c === 'gt')   return '>';
    if (c === 'quot') return '"';
    if (c === 'apos') return "'";
    if (c === 'nbsp') return ' ';
    const n = c[1] === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
  });
}

// Make plain words safe to put inside HTML.
function escapeText(s) {
  return decodeEntities(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Make a value safe to put inside an attribute's quotes.
function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
