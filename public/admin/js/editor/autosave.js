// =============================================================================
// Ducks Unlimited — Editor autosave (pure: no database, no page)
// =============================================================================
// Saves the draft about 2 seconds after the last change, so nobody loses work
// and there's no "Save" button to forget. If saving fails (no internet), it
// says so and keeps trying — waiting 2s, then 5s, 15s, 30s, 30s… — while the
// changes stay safe in the editor's memory.
//
//   const autosave = createAutosave({
//     save: async () => { ...write the draft to Supabase... },
//     onStatus: (s) => { ...show 'saving' | 'saved' | 'error'... }
//   });
//   autosave.schedule();        // after every change
//   await autosave.flushNow();  // before Publish: save right now
//   autosave.hasPending();      // true while something isn't saved yet
//
// setTimer / clearTimer can be swapped out so tests don't have to wait.
// =============================================================================

export function createAutosave({
  save,
  delayMs = 2000,
  retryMs = [2000, 5000, 15000, 30000],
  onStatus = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout
}) {
  let dirty    = false;   // changes not saved yet
  let timer    = null;
  let running  = null;    // the save in progress (a promise), if any
  let failures = 0;

  function startTimer(ms) {
    if (timer) clearTimer(timer);
    timer = setTimer(() => { timer = null; run().catch(() => {}); }, ms);
  }

  // Save now. Resolves when saved; rejects if the save failed (a retry is
  // already scheduled by then).
  async function run() {
    if (running) {
      // A save is already going. Wait for it; if more changes came in,
      // the code below the await in that save schedules another one.
      try { await running; } catch { /* reported by that save */ }
      if (!dirty) return;
    }
    if (!dirty) return;

    dirty = false;
    onStatus('saving');
    running = (async () => save())();
    try {
      await running;
      failures = 0;
      running = null;
      if (dirty) startTimer(delayMs); // changed during the save → save again
      else onStatus('saved');
    } catch (err) {
      running = null;
      dirty = true; // still not saved
      onStatus('error');
      const wait = retryMs[Math.min(failures, retryMs.length - 1)];
      failures += 1;
      startTimer(wait);
      throw err;
    }
  }

  return {
    schedule() {
      dirty = true;
      if (!running) startTimer(delayMs);
      // If a save is running, it will notice `dirty` when it finishes.
    },

    async flushNow() {
      if (timer) { clearTimer(timer); timer = null; }
      if (!dirty && !running) return;
      await run();
    },

    hasPending() {
      return dirty || !!running;
    }
  };
}
