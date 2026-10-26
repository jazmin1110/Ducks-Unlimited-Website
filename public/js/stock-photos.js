// =============================================================================
// Stock photos — TEMPORARY stand-ins until real photos are uploaded
// =============================================================================
// Anywhere the site needs a photo and none has been uploaded yet (homepage
// hero, collection tiles, editorial blocks, product photos), it uses one of
// these instead of an empty box.
//
// As soon as a real photo is uploaded in the admin (Admin → Design for the
// homepage, Admin → Products for products), the real photo wins automatically.
// Nothing here needs to be deleted for that to happen.
//
// To stop using stock photos completely: set USE_STOCK_PHOTOS to false.
//
// Ducks Unlimited homepage photos are our own (see HOME.du below).
// Everything else is from Unsplash (https://unsplash.com/license): free to use,
// including commercially, no permission needed. They're hotlinked from
// Unsplash's own image server, which is what Unsplash asks for.
// =============================================================================

export const USE_STOCK_PHOTOS = true;

// Builds an Unsplash image URL at a sensible size (w = width in pixels).
function unsplash(id, w = 1200) {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=75`;
}

// ── Homepage photos, per brand ──
// Ducks Unlimited: REAL photos of our own stores and products, taken from the
// Ducks Unlimited Facebook page and Lazada store. They live in /images/brand
// and /images/products/du on this site (not hotlinked — Facebook links expire).
// Rocwood: denim, leather, brick — still Unsplash stand-ins (no real photos yet).
const HOME = {
  du: {
    hero:     '/images/brand/du-store-polo-rack.jpg',     // rack of colourful polos in-store
    men:      '/images/brand/du-store-new-arrivals.jpg',  // navy polo on the new-arrivals rail
    women:    '/images/products/du/ladies-yneck-pink.jpg', // ladies' Y-neck shirt, pale pink
    kids:     '/images/products/du/kids-tee-natural.jpg',  // kids' round-neck tee
    material: '/images/brand/du-flatlay-green-polo.jpg',  // folded green polo, paint splash
    workshop: '/images/brand/du-flatlay-tipped-polos.jpg', // two tipped-collar polos, flat-lay
  },
  rw: {
    hero:     unsplash('1587072707615-c95b154d3ccb', 1800), // man in a leather jacket by a brick wall
    men:      unsplash('1516257984-b1b4d707412e', 900),     // man in a denim jacket
    women:    unsplash('1587155471946-9e8d4d1132fa', 900),  // woman in a denim jacket
    kids:     unsplash('1534880786429-7cb3199b7b0f', 900),  // toddler in a hooded jacket
    material: unsplash('1645859610425-f0f4177df5f0', 1100), // denim close-up
    workshop: unsplash('1557113166-86fc668c156e', 1100),    // old sewing machine
  },
};

// ── Product photos, per category (same categories as Admin → Products) ──
const PRODUCT = {
  polo:      [unsplash('1586363129094-d7a38564fae1', 900), unsplash('1609655106619-9d28f4f79c49', 900)],
  't-shirt': [unsplash('1581655353564-df123a1eb820', 900), unsplash('1562157873-818bc0726f68', 900)],
  shorts:    [unsplash('1562157873-818bc0726f68', 900)],
  pants:     [unsplash('1562157873-818bc0726f68', 900)],
  accessories: [unsplash('1562157873-818bc0726f68', 900)],
  others:    [unsplash('1562157873-818bc0726f68', 900)],
};

// Placeholder URLs from early testing (random pictures, e.g. waterfalls).
// They count as "no photo yet" so the stock photo shows instead.
function isPlaceholder(url) {
  return /picsum\.photos/.test(url || '');
}

// The photo to show for a homepage slot.
//   url   → what's saved in Admin → Design ('' if nothing)
//   brand → 'du' or 'rw'
//   slot  → 'hero', 'men', 'women', 'kids', 'material' or 'workshop'
export function homePhoto(url, brand, slot) {
  if (url && !isPlaceholder(url)) return url;
  if (!USE_STOCK_PHOTOS) return url || '';
  return HOME[brand]?.[slot] || '';
}

// The photo for a collection tile, worked out from its link
// (/shop.html?audience=men → 'men').
export function tilePhoto(url, brand, link) {
  const slot = (String(link || '').match(/audience=(men|women|kids)/) || [])[1];
  return homePhoto(url, brand, slot || 'men');
}

// The photo for an editorial block, worked out from its words
// ("workshop", "hand-finished", "made in" → workshop; anything else → material).
export function editorialPhoto(url, brand, text) {
  const slot = /workshop|hand|made in|sewn|stitch/i.test(String(text || '')) ? 'workshop' : 'material';
  return homePhoto(url, brand, slot);
}

// Stock product photos for a category, as [{ image_url }] like product_images.
// Returns [] when stock photos are switched off.
export function productPhotos(category) {
  if (!USE_STOCK_PHOTOS) return [];
  return (PRODUCT[category] || PRODUCT.others).map((image_url, i) => ({
    image_url, is_primary: i === 0, display_order: i, isStock: true,
  }));
}
