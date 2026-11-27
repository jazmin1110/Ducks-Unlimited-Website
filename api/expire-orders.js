// =============================================================================
// /api/expire-orders — tidy up abandoned checkouts
// =============================================================================
// Every "Place Order" click creates a pending order before the shopper even
// sees the payment page. Most of those are never paid. This marks any online
// order that is still 'pending' after EXPIRE_AFTER_MINUTES as 'expired', so
// the admin's "Not paid yet" tab and the customer's My Orders stay clean.
//
// COD orders are never expired here (there's no payment to wait for).
// Maya orders that DID get paid are caught first by asking Maya — so a
// customer who paid but closed the tab still gets marked paid, not expired.
//
// Runs automatically on Vercel once a day at 2am Philippine time (18:00 UTC,
// see "crons" in vercel.json). The free Hobby plan only allows daily crons.
// Vercel calls it with  Authorization: Bearer <CRON_SECRET>  — set CRON_SECRET
// in the environment so nobody else can trigger it.
// You can also run it by hand:  curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/expire-orders
// =============================================================================

import { supabaseAdmin } from './_lib/supabase-admin.js';
import { getMayaCheckout, isMayaSandbox } from './_lib/maya.js';
import { markOrderPaid } from './_lib/orders.js';

const EXPIRE_AFTER_MINUTES = 120;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth   = req.headers?.authorization || '';
  // Locked unless CRON_SECRET is set AND the caller sends it. (Before, a
  // missing CRON_SECRET left this open to anyone.) Vercel's cron sends it.
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const cutoff = new Date(Date.now() - EXPIRE_AFTER_MINUTES * 60_000).toISOString();

  try {
    const stale = await supabaseAdmin(
      `orders?payment_status=eq.pending&payment_method=neq.cod&created_at=lt.${encodeURIComponent(cutoff)}` +
      `&select=id,order_number,payment_provider,payment_reference,total_amount&limit=200`
    );

    let expired = 0, paid = 0, skipped = 0;

    for (const o of stale || []) {
      // Last chance: did Maya actually get paid for this one?
      if (o.payment_provider === 'maya' && o.payment_reference) {
        try {
          const c = await getMayaCheckout(o.payment_reference);
          const amt = Number(c.totalAmount?.amount ?? c.totalAmount?.value);
          if (c.paymentStatus === 'PAYMENT_SUCCESS' && c.requestReferenceNumber === o.id
              && Math.abs(amt - Number(o.total_amount)) < 0.01) {
            await markOrderPaid(o.id, { sandbox: isMayaSandbox() });
            paid++;
            continue;
          }
          // Still open at Maya? (e.g. shopper is on the payment page right now)
          if (['PENDING_TOKEN', 'PENDING_PAYMENT', 'FOR_AUTHENTICATION', 'AUTHENTICATING'].includes(c.paymentStatus)) {
            skipped++;
            continue;
          }
        } catch (err) {
          console.warn('expire-orders: Maya lookup failed for', o.order_number, err.message);
          skipped++;
          continue;
        }
      }

      await supabaseAdmin(`orders?id=eq.${o.id}`, {
        method: 'PATCH', body: JSON.stringify({ payment_status: 'expired' }),
      });
      expired++;
    }

    return res.status(200).json({ ok: true, checked: (stale || []).length, expired, paid, skipped });
  } catch (err) {
    console.error('expire-orders error:', err);
    return res.status(500).json({ error: 'Sweep failed.' });
  }
}
