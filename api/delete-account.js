// =============================================================================
// /api/delete-account — Let a customer permanently delete their own account
// =============================================================================
// Required by the PH Data Privacy Act (right to erasure) and by app stores
// if we ever ship an app. Called from the "Delete account" section of
// /account/profile.html.
//
// POST with header  Authorization: Bearer <customer's access token>
// body: { confirm: "DELETE" }
//
// What gets removed (via ON DELETE CASCADE in the database):
//   customer_profiles, customer_addresses, wishlists
// What is KEPT:
//   orders — they're business/tax records. Their user_id is set to null
//   (ON DELETE SET NULL), so they're no longer tied to a login.
//
// Admin accounts can't be deleted here, so nobody locks the shop out by accident.
// =============================================================================

import { supabaseAdmin, getUserFromRequest } from './_lib/supabase-admin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Please sign in again and retry.' });

  if (req.body?.confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Please type DELETE to confirm.' });
  }

  try {
    const admins = await supabaseAdmin(`admin_users?id=eq.${user.id}&select=id`);
    if (admins?.length) {
      return res.status(403).json({ error: 'Admin accounts must be removed from the Supabase dashboard.' });
    }

    // Supabase Auth admin API — removes the login itself.
    const del = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: {
        'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!del.ok) throw new Error(`Auth delete failed: ${del.status} ${await del.text()}`);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('delete-account error:', err);
    return res.status(500).json({ error: 'Could not delete your account right now. Please contact us.' });
  }
}
