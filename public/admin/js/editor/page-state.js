// =============================================================================
// Ducks Unlimited — Editor page operations (pure: no database, no page)
// =============================================================================
// The editor keeps the page it is editing in memory as:
//
//   page = {
//     sections: [ { id, section_type, position, settings, isNew } ],
//     theme:    { brand_color, ..., heading_font, button_shape }
//   }
//
//   settings → the section's draft (or its live version if no draft yet).
//              Two special flags live inside it:
//                _hidden: true   → kept, but not shown on the website
//                _removed: true  → will be removed when someone publishes
//   isNew    → true until the section has been saved to the database once
//
// Every function here returns a NEW page and never changes the one passed in.
// That makes Undo simple (history.js keeps the old copies) and the code easy
// to test (tests/editor-page-state.test.mjs).
// =============================================================================

export const MAX_SECTIONS = 25;


// Move the section at `fromIndex` to `toIndex`.
export function moveSection(page, fromIndex, toIndex) {
  const p = copy(page);
  const [moved] = p.sections.splice(fromIndex, 1);
  if (!moved) return p;
  p.sections.splice(toIndex, 0, moved);
  return renumber(p);
}

// Put a copy of section `id` right after it. `newId` is the copy's id.
export function duplicateSection(page, id, newId) {
  const p = copy(page);
  const i = p.sections.findIndex((s) => s.id === id);
  if (i === -1) return p;
  const twin = copy(p.sections[i]);
  twin.id = newId;
  twin.isNew = true;
  // Blocks (tiles, slides…) need their own ids so editing one copy's block
  // never affects the other copy.
  if (Array.isArray(twin.settings.blocks)) {
    twin.settings.blocks = twin.settings.blocks.map((b) => ({ ...b, id: newBlockId() }));
  }
  p.sections.splice(i + 1, 0, twin);
  return renumber(p);
}

// Hide or show a section.
export function setHidden(page, id, hidden) {
  return updateSettings(page, id, (settings) => {
    if (hidden) settings._hidden = true;
    else delete settings._hidden;
  });
}

// Mark a section to be removed at the next Publish (the editor list hides it).
export function markRemoved(page, id) {
  return updateSettings(page, id, (settings) => { settings._removed = true; });
}

// Undo a remove.
export function unmarkRemoved(page, id) {
  return updateSettings(page, id, (settings) => { delete settings._removed; });
}

// Add a section after section `afterId` (or at the end).
// Throws if the page already has MAX_SECTIONS sections.
export function addSection(page, section, afterId = null) {
  const count = page.sections.filter((s) => !s.settings?._removed).length;
  if (count >= MAX_SECTIONS) {
    throw new Error(`A page can have at most ${MAX_SECTIONS} sections.`);
  }
  const p = copy(page);
  const i = afterId ? p.sections.findIndex((s) => s.id === afterId) : -1;
  if (i === -1) p.sections.push(copy(section));
  else p.sections.splice(i + 1, 0, copy(section));
  return renumber(p);
}

// Sections that will actually show on the website.
export function visibleSections(page) {
  return page.sections.filter((s) => !s.settings?._hidden && !s.settings?._removed);
}

// Is the page OK to publish? Refuses an empty homepage.
export function canPublish(page) {
  if (!visibleSections(page).length) {
    return {
      ok: false,
      message: 'Your homepage would be empty. Add or show at least one section before publishing.'
    };
  }
  return { ok: true };
}

// Turn a saved version (from the History panel) into the page the editor
// should show. Nothing here touches the live site — it only changes the draft.
//   - sections still in the database get the saved settings back
//   - sections deleted since then come back as new sections
//   - sections that didn't exist in that version are marked removed
//   makeId → gives an id for each section that has to be re-created
export function restoreSnapshot(page, snapshot, makeId) {
  const current = new Map(page.sections.map((s) => [s.id, s]));
  const used = new Set();
  const restored = [];

  for (const saved of snapshot?.sections || []) {
    const existing = current.get(saved.id);
    if (existing) {
      used.add(existing.id);
      restored.push({ ...copy(existing), settings: copy(saved.settings || {}) });
    } else {
      restored.push({
        id: makeId(),
        section_type: saved.section_type,
        position: saved.position,
        settings: copy(saved.settings || {}),
        isNew: true
      });
    }
  }

  // Sections that weren't in that version → removed at the next Publish.
  for (const s of page.sections) {
    if (!used.has(s.id)) {
      restored.push({ ...copy(s), settings: { ...copy(s.settings), _removed: true } });
    }
  }

  return renumber({
    sections: restored,
    theme: snapshot?.theme ? copy(snapshot.theme) : copy(page.theme)
  });
}


// ── Helpers ─────────────────────────────────────────────────────────────────

function updateSettings(page, id, change) {
  const p = copy(page);
  const s = p.sections.find((x) => x.id === id);
  if (s) change(s.settings || (s.settings = {}));
  return p;
}

// Positions 10, 20, 30… in list order (gaps make later inserts easy).
function renumber(page) {
  page.sections.forEach((s, i) => { s.position = (i + 1) * 10; });
  return page;
}

function copy(value) {
  return structuredClone(value);
}

export function newBlockId() {
  return `blk_${Math.random().toString(36).slice(2, 10)}`;
}
