// Passports: one record per traveler (collection "passports", id = traveler id), and the validity check against the trip dates.
import { cols } from './store.js';
import { parseDate, isoDate } from './util.js';

export const MIN_MONTHS_AFTER_TRIP = 6;   // many countries ask for 6 months of validity after the trip

export const passportOf = (travelerId) => cols.live('passports').find((p) => p.id === travelerId) || null;

const addMonths = (iso, n) => { const d = parseDate(iso); d.setMonth(d.getMonth() + n); return isoDate(d); };

/** { level: 'missing' | 'expired' | 'short' | 'ok', text } for a passport (or null) and the last day of the trip. */
export function passportStatus(p, tripEnd) {
  if (!p || !p.number) return { level: 'missing', text: 'Sin cargar' };
  if (!p.expires) return { level: 'missing', text: 'Falta la fecha de vencimiento' };
  if (p.expires < tripEnd) return { level: 'expired', text: 'Vence antes de que termine el viaje' };
  if (p.expires < addMonths(tripEnd, MIN_MONTHS_AFTER_TRIP)) return { level: 'short', text: `Vence a menos de ${MIN_MONTHS_AFTER_TRIP} meses del regreso (algunos países lo exigen)` };
  return { level: 'ok', text: 'Vigente para todo el viaje' };
}
