// =============================================================================
// Ducks Unlimited — Editor Undo / Redo memory (pure: no database, no page)
// =============================================================================
// Every time something changes in the editor, the editor calls
// history.record(page) with a copy of the whole page (all sections + theme).
// Undo steps back to the previous copy; Redo steps forward again.
//
// Typing: we don't want one undo step per letter. If the same field changes
// again within `groupMs` (600 ms), the change is folded into the same step.
// The editor passes the field as `groupKey`, e.g. 's123.headline'.
//
// The memory only lasts while the editor is open. For older versions, use
// the History panel (saved each time someone publishes).
//
//   const history = createHistory();
//   history.reset(page);                 // when the editor loads
//   history.record(page, 's1.headline'); // after each change
//   const previous = history.undo();     // → page, or null if nothing to undo
// =============================================================================

export function createHistory({ limit = 50, groupMs = 600, now = () => Date.now() } = {}) {
  let states = [];   // copies of the page, oldest first
  let index  = -1;   // which copy is "now"
  let lastKey  = null;
  let lastTime = -Infinity;

  return {
    // Start fresh (editor loaded, or after a publish).
    reset(page) {
      states = [clone(page)];
      index = 0;
      lastKey = null;
    },

    // Remember a change.
    record(page, groupKey) {
      const t = now();
      const sameTyping = groupKey && groupKey === lastKey && t - lastTime < groupMs;

      // Anything we had undone is gone once a new change is made.
      states = states.slice(0, index + 1);

      if (sameTyping && index > 0) {
        states[index] = clone(page);      // fold into the current step
      } else {
        states.push(clone(page));
        // Keep at most `limit` steps to undo (plus the current state).
        if (states.length > limit + 1) states = states.slice(states.length - (limit + 1));
      }
      index = states.length - 1;
      lastKey = groupKey || null;
      lastTime = t;
    },

    undo() {
      if (index <= 0) return null;
      index -= 1;
      lastKey = null; // next change starts a new step
      return clone(states[index]);
    },

    redo() {
      if (index >= states.length - 1) return null;
      index += 1;
      lastKey = null;
      return clone(states[index]);
    },

    canUndo() { return index > 0; },
    canRedo() { return index < states.length - 1; }
  };
}

// A deep copy, so later changes to the page can't reach into our memory.
function clone(value) {
  return structuredClone(value);
}
