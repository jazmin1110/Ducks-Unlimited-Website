// =============================================================================
// Philippine provinces — used by address forms (account + checkout)
// =============================================================================
// A dropdown instead of free text means couriers get a consistent spelling
// ("Metro Manila", not "MM" / "NCR" / "manila"). Metro Manila is first because
// most orders ship there.
//
// Usage:
//   import { fillProvinceSelect } from '/js/ph-locations.js';
//   fillProvinceSelect(document.getElementById('province'), 'Cebu');
// =============================================================================

export const PH_PROVINCES = [
  'Metro Manila',
  'Abra', 'Agusan del Norte', 'Agusan del Sur', 'Aklan', 'Albay', 'Antique',
  'Apayao', 'Aurora', 'Basilan', 'Bataan', 'Batanes', 'Batangas', 'Benguet',
  'Biliran', 'Bohol', 'Bukidnon', 'Bulacan', 'Cagayan', 'Camarines Norte',
  'Camarines Sur', 'Camiguin', 'Capiz', 'Catanduanes', 'Cavite', 'Cebu',
  'Cotabato', 'Davao de Oro', 'Davao del Norte', 'Davao del Sur',
  'Davao Occidental', 'Davao Oriental', 'Dinagat Islands', 'Eastern Samar',
  'Guimaras', 'Ifugao', 'Ilocos Norte', 'Ilocos Sur', 'Iloilo', 'Isabela',
  'Kalinga', 'La Union', 'Laguna', 'Lanao del Norte', 'Lanao del Sur', 'Leyte',
  'Maguindanao del Norte', 'Maguindanao del Sur', 'Marinduque', 'Masbate',
  'Misamis Occidental', 'Misamis Oriental', 'Mountain Province',
  'Negros Occidental', 'Negros Oriental', 'Northern Samar', 'Nueva Ecija',
  'Nueva Vizcaya', 'Occidental Mindoro', 'Oriental Mindoro', 'Palawan',
  'Pampanga', 'Pangasinan', 'Quezon', 'Quirino', 'Rizal', 'Romblon', 'Samar',
  'Sarangani', 'Siquijor', 'Sorsogon', 'South Cotabato', 'Southern Leyte',
  'Sultan Kudarat', 'Sulu', 'Surigao del Norte', 'Surigao del Sur', 'Tarlac',
  'Tawi-Tawi', 'Zambales', 'Zamboanga del Norte', 'Zamboanga del Sur',
  'Zamboanga Sibugay',
];

// Fills a <select> with the provinces. If `selected` isn't in the list
// (e.g. an old free-text value like "NCR"), it's kept as an extra option so
// the customer's saved data is never silently lost.
export function fillProvinceSelect(select, selected = '') {
  const options = ['<option value="">Select province</option>'];
  const known = PH_PROVINCES.some(p => p.toLowerCase() === String(selected).toLowerCase());
  if (selected && !known) options.push(`<option>${String(selected).replace(/</g, '&lt;')}</option>`);
  for (const p of PH_PROVINCES) options.push(`<option>${p}</option>`);
  select.innerHTML = options.join('');

  const match = PH_PROVINCES.find(p => p.toLowerCase() === String(selected).toLowerCase());
  select.value = match || selected || '';
}
