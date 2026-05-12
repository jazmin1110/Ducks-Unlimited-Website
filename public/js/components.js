// =============================================================================
// Ducks Unlimited — Component Loader
// =============================================================================
// Auto-mounts shared HTML snippets from /public/components/ into placeholder
// elements on the page.
//
// How to use in a page:
//
//   <div data-component="nav"></div>
//   <!-- page content -->
//   <div data-component="footer"></div>
//
//   <script type="module" src="/js/components.js"></script>
//
// On load, this script finds every [data-component="X"] element, fetches
// /components/X.html, and replaces the placeholder with the snippet's
// markup. Inline <style> blocks work automatically; <script> blocks are
// re-created so they actually execute.
// =============================================================================

async function mountOne(slot) {
  const name = slot.dataset.component;
  if (!name) return;

  try {
    const res = await fetch(`/components/${name}.html`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Parse the HTML in a <template> so we can manipulate the fragment
    // without it being attached to the page yet.
    const tpl = document.createElement('template');
    tpl.innerHTML = html;

    // Browsers DON'T execute <script> tags inserted via innerHTML. Re-create
    // each one as a fresh node so the browser runs it normally. Without this,
    // helpers like the footer's "current year" updater would never fire.
    tpl.content.querySelectorAll('script').forEach(oldScript => {
      const newScript = document.createElement('script');
      for (const attr of oldScript.attributes) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    });

    // Swap the placeholder for the component's content
    slot.replaceWith(tpl.content);
  } catch (err) {
    console.error(`[components] Failed to mount "${name}":`, err);
  }
}

export async function mountComponents(root = document) {
  const slots = root.querySelectorAll('[data-component]');
  await Promise.all([...slots].map(mountOne));

  // Tell other modules the DOM changed. cart.js listens for this and
  // re-paints any cart count badges that just appeared (e.g. inside the nav).
  window.dispatchEvent(new CustomEvent('cart:change'));
}

// Auto-run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountComponents());
} else {
  mountComponents();
}
