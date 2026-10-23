// =============================================================================
// Members — import from Access, and export for Oboda
// =============================================================================
// Used by /admin/members.html.
//
// IMPORT (analyzeMembersFile → applyMembersPlan)
//   Reads the member list exported from Microsoft Access (Excel or CSV).
//   We don't know exactly what the Access columns are called, so we accept
//   the usual names — "Membership No", "Card Number", "Mobile", "E-mail"… —
//   see COLUMN_NAMES below. Add more names there if a file isn't recognised.
//
//   Each row is matched to an existing member by member number:
//     * new number      → added
//     * existing number → updated (only if something actually changed)
//   Nothing is ever deleted by an import.
//
// OBODA EXPORT (buildObodaCustomersCsv)
//   Builds a file in Oboda's "Bulk Create Customers" format, so every member
//   becomes an Oboda customer with Code = their card number. The cashier can
//   then find them in Quick Checkout.
// =============================================================================

import { supabase } from '/lib/supabase.js';
import { parseCsv, toCsv } from '/admin/js/csv.js';
import { fetchAll } from '/admin/js/bulk-data.js';


// ── Column names we recognise (compared lowercase, ignoring spaces/symbols) ──
const COLUMN_NAMES = {
  member_number: ['membernumber', 'membershipnumber', 'membershipno', 'memberno', 'membershipid', 'memberid',
                  'cardnumber', 'cardno', 'card', 'number', 'no', 'code', 'membernum', 'membershipnum'],
  name:          ['name', 'fullname', 'membername', 'customername', 'customer'],
  first_name:    ['firstname', 'givenname', 'first'],
  last_name:     ['lastname', 'surname', 'familyname', 'last'],
  phone:         ['mobile', 'mobilenumber', 'mobileno', 'phone', 'phonenumber', 'phoneno', 'contact',
                  'contactnumber', 'contactno', 'cellphone', 'cellphonenumber', 'cellno', 'cp', 'cpnumber', 'cpno'],
  email:         ['email', 'emailaddress', 'eadd', 'emailadd'],
  tier:          ['tier', 'type', 'membershiptype', 'membertype', 'level', 'category', 'cardtype', 'class'],
  member_since:  ['membersince', 'datejoined', 'joined', 'joindate', 'dateissued', 'issued', 'dateapplied', 'date'],
  elite_since:   ['elitesince', 'eliteupgradedate', 'upgradedate', 'dateupgraded', 'elitedate'],
  notes:         ['notes', 'remarks', 'note', 'comments'],
};

// Lowercase and drop spaces, dots, #, etc.: "Membership No." → "membershipno"
const squash = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// For each field, find which column of the file holds it (or null)
function findColumns(headers) {
  const squashed = headers.map(h => ({ key: h.trim().toLowerCase(), s: squash(h) }));
  const result = {};
  for (const [field, names] of Object.entries(COLUMN_NAMES)) {
    // The first name in the list wins, so "membershipno" beats a plain "no"
    let found = null;
    for (const n of names) {
      found = squashed.find(h => h.s === n);
      if (found) break;
    }
    result[field] = found ? found.key : null;
  }
  return result;
}


// ── Cleaning up individual values ───────────────────────────────────────────

// PH mobile numbers → 09XXXXXXXXX. Anything that doesn't look like a PH
// mobile is kept exactly as typed (and flagged as a warning).
export function cleanPhone(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { phone: null, ok: true };
  let d = s.replace(/\D/g, '');
  if (d.startsWith('63')) d = d.slice(2);
  if (d.startsWith('0'))  d = d.slice(1);
  if (/^9\d{9}$/.test(d)) return { phone: '0' + d, ok: true };
  return { phone: s, ok: false };
}

// "Elite", "ELITE 20%", "E" → elite. Everything else → member.
function cleanTier(raw) {
  const s = squash(raw);
  return (s.includes('elite') || s === 'e' || s.includes('20')) ? 'elite' : 'member';
}

// Accepts 2019-01-15, 1/15/2019, 15/01/2019 (when the day is over 12), 2019/1/15.
// Returns 'YYYY-MM-DD', null for blank, or undefined when it can't be read.
function cleanDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const pad = n => String(n).padStart(2, '0');
  const valid = (y, m, d) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  };

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);           // 2019-01-15
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : undefined;
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);             // 1/15/2019
  if (m) {
    let [a, b, y] = [+m[1], +m[2], +m[3]];
    if (y < 100) y += y < 50 ? 2000 : 1900;
    // Access usually saves month/day/year; if the first number is over 12 it must be the day
    const [mo, d] = a > 12 ? [b, a] : [a, b];
    return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : undefined;
  }
  return undefined;
}

const cleanEmail = raw => {
  const s = String(raw ?? '').trim().toLowerCase();
  return s || null;
};
const looksLikeEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Card numbers: keep exactly as written (leading zeros matter), minus spaces
// at the ends. Excel sometimes turns "1234" into "1234.0" — undo that.
const cleanNumber = raw => String(raw ?? '').trim().replace(/\.0$/, '');


// ── Loading what's already in the database ──────────────────────────────────

export async function loadAllMembers() {
  return fetchAll(() => supabase.from('members').select('*').order('member_number'));
}


// ── IMPORT step 1: check the file, save nothing ─────────────────────────────

const FIELDS = ['name', 'phone', 'email', 'tier', 'member_since', 'elite_since', 'notes'];

export async function analyzeMembersFile(text) {
  const { headers, rows } = parseCsv(text);
  if (headers.length === 0 || rows.length === 0) {
    return { fatal: 'The file is empty.' };
  }

  const col = findColumns(headers);
  if (!col.member_number) {
    return { fatal: 'Could not find the membership number column. Rename it to "member_number" (or "Membership No") and try again. '
                  + 'Columns found: ' + headers.join(', ') };
  }
  if (!col.name && !col.first_name && !col.last_name) {
    return { fatal: 'Could not find a name column. Rename it to "name" and try again. Columns found: ' + headers.join(', ') };
  }

  const existing = await loadAllMembers();
  const byNumber = new Map(existing.map(m => [m.member_number, m]));

  const problems = [];
  const warnings = [];
  const seen     = new Map();     // member number → first line it appeared on
  const plan     = [];            // rows to insert/update
  let added = 0, updated = 0, unchanged = 0, elite = 0;

  // Tell them which columns we used, so a wrong guess is easy to spot
  const used = Object.entries(col).filter(([, k]) => k).map(([f, k]) => `${f} ← "${headers.find(h => h.trim().toLowerCase() === k)}"`);
  warnings.push({ line: '—', message: 'Columns used: ' + used.join(', ') });

  for (const r of rows) {
    const line   = r._line;
    const number = cleanNumber(r[col.member_number]);
    const name   = (col.name ? r[col.name] : [r[col.first_name], r[col.last_name]].filter(Boolean).join(' ')).trim();

    if (!number) { problems.push({ line, message: 'No membership number.' }); continue; }
    if (!name)   { problems.push({ line, message: `Member ${number} has no name.` }); continue; }
    if (seen.has(number)) {
      problems.push({ line, message: `Membership number ${number} is also on line ${seen.get(number)}. Each card number must be unique.` });
      continue;
    }
    seen.set(number, line);

    const { phone, ok: phoneOk } = cleanPhone(col.phone ? r[col.phone] : '');
    if (!phoneOk) warnings.push({ line, message: `${number}: "${phone}" doesn't look like a PH mobile number. Kept as typed.` });

    const email = cleanEmail(col.email ? r[col.email] : '');
    if (email && !looksLikeEmail(email)) warnings.push({ line, message: `${number}: "${email}" doesn't look like an email.` });

    const memberSince = cleanDate(col.member_since ? r[col.member_since] : '');
    const eliteSince  = cleanDate(col.elite_since  ? r[col.elite_since]  : '');
    if (memberSince === undefined) warnings.push({ line, message: `${number}: couldn't read the join date "${r[col.member_since]}". Left blank.` });
    if (eliteSince  === undefined) warnings.push({ line, message: `${number}: couldn't read the Elite date "${r[col.elite_since]}". Left blank.` });

    const tier = col.tier ? cleanTier(r[col.tier]) : (eliteSince ? 'elite' : 'member');
    if (tier === 'elite') elite++;

    const row = {
      member_number: number,
      name,
      phone,
      email,
      tier,
      member_since: memberSince ?? null,
      elite_since:  eliteSince ?? null,
      notes: (col.notes ? r[col.notes] : '') || null,
    };

    const old = byNumber.get(number);
    if (!old) {
      added++;
      plan.push({ action: 'add', line, row });
      continue;
    }

    // Only fill in columns the file actually has; keep the rest as they are.
    const merged = { ...row };
    const fileHas = { phone: col.phone, email: col.email, tier: col.tier || col.elite_since,
                      member_since: col.member_since, elite_since: col.elite_since, notes: col.notes, name: true };
    for (const f of FIELDS) if (!fileHas[f]) merged[f] = old[f];
    const changed = FIELDS.filter(f => String(merged[f] ?? '') !== String(old[f] ?? ''));
    if (changed.length === 0) { unchanged++; continue; }

    // Never quietly move an Elite back down to Member
    if (old.tier === 'elite' && merged.tier === 'member') {
      merged.tier = 'elite';
      warnings.push({ line, message: `${number} is Elite on the website but Member in the file. Kept as Elite.` });
      if (changed.length === 1 && changed[0] === 'tier') { unchanged++; continue; }
    }

    updated++;
    plan.push({ action: 'update', line, row: merged, changed: changed.filter(f => !(f === 'tier' && merged.tier === old.tier)) });
  }

  const TIER = { member: 'Member', elite: 'Elite' };
  return {
    fatal: null,
    problems,
    warnings,
    summary: [
      { label: 'Rows in file',   value: rows.length },
      { label: 'New members',    value: added },
      { label: 'Updated',        value: updated },
      { label: 'No change',      value: unchanged },
      { label: 'Elite in file',  value: elite },
    ],
    previewHeaders: ['Line', 'Change', 'Number', 'Name', 'Mobile', 'Email', 'Tier'],
    previewRows: plan.map(p => [
      p.line,
      p.action === 'add' ? 'New' : 'Update: ' + p.changed.join(', '),
      p.row.member_number, p.row.name, p.row.phone ?? '', p.row.email ?? '', TIER[p.row.tier],
    ]),
    changeCount: plan.length,
    plan,
  };
}


// ── IMPORT step 2: save (after the admin clicks Confirm) ────────────────────

export async function applyMembersPlan(plan) {
  // Upsert = "insert, or update if the member number already exists".
  // Sent in batches of 500 so a big Access list doesn't time out.
  const rows = plan.map(p => p.row);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('members')
      .upsert(rows.slice(i, i + 500), { onConflict: 'member_number' });
    if (error) throw new Error('Saving failed: ' + error.message);
  }

  // Match new members to website accounts (by mobile number, then email)
  const { data: linked, error } = await supabase.rpc('admin_link_member_accounts');
  if (error) console.error(error);

  const added   = plan.filter(p => p.action === 'add').length;
  const updated = plan.length - added;
  return `Saved: ${added} new, ${updated} updated.` + (linked ? ` ${linked} matched to website accounts.` : '');
}


// ── Blank template for the "Download template" link ─────────────────────────

export function blankMembersTemplate() {
  return toCsv(
    ['member_number', 'name', 'mobile', 'email', 'tier', 'member_since', 'elite_since', 'notes'],
    [{ member_number: '000123', name: 'Juan dela Cruz', mobile: '09171234567', email: 'juan@example.com',
       tier: 'Member', member_since: '2019-01-15', elite_since: '', notes: '' }],
  );
}


// ── OBODA: Bulk Create Customers file ───────────────────────────────────────
// Column names are Oboda's own (Customers → Bulk Create & Update → Create
// Customers). Oboda's file has no "customer group" column, so the tier is put
// in the remarks; set the Member / Elite groups inside Oboda afterwards.

const OBODA_COLUMNS = ['name', 'code', 'legalName', 'businessStyle', 'mailingAddress', 'email',
                       'phoneNumber', 'website', 'paymentTerms', 'tin', 'salesAgentName',
                       'contactNames', 'remarks'];

export function buildObodaCustomersCsv(members) {
  const rows = members.map(m => ({
    name:        m.name,
    code:        m.member_number,
    email:       m.email ?? '',
    phoneNumber: m.phone ?? '',
    remarks:     m.tier === 'elite' ? 'DU Elite member - 20% off' : 'DU Member - 10% off',
  }));
  return toCsv(OBODA_COLUMNS, rows);
}
