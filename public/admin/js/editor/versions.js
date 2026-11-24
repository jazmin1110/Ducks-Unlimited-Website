// =============================================================================
// Ducks Unlimited — Version history panel ("History" in the editor's top bar)
// =============================================================================
// Every Publish saves a copy of the whole homepage in the page_versions table
// (see database/migrations/034_theme_editor.sql). This panel lists them,
// newest first, and lets you:
//
//   Preview → show that version in the middle of the editor (nothing saved)
//   Restore → make that version your draft. It goes live only when you
//             press Publish, like any other change, and Undo can take it back.
//
//   openVersionsPanel({
//     pageKey: 'home', brandId,
//     onPreview: (snapshot) => {...},  // show it in the preview
//     onRestore: (snapshot) => {...},  // put it in the draft
//     onClose:   () => {...}
//   });
// =============================================================================

import { supabase } from '/lib/supabase.js';

export async function openVersionsPanel({ pageKey, brandId, onPreview, onRestore, onClose }) {
  const panel = document.querySelector('[data-versions-panel]');
  panel.hidden = false;
  panel.innerHTML = `
    <div class="versions__head">
      <h2>History</h2>
      <button type="button" class="icon-btn" data-versions-close aria-label="Close history">✕</button>
    </div>
    <p class="versions__intro">A copy of the homepage is saved every time someone presses Publish.</p>
    <ul class="versions__list" data-versions-list><li class="versions__empty">Loading…</li></ul>
  `;

  const close = () => {
    panel.hidden = true;
    panel.innerHTML = '';
    onClose?.();
  };
  panel.querySelector('[data-versions-close]').addEventListener('click', close);

  const { data, error } = await supabase
    .from('page_versions')
    .select('id, snapshot, published_at, published_by_email')
    .eq('page_key', pageKey)
    .eq('brand_id', brandId)
    .order('published_at', { ascending: false })
    .limit(100);

  const list = panel.querySelector('[data-versions-list]');
  if (!list) return { close }; // closed while loading

  if (error) {
    list.innerHTML = `<li class="versions__empty">Couldn't load the history. Check your internet connection and try again.</li>`;
    return { close };
  }
  if (!data?.length) {
    list.innerHTML = `<li class="versions__empty">Nothing yet. The first version is saved the next time you press Publish.</li>`;
    return { close };
  }

  list.innerHTML = data.map((v, i) => `
    <li class="versions__item" data-version-id="${v.id}">
      <div class="versions__when">
        ${formatWhen(v.published_at)}
        ${i === 0 ? '<span class="versions__live">Live now</span>' : ''}
      </div>
      <div class="versions__who">${escapeHtml(v.published_by_email || 'Unknown')}</div>
      <div class="versions__actions">
        <button type="button" class="btn-secondary" data-version-preview>Preview</button>
        <button type="button" class="btn-secondary" data-version-restore>Restore</button>
      </div>
    </li>
  `).join('');

  list.addEventListener('click', (e) => {
    const item = e.target.closest('[data-version-id]');
    if (!item) return;
    const version = data.find((v) => v.id === item.dataset.versionId);
    if (!version) return;

    if (e.target.closest('[data-version-preview]')) {
      list.querySelectorAll('.is-previewing').forEach((el) => el.classList.remove('is-previewing'));
      item.classList.add('is-previewing');
      onPreview(version.snapshot);
    }
    if (e.target.closest('[data-version-restore]')) {
      if (!confirm('Replace your current draft with this version? It goes live only when you press Publish.')) return;
      onRestore(version.snapshot);
      close();
    }
  });

  return { close };
}

// "24 Nov 2026, 3:12 pm"
function formatWhen(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return `${date}, ${time}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
