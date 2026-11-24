// =============================================================================
// /api/newsletter-signup — the homepage "Email sign-up" section's form
// =============================================================================
// Saves an email address (with the moment the person agreed to the consent
// line) in the newsletter_signups table. Admins see the list in
// Admin → Customers → Email sign-ups. Sending newsletters is a later decision.
//
// Accepts POST only, as either:
//   - a normal form post (works without JavaScript): email, brand, return_to,
//     website (a hidden trap field — see below). Answers by sending the
//     browser back to the page with ?subscribed=1 or ?subscribe_error=1.
//   - JSON { email, brand, website } (from the page's script): answers
//     { ok: true } or { ok: false, error } with status 400.
//
// Protection against bots:
//   - "website" is a hidden field people never see. Bots fill in every box;
//     if it has anything in it we pretend it worked and save nothing.
//   - at most 5 sign-ups an hour from one internet address.
//
// The same email for the same brand is only saved once (capital letters
// don't count as different — see migration 034).
// =============================================================================

import { supabaseAdmin } from './_lib/supabase-admin.js';
import { allowRequest } from './_lib/ratelimit.js';

const BRANDS = ['du', 'rw'];

// A sensible email check: trimmed, at most 254 characters, exactly one @,
// something before it, a dot in the part after it, and no spaces.
export function isValidEmail(value) {
  const s = String(value ?? '').trim();
  if (!s || s.length > 254 || /\s/.test(s)) return false;
  const parts = s.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain) return false;
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return false;
  return true;
}

// Where to send the browser back to: only a page on this website.
// ("//evil.com" and "/\evil.com" look like paths but browsers treat them as
// other websites, so they're refused too.)
export function safeReturnPath(value) {
  const s = String(value || '');
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\')) return '/';
  return s;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = readBody(req);
  const isJson = String(req.headers?.['content-type'] || '').includes('application/json');

  // Answer in the way the request came in.
  const reply = (ok, error) => {
    if (isJson) return ok ? res.status(200).json({ ok: true }) : res.status(400).json({ ok: false, error });
    const back = safeReturnPath(body.return_to);
    const joiner = back.includes('?') ? '&' : '?';
    res.statusCode = 303; // "go and look at this page now"
    res.setHeader('Location', `${back}${joiner}${ok ? 'subscribed=1' : 'subscribe_error=1'}#email-signup`);
    return res.end();
  };

  // 5 sign-ups an hour per internet address.
  if (!allowRequest(req, res, { limit: 5, windowMs: 3_600_000, key: 'newsletter' })) return;

  // Bot trap filled in → look like it worked, save nothing.
  if (String(body.website || '').trim()) return reply(true);

  const email = String(body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) return reply(false, 'Please enter a valid email address.');

  const brandSlug = BRANDS.includes(body.brand) ? body.brand : null;
  if (!brandSlug) return reply(false, 'Unknown brand.');

  try {
    const brands = await supabaseAdmin(`brands?slug=eq.${brandSlug}&select=id`);
    const brandId = brands?.[0]?.id;
    if (!brandId) return reply(false, 'Unknown brand.');

    try {
      await supabaseAdmin('newsletter_signups', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ email, brand_id: brandId, consented_at: new Date().toISOString() })
      });
    } catch (err) {
      // Already signed up (unique email per brand) → that's fine.
      if (!String(err.message).includes('23505')) throw err;
    }
    return reply(true);
  } catch (err) {
    console.error('[newsletter-signup]', err);
    return reply(false, "Sorry — that didn't work. Please try again in a moment.");
  }
}

// Form posts arrive already parsed on Vercel, but as plain text on the local
// dev server — handle both, plus JSON.
function readBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string' && b) {
    try { return JSON.parse(b); } catch { /* not JSON */ }
    return Object.fromEntries(new URLSearchParams(b));
  }
  return {};
}
