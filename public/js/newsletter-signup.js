// =============================================================================
// Ducks Unlimited — Email sign-up form helper (the "Email sign-up" section)
// =============================================================================
// The form works without this file: it posts to /api/newsletter-signup,
// which sends the visitor back to the homepage with ?subscribed=1 (or
// ?subscribe_error=1). This file:
//   1. shows the thank-you (or error) message after that trip, and
//   2. when JavaScript is on, sends the form in the background instead, so
//      the page doesn't reload.
// =============================================================================

// 1. Messages after a normal form post.
function showResultFromAddress(root = document) {
  const params = new URLSearchParams(location.search);
  const ok  = params.get('subscribed') === '1';
  const bad = params.get('subscribe_error') === '1';
  if (!ok && !bad) return;
  const form = root.querySelector('[data-signup-form]');
  if (!form) return;
  showMessage(form, ok);
  // Tidy the address so a refresh doesn't show the message again.
  params.delete('subscribed');
  params.delete('subscribe_error');
  const query = params.toString();
  history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
}

function showMessage(form, ok) {
  form.querySelector('[data-signup-success]').hidden = !ok;
  form.querySelector('[data-signup-error]').hidden = ok;
  if (ok) {
    form.querySelector('.signup__row')?.setAttribute('hidden', '');
    form.querySelector('.signup__label')?.setAttribute('hidden', '');
  }
}

// 2. Send in the background.
document.addEventListener('submit', async (e) => {
  const form = e.target.closest?.('[data-signup-form]');
  if (!form || e.defaultPrevented) return; // e.g. inside the admin editor
  e.preventDefault();

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form));
    const res = await fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    showMessage(form, res.ok && json.ok === true);
  } catch {
    showMessage(form, false);
  } finally {
    button.disabled = false;
  }
});

// The homepage draws its sections after loading, so check again then.
showResultFromAddress();
document.addEventListener('sections:rendered', (e) => showResultFromAddress(e.target), true);
