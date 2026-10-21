// =============================================================================
// Shared server-side helpers for the /api functions
// =============================================================================
// Files in a folder that starts with "_" are NOT turned into API endpoints by
// Vercel, so this is a safe place for code that several endpoints share.
//
//   supabaseAdmin(path, options)  → call the Supabase REST API with the
//                                   service-role key (skips RLS — server only!)
//   getUserFromRequest(req)       → read the "Authorization: Bearer <token>"
//                                   header the browser sends and ask Supabase
//                                   who it belongs to. Returns the user or null.
// =============================================================================

export async function supabaseAdmin(path, options = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// Verifies the signed-in customer's access token with Supabase Auth.
// Never trust a user id sent in the request body — always derive it from the
// token like this.
export async function getUserFromRequest(req) {
  const header = req.headers?.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}
