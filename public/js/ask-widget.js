// =============================================================================
// "Ask us" chat bubble — Ducks Unlimited + Rocwood
// =============================================================================
// Same widget as the AJ's site, restyled for Ducks / Rocwood. The AI itself
// runs in /api/ask (server side — the API key never reaches the browser).
//
// Loaded by /js/components.js on every shop page (not admin, not sign-in).
// It asks /api/ask first and stays completely hidden unless the helper is
// switched on, so shipping this code changes nothing until you add the key.
//
// Colours follow the brand automatically: it uses the same --color-primary /
// --color-accent CSS variables as the rest of the site, and those switch
// between Ducks green/gold and Rocwood navy/bronze.
// =============================================================================

import { getCurrentBrand } from '/js/brand.js';

// Stacking (z-index):
//   site nav 50 · product page sticky "Add to bag" bar 90 · bubble 95
//   mini-cart / filters / quick view 200-300 · photo lightbox 1200
// So the bubble floats over the page and the sticky bar, but anything the
// shopper opens on purpose (bag, filters, quick view) covers it.
const css = `
.duask-btn{position:fixed;right:18px;bottom:calc(18px + var(--duask-lift, 0px));z-index:95;
  display:flex;align-items:center;gap:8px;background:var(--color-primary,#1B4D2E);color:#fff;
  border:0;border-radius:999px;padding:12px 18px;min-height:44px;cursor:pointer;
  font:600 14px/1 var(--font-body,system-ui),sans-serif;letter-spacing:.02em;
  box-shadow:0 0 0 2px var(--color-accent,#C9A84C),0 8px 24px rgba(0,0,0,.18);transition:transform .15s}
.duask-btn:hover{transform:translateY(-1px)}
.duask-btn svg{width:18px;height:18px;flex:none}
.duask-box{position:fixed;right:18px;bottom:calc(78px + var(--duask-lift, 0px));z-index:95;
  width:min(370px,calc(100vw - 36px));height:min(500px,calc(100vh - 140px - var(--duask-lift, 0px)));
  background:var(--color-white,#fff);border:1px solid var(--color-border,#e8e3d8);border-radius:14px;
  box-shadow:0 16px 48px rgba(0,0,0,.18);display:none;flex-direction:column;overflow:hidden;
  font:14px/1.5 var(--font-body,system-ui),sans-serif;color:var(--color-text,#1A1A1A)}
.duask-box.open{display:flex}
.duask-head{display:flex;align-items:center;justify-content:space-between;gap:8px;
  background:var(--color-primary,#1B4D2E);color:#fff;padding:6px 6px 6px 16px;
  border-bottom:2px solid var(--color-accent,#C9A84C)}
.duask-title{font:600 19px/1.2 var(--font-heading,Georgia),serif;letter-spacing:.01em}
.duask-sub{display:block;font:400 11px/1.3 var(--font-body,system-ui),sans-serif;opacity:.8;letter-spacing:.04em}
.duask-head button{background:none;border:0;color:#fff;font-size:26px;line-height:1;width:44px;height:44px;border-radius:50%;cursor:pointer}
.duask-log{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:8px;background:var(--color-bg-warm,#faf7f2)}
.duask-msg{max-width:85%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}
.duask-me{align-self:flex-end;background:var(--color-primary,#1B4D2E);color:#fff;border-bottom-right-radius:4px}
.duask-bot{align-self:flex-start;background:var(--color-white,#fff);border:1px solid var(--color-border,#e8e3d8);border-bottom-left-radius:4px}
.duask-typing{opacity:.65;font-style:italic}
.duask-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.duask-chips button{background:var(--color-white,#fff);border:1px solid var(--color-accent,#C9A84C);color:var(--color-primary,#1B4D2E);
  border-radius:999px;padding:7px 12px;min-height:36px;font:500 13px var(--font-body,system-ui),sans-serif;cursor:pointer}
.duask-form{display:flex;gap:6px;padding:10px;border-top:1px solid var(--color-border,#e8e3d8);background:var(--color-white,#fff)}
/* 16px on purpose: iPhones zoom the whole page in when you tap a text box with smaller text */
.duask-form input{flex:1;min-width:0;padding:10px 14px;border:1px solid var(--color-border,#e8e3d8);border-radius:999px;
  font:inherit;font-size:16px;color:inherit;background:var(--color-white,#fff)}
.duask-form input:focus{outline:2px solid var(--color-accent,#C9A84C);outline-offset:1px}
.duask-form button{background:var(--color-primary,#1B4D2E);color:#fff;border:0;border-radius:999px;padding:0 16px;min-height:44px;
  font:600 14px var(--font-body,system-ui),sans-serif;cursor:pointer}
.duask-form button:disabled{opacity:.5;cursor:wait}
.duask-foot{font-size:11px;color:var(--color-text-light,#757575);text-align:center;padding:0 10px 8px;background:var(--color-white,#fff)}
.duask-backdrop{display:none}
/* Hide the bubble while the phone menu drawer is open */
html:has(#navToggle:checked) .duask-btn{display:none}
/* Phones: the chat opens as a panel from the bottom edge over a dimmed page (tap the dim area to close).
   dvh = the height you can actually see, so the panel shrinks instead of running off-screen when the keyboard opens. */
@media (max-width:560px){
  .duask-btn{right:14px;bottom:calc(14px + var(--duask-lift, 0px));padding:12px 16px}
  .duask-box{left:0;right:0;bottom:0;width:100%;height:min(580px,85dvh);z-index:251;
    border-radius:16px 16px 0 0;border-bottom:0;padding-bottom:env(safe-area-inset-bottom)}
  .duask-backdrop.open{display:block;position:fixed;inset:0;z-index:250;background:rgba(20,20,20,.45)}
  html.duask-lock,html.duask-lock body{overflow:hidden}
  .duask-btn.hide{display:none}
}
`;

// Speech-bubble icon (inline so there's no extra file to load)
const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';

const SUGGESTIONS = ['What size should I get?', 'How much is shipping?', 'Can I exchange in store?'];

export async function mountAskWidget() {
  if (document.querySelector('.duask-btn')) return;           // already on the page
  const brand = getCurrentBrand()?.slug || 'du';
  const brandName = brand === 'rw' ? 'Rocwood' : 'Ducks Unlimited';
  const ig = brand === 'rw' ? '@rocwood.ph' : '@ducks.ph';

  // Only show if switched on (API key added + not turned off)
  try {
    const r = await fetch(`/api/ask?brand=${brand}`);
    const s = await r.json();
    if (!s.enabled) return;
  } catch { return; }

  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text || '' });

  const btn = el('button', 'duask-btn');
  btn.type = 'button';
  btn.innerHTML = `${ICON}<span>Ask us</span>`;
  btn.setAttribute('aria-label', 'Ask us a question');

  const box = el('div', 'duask-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', `${brandName} helper`);
  const head = el('div', 'duask-head');
  const title = el('div', 'duask-title', brandName);
  title.append(el('span', 'duask-sub', 'Ask about sizes, stock, shipping, returns'));
  const close = el('button', '', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close chat');
  head.append(title, close);

  const log = el('div', 'duask-log');
  log.setAttribute('aria-live', 'polite');
  const form = el('form', 'duask-form');
  const input = Object.assign(el('input'), { placeholder: 'Type your question…', maxLength: 400 });
  input.setAttribute('aria-label', 'Your question');
  const send = el('button', '', 'Send');
  send.type = 'submit';
  form.append(input, send);
  const foot = el('div', 'duask-foot', `AI helper, can make mistakes. For order issues, DM ${ig} or call 0917 530 5428.`);
  box.append(head, log, form, foot);
  const backdrop = el('div', 'duask-backdrop');
  document.body.append(btn, backdrop, box);

  // ── Messages ──
  const history = [];
  const add = (role, text) => {
    const m = el('div', `duask-msg ${role === 'user' ? 'duask-me' : 'duask-bot'}`, text);
    log.append(m);
    log.scrollTop = log.scrollHeight;
    return m;
  };
  const hello = add('assistant', `Hi! I can help with sizes, what's in stock online, shipping and returns.`);
  const chips = el('div', 'duask-chips');
  SUGGESTIONS.forEach(q => {
    const c = el('button', '', q);
    c.type = 'button';
    c.onclick = () => { chips.remove(); ask(q); };
    chips.append(c);
  });
  hello.append(chips);

  // ── Open / close ──
  const isPhone = () => matchMedia('(max-width: 560px)').matches;
  const setOpen = (open) => {
    box.classList.toggle('open', open);
    backdrop.classList.toggle('open', open);
    btn.classList.toggle('hide', open);                               // phones: the panel covers it anyway
    document.documentElement.classList.toggle('duask-lock', open);   // stop the page scrolling behind (phones only, see CSS)
    if (open && !isPhone()) input.focus();                           // phones: wait for a tap so the keyboard doesn't jump up
  };
  btn.onclick = () => setOpen(!box.classList.contains('open'));
  close.onclick = () => setOpen(false);
  backdrop.onclick = () => setOpen(false);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && box.classList.contains('open')) setOpen(false); });

  // ── Product page: move the bubble up when the sticky "Add to bag" bar shows ──
  const sticky = document.getElementById('pdpStickyCta');
  if (sticky) {
    const lift = () => document.documentElement.style.setProperty('--duask-lift', `${sticky.offsetHeight || 0}px`);
    new MutationObserver(lift).observe(sticky, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    new ResizeObserver(lift).observe(sticky);
    lift();
  }

  // On a product page, send which product they're looking at ("does this come in XL?")
  const productId = new URLSearchParams(location.search).get('id') || undefined;

  // ── Ask ──
  async function ask(q) {
    if (!q || send.disabled) return;
    add('user', q);
    send.disabled = true;                            // the text box stays enabled so the phone keyboard doesn't close and reopen
    const typing = add('assistant', 'typing…');
    typing.classList.add('duask-typing');
    let answer;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, brand, productId, history }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));
      const out = await res.json().catch(() => ({}));
      answer = out.answer || out.error;
    } catch { /* network trouble: default below */ }
    answer = answer || `Sorry, I'm having trouble. DM us on IG ${ig} or call 0917 530 5428.`;
    typing.remove();
    add('assistant', answer);
    history.push({ role: 'user', content: q }, { role: 'assistant', content: answer });
    send.disabled = false;
  }

  form.onsubmit = (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q || send.disabled) return;
    input.value = '';
    chips.remove();
    ask(q);
  };
}
