// =============================================================================
// /api/product-page — product.html with real <title> and share tags
// =============================================================================
// product.html is a static page that fills itself in with JavaScript. That's
// fine for shoppers, but Facebook / Messenger / Viber don't run JavaScript
// when someone shares a link, so they'd show a blank card.
//
// vercel.json rewrites  /product.html?id=…  to this function. It reads the
// product from Supabase, injects the name, price, description and photo into
// the <head> (Open Graph + Twitter tags + Product JSON-LD for Google), and
// returns the same product.html — the page's own script then runs as usual.
//
// If anything goes wrong it still returns the plain page, never an error.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin } from './_lib/supabase-admin.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let cachedHtml = null;
function readProductHtml() {
  if (cachedHtml) return cachedHtml;
  // Vercel bundles files that are read with a static path; locally the
  // dev server runs from the repo root as well.
  const file = path.join(process.cwd(), 'public', 'product.html');
  cachedHtml = fs.readFileSync(file, 'utf8');
  return cachedHtml;
}

export default async function handler(req, res) {
  const html = readProductHtml();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Cache for 5 minutes on Vercel's edge (price/photo changes show up soon after)
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  const id = String(req.query?.id || '');
  if (!UUID_RE.test(id)) return res.status(200).send(html);

  try {
    const rows = await supabaseAdmin(
      `products?id=eq.${id}&is_active=eq.true&select=id,name,description,base_price,category,brands(name,slug),` +
      `product_images(image_url,is_primary,display_order),variants(inventory(channel,quantity))`
    );
    const p = rows?.[0];
    if (!p) return res.status(200).send(html);

    const brand = p.brands?.name || 'Ducks Unlimited';
    const siteUrl = (process.env.SITE_URL || `https://${req.headers.host}`).replace(/\/$/, '');
    const url   = `${siteUrl}/product.html?id=${p.id}`;
    const image = [...(p.product_images || [])]
      .sort((a, b) => (b.is_primary - a.is_primary) || (a.display_order - b.display_order))[0]?.image_url;
    const desc  = (p.description || `${p.name} by ${brand}. Made in the Philippines.`).slice(0, 200);
    const inStock = (p.variants || []).some(v => (v.inventory || []).some(i => i.channel === 'online' && i.quantity > 0));

    const jsonLd = {
      '@context': 'https://schema.org', '@type': 'Product',
      name: p.name, description: desc, image: image ? [image] : undefined, brand: { '@type': 'Brand', name: brand }, url,
      offers: { '@type': 'Offer', priceCurrency: 'PHP', price: Number(p.base_price).toFixed(2), url,
                availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
    };

    const head = `
  <title>${esc(p.name)} — ${esc(brand)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${esc(url)}" />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="${esc(brand)}" />
  <meta property="og:title" content="${esc(p.name)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${esc(url)}" />
  ${image ? `<meta property="og:image" content="${esc(image)}" />` : ''}
  <meta property="product:price:amount" content="${Number(p.base_price).toFixed(2)}" />
  <meta property="product:price:currency" content="PHP" />
  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${esc(p.name)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  ${image ? `<meta name="twitter:image" content="${esc(image)}" />` : ''}
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`;

    // Pass a function (not a string) so a "$" in a product name or
    // description isn't treated as a special replace pattern like "$&".
    const out = html.replace(/<title>[^<]*<\/title>/, () => head);
    return res.status(200).send(out);
  } catch (err) {
    console.error('product-page error:', err);
    return res.status(200).send(html);
  }
}
