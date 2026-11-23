// =============================================================================
// Rate limiting for the public /api functions
// =============================================================================
// Stops one computer from hammering checkout or order lookup thousands of
// times (guessing order numbers, creating junk orders).
//
// It counts requests per IP address in this serverless instance's memory.
// Vercel may run several instances, so the real limit can be a few times
// higher than the number here — that's fine, we just want to stop abuse,
// not be exact. For stricter limits, add a Vercel Firewall rule as well.
//
// Usage at the top of a handler:
//   if (!allowRequest(req, res, { limit: 20, windowMs: 60_000 })) return;
// =============================================================================

const buckets = new Map(); // ip → { count, resetAt }

function clientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

// Returns true if the request may continue. When the limit is hit it writes
// the 429 answer itself and returns false.
export function allowRequest(req, res, { limit = 30, windowMs = 60_000, key = '' } = {}) {
  const now = Date.now();
  const id  = `${key}:${clientIp(req)}`;

  // Tidy up old entries now and then so memory doesn't grow forever
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }

  let b = buckets.get(id);
  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(id, b);
  }
  b.count += 1;

  if (b.count > limit) {
    res.setHeader('Retry-After', Math.ceil((b.resetAt - now) / 1000));
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    return false;
  }
  return true;
}
