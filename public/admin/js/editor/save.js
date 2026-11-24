// =============================================================================
// Ducks Unlimited — Saving a brand-new section (safe to try again)
// =============================================================================
// Autosave retries when the internet drops. A tricky case: the first try to
// create a new section's row can REACH the database while its answer gets
// lost. The retry then hears "that id already exists" (error 23505). If we
// treated that as a failure, autosave would retry forever and nothing after
// that section would ever be saved.
//
// So: "already exists" means our earlier try worked — we just bring the
// row's draft up to date instead.
//
// `client` is the Supabase client (passed in so tests can use a pretend one).
// =============================================================================

export async function insertNewSection(client, row) {
  const { error } = await client.from('page_sections').insert(row);
  if (!error) return;

  if (error.code === '23505') {
    const { error: updateError } = await client.from('page_sections')
      .update({ draft: row.draft, draft_position: row.draft_position })
      .eq('id', row.id);
    if (updateError) throw asError(updateError);
    return;
  }
  throw asError(error);
}

// Supabase hands back plain objects; turn them into real Errors (with the
// same code/message) so the rest of the editor can treat them like any error.
function asError(e) {
  return Object.assign(new Error(e.message || 'Save failed'), e);
}
