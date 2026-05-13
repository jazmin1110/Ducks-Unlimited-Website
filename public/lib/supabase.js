// Supabase client — import this file in any page that needs to talk to the database.
//
// Usage in an HTML file:
//   <script type="module">
//     import { supabase } from '/lib/supabase.js';
//     const { data, error } = await supabase.from('products').select('*');
//   </script>
//
// The anon key is safe to expose in frontend code — it's public by design.
// Supabase Row Level Security (RLS) controls what each user can actually do.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL     = 'https://qrtfgqscpaghtxnhtoyp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFydGZncXNjcGFnaHR4bmh0b3lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Nzc0MjEsImV4cCI6MjA5NDA1MzQyMX0.SkhUmUJmrbtK_M-_X9Gf6ZTsPrWTkRGq_bfka3jBW7A';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
