// =============================================================================
// /api/ask — the "Ask us" AI helper (chat bubble on every shop page)
// =============================================================================
// Same idea as the AJ's "Ask us" bubble, built the Ducks way (a Vercel
// function instead of a Supabase Edge Function).
//
//   GET  /api/ask?brand=du
//        → { enabled: true|false }      the bubble only shows when true
//
//   POST /api/ask
//        { question, brand: 'du'|'rw', productId?, history?: [{role, content}] }
//        → { answer }
//
// What the AI is allowed to know (and nothing else):
//   1. Active products for the brand being browsed: name, category, price,
//      colours/sizes, fit + care notes, and whether each one is in stock ONLINE
//      (yes/no only — exact stock counts are never sent to the AI)
//   2. The store list (/admin/stores)
//   3. The Shipping, Returns, Help and Size Guide pages — so when you edit
//      those pages, the helper's answers change with them
//   4. Optional extra notes you write yourself (see "ON / OFF SWITCH" below)
//
// It can't see orders, customers or anything private, and it can't place,
// change or cancel orders.
//
// SETUP (one time):
//   Vercel → ducks-unlimited-website → Settings → Environment Variables
//   → add ANTHROPIC_API_KEY (same kind of key AJ's uses) → Redeploy.
//   No key = the bubble just stays hidden. Nothing breaks.
//
// ON / OFF SWITCH (no redeploy needed) — run in the Supabase SQL editor:
//   Turn OFF:  insert into site_content (key, published)
//              values ('ai.ask', '{"enabled": false}')
//              on conflict (key, brand_id) do update set published = excluded.published;
//   Turn ON + add notes the helper should know (sale dates, promos, etc.):
//              ... values ('ai.ask', '{"enabled": true, "extra": "Year-end sale Dec 1-15, 20% off polos."}') ...
//   (No row at all = ON.)
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin } from './_lib/supabase-admin.js';
import { allowRequest } from './_lib/ratelimit.js';

// Cheap, fast model — same one AJ's uses. Override with the AI_MODEL env var.
const MODEL = process.env.AI_MODEL || 'claude-haiku-5-5';

// Contact details the helper hands out when it doesn't know something
const CONTACT = {
  email: 'ducksunlimited777@yahoo.com',
  phone: '0917 530 5428',
  ig:    { du: '@ducks.ph', rw: '@rocwood.ph' },
};

const BRAND_NAMES = { du: 'Ducks Unlimited', rw: 'Rocwood' };

// The pages the helper reads its policies from (paths inside /public)
const POLICY_PAGES = [
  ['SHIPPING',   'customer-service/shipping.html'],
  ['RETURNS',    'customer-service/returns.html'],
  ['HELP / FAQ', 'customer-service/help.html'],
  ['SIZE GUIDE (all measurements in cm)', 'size-guide.html'],
];


// ─── Small in-memory cache so we don't hit the database on every question ────
// Each Vercel instance keeps its own copy for 5 minutes. After you edit a
// product, the helper catches up within 5 minutes.
const CACHE_MS = 5 * 60_000;
const cache = new Map(); // key → { at, value }

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}


// ─── The on/off switch + your extra notes (site_content row "ai.ask") ────────
async function loadSwitch() {
  return cached('switch', async () => {
    const rows = await supabaseAdmin('site_content?key=eq.ai.ask&select=published,brand_id').catch(() => []);
    const p = rows?.find(r => !r.brand_id)?.published ?? rows?.[0]?.published ?? {};
    return { enabled: p.enabled !== false, extra: String(p.extra || '').slice(0, 3000) };
  });
}

function isEnabled(sw) {
  return Boolean(process.env.ANTHROPIC_API_KEY) && sw.enabled;
}


// ─── Products for one brand, shrunk to what a shopper would ask about ────────
async function loadCatalog(brandSlug) {
  return cached(`catalog:${brandSlug}`, async () => {
    const brands = await supabaseAdmin(`brands?slug=eq.${brandSlug}&select=id`);
    const brandId = brands?.[0]?.id;
    if (!brandId) return [];

    const cols = (withNotes) =>
      `id,name,description,category,audience,base_price,${withNotes ? 'fit_notes,care_notes,' : ''}` +
      `variants(color,size,price_override,inventory(channel,quantity))`;
    const q = (withNotes) =>
      supabaseAdmin(`products?is_active=eq.true&brand_id=eq.${brandId}&select=${cols(withNotes)}&order=name`);

    // fit_notes / care_notes come from migration 033 — load without them if it hasn't run
    let rows;
    try { rows = await q(true); }
    catch (err) {
      if (!String(err.message).includes('42703')) throw err;
      rows = await q(false);
    }

    return (rows || []).map(p => {
      const variants = p.variants || [];
      const prices = variants.map(v => Number(v.price_override ?? p.base_price));
      const online = (v) => (v.inventory || [])
        .filter(i => i.channel === 'online')
        .reduce((sum, i) => sum + (i.quantity || 0), 0);
      const inStock = variants.filter(v => online(v) > 0);
      const uniq = (arr) => [...new Set(arr.filter(Boolean))];

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        for: p.audience || undefined,
        price_php: prices.length && Math.min(...prices) !== Math.max(...prices)
          ? `${Math.min(...prices)}-${Math.max(...prices)}`
          : Number(p.base_price),
        colors: uniq(variants.map(v => v.color)),
        sizes: uniq(variants.map(v => v.size)),
        // Yes/no only. Never the real count.
        in_stock_online: inStock.length > 0,
        sizes_in_stock_online: uniq(inStock.map(v => v.size)),
        colors_in_stock_online: uniq(inStock.map(v => v.color)),
        about: String(p.description || '').replace(/\s+/g, ' ').slice(0, 220) || undefined,
        fit: p.fit_notes || undefined,
        care: p.care_notes || undefined,
      };
    });
  });
}


// ─── Store list ──────────────────────────────────────────────────────────────
async function loadStores() {
  return cached('stores', async () => {
    const rows = await supabaseAdmin(
      'stores?is_active=eq.true&select=name,address,city,province,phone,hours&order=display_order'
    ).catch(() => []);
    return rows || [];
  });
}


// ─── Policy pages: read the real HTML and keep just the words ────────────────
function htmlToText(html) {
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  return main
    .replace(/<(script|style|svg|nav|footer|button)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    // Size guide shows cm and inches; keep only the cm numbers so the table stays readable
    .replace(/<span class="u-in"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<br\s*\/?>|<\/(p|li|h[1-6]|tr|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8369;|&#x20B1;/g, '₱')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .slice(0, 7000);
}

async function loadPolicies(host) {
  return cached('policies', async () => {
    const parts = await Promise.all(POLICY_PAGES.map(async ([label, file]) => {
      let html = '';
      // 1st try: the copy bundled with this function (see vercel.json includeFiles)
      try { html = fs.readFileSync(path.join(process.cwd(), 'public', file), 'utf8'); } catch {}
      // 2nd try: fetch the live page from this same site
      if (!html && host) {
        try {
          const r = await fetch(`https://${host}/${file}`);
          if (r.ok) html = await r.text();
        } catch {}
      }
      return html ? `## ${label}\n${htmlToText(html)}` : '';
    }));
    return parts.filter(Boolean).join('\n\n');
  });
}


// ─── Talk to Claude ──────────────────────────────────────────────────────────
async function callClaude(body) {
  // The whole function may only run 10s (vercel.json), so give up on the AI at 8.5s
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8500);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, ...body }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[ask] Claude API error', res.status, data?.error?.message);
      return null;
    }
    return (data.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n')
      // Plain text only in the chat box — strip **bold** and # headings
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/^#+\s*/gm, '')
      .trim();
  } catch (err) {
    console.error('[ask] Claude call failed', err.name === 'AbortError' ? 'timeout' : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function manilaToday() {
  return new Date().toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}


// ─── The endpoint ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const brand = BRAND_NAMES[req.query?.brand || req.body?.brand] ? (req.query?.brand || req.body?.brand) : 'du';
  const fallback = `Sorry, I'm having trouble right now. Message us on IG ${CONTACT.ig[brand]}, ` +
    `email ${CONTACT.email} or call ${CONTACT.phone}.`;

  try {
    const sw = await loadSwitch();

    // GET: "should the bubble show?"
    if (req.method === 'GET') {
      return res.status(200).json({ enabled: isEnabled(sw) });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!isEnabled(sw)) return res.status(404).json({ error: 'The helper is off right now.' });

    // 8 questions per 10 minutes per visitor — keeps the AI bill tiny
    if (!allowRequest(req, res, { limit: 8, windowMs: 10 * 60_000, key: 'ask' })) return;

    const question = String(req.body?.question || '').trim();
    if (!question) return res.status(400).json({ error: 'Type a question.' });
    if (question.length > 400) return res.status(400).json({ error: 'Please keep it under 400 characters.' });

    // Last few turns only, trimmed, so nobody can stuff in a giant prompt
    const history = (Array.isArray(req.body?.history) ? req.body.history : [])
      .slice(-6)
      .filter(m => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 500) }));

    const [catalog, stores, policies] = await Promise.all([
      loadCatalog(brand).catch(err => { console.error('[ask] catalog', err); return []; }),
      loadStores(),
      loadPolicies(req.headers?.host),
    ]);

    // If they're on a product page, tell the AI which product "this one" means
    const productId = String(req.body?.productId || '');
    const viewing = catalog.find(p => p.id === productId);
    const products = catalog.map(({ id, ...rest }) => rest); // ids aren't useful to the AI

    const name = BRAND_NAMES[brand];
    const system = `You are the friendly shop helper on the ${name} website (Philippines). ${name === 'Ducks Unlimited'
      ? 'Ducks Unlimited makes Egyptian cotton polos, shirts and basics in the Philippines since 1995 — affordable luxury.'
      : 'Rocwood is a sporty, athletic-club style basics brand, sister brand of Ducks Unlimited.'}
Ducks Unlimited and Rocwood share one shop, one account and the same policies.

Answer ONLY from the info below. If the answer isn't there, say you're not sure and point them to IG ${CONTACT.ig[brand]}, email ${CONTACT.email} or call ${CONTACT.phone}. Never make up prices, stock, discounts, sale dates, delivery dates or policies.

RULES
- You can't take, change, cancel or look up orders. To order: add to bag and check out on this site. To check an order: the Track Order page (/track-order.html) or My Orders.
- Stock info is for ONLINE stock only. You don't know what's on the shelf in each store — tell them to call before visiting for a specific item.
- Never say exact stock numbers. "Available" or "sold out online" only.
- For sizing, use the size guide and fit notes. If between sizes, follow the size guide's advice.
- Keep answers under 80 words. Warm, polished, helpful — not salesy. Reply in the customer's language (English, Filipino or Taglish). Plain text only, no markdown.

Today: ${manilaToday()}

PRODUCTS (${name}, JSON):
${JSON.stringify(products)}

STORES (JSON):
${JSON.stringify(stores)}

SHOP POLICIES (copied from the website):
${policies}

EXTRA NOTES FROM THE SHOP:
${sw.extra || '(none)'}`;

    const userTurn = viewing
      ? `[Customer is looking at the product page for: ${viewing.name}]\n${question}`
      : question;

    const answer = await callClaude({
      max_tokens: 350,
      // cache_control: the big product list is re-used across questions, so it's billed at a discount
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [...history, { role: 'user', content: userTurn }],
    });

    return res.status(200).json({ answer: answer || fallback });
  } catch (err) {
    console.error('[ask] failed', err);
    return res.status(200).json({ answer: fallback, enabled: false });
  }
}
