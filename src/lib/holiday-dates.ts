/**
 * Floating-date computation for holidays whose date varies year-to-year.
 *
 * All functions return Date objects in the local timezone, normalized to
 * 00:00 local. The caller is responsible for any timezone shifting.
 */

/** Returns the date of Easter Sunday for a given year (Gregorian). */
export function easterSunday(year: number): Date {
  // Anonymous Gregorian algorithm (Computus). Accurate for years 1900-2099.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Nth weekday of a month. `weekday`: 0=Sun, 1=Mon, ..., 6=Sat. */
export function nthWeekdayOfMonth(year: number, month1to12: number, weekday: number, n: number): Date {
  const first = new Date(year, month1to12 - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month1to12 - 1, 1 + offset + (n - 1) * 7);
}

/** Last weekday of a month (e.g. last Monday in May = Memorial Day). */
export function lastWeekdayOfMonth(year: number, month1to12: number, weekday: number): Date {
  const last = new Date(year, month1to12, 0); // 0th of next month = last day of this month
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month1to12 - 1, last.getDate() - offset);
}

/** Add N days to a Date and return a new one. */
export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * Lunar New Year is fixed by the Chinese lunisolar calendar; for a small
 * lookup table covering the years we care about. Add entries as needed.
 * Source: official Chinese government / IETF / Wikipedia.
 */
const LUNAR_NEW_YEAR: Record<number, [number, number]> = {
  2024: [2, 10],
  2025: [1, 29],
  2026: [2, 17],
  2027: [2, 6],
  2028: [1, 26],
  2029: [2, 13],
  2030: [2, 3],
  2031: [1, 23],
  2032: [2, 11],
};

/** Hanukkah start date (1st night). Lookup table — Hebrew calendar conversion is too heavy to embed. */
const HANUKKAH_START: Record<number, [number, number]> = {
  2024: [12, 25],
  2025: [12, 14],
  2026: [12, 4],
  2027: [12, 24],
  2028: [12, 12],
  2029: [12, 1],
  2030: [12, 20],
};

/** Diwali (first day) lookup. */
const DIWALI: Record<number, [number, number]> = {
  2024: [11, 1],
  2025: [10, 21],
  2026: [11, 8],
  2027: [10, 29],
  2028: [11, 17],
  2029: [11, 5],
  2030: [10, 26],
};

/** Ramadan start (1st day of fasting) lookup. */
const RAMADAN: Record<number, [number, number]> = {
  2024: [3, 11],
  2025: [2, 28],
  2026: [2, 17],
  2027: [2, 7],
  2028: [1, 27],
  2029: [1, 15],
  2030: [1, 5],
};

/** Holi (festival of colors) lookup. */
const HOLI: Record<number, [number, number]> = {
  2024: [3, 25],
  2025: [3, 14],
  2026: [3, 3],
  2027: [3, 22],
  2028: [3, 11],
  2029: [3, 1],
  2030: [3, 20],
};

function lookupOrFallback(table: Record<number, [number, number]>, year: number): Date | null {
  const hit = table[year];
  if (!hit) return null;
  return new Date(year, hit[0] - 1, hit[1]);
}

/**
 * Compute the date of a holiday by its id for a given year.
 * Returns null if we have no rule/lookup for that holiday.
 */
export function computeFloatingDate(id: string, year: number): Date | null {
  switch (id) {
    case 'easter':            return easterSunday(year);
    case 'good-friday':       return addDays(easterSunday(year), -2);
    case 'palm-sunday':       return addDays(easterSunday(year), -7);
    case 'ash-wednesday':     return addDays(easterSunday(year), -46);
    case 'mardi-gras':        return addDays(easterSunday(year), -47);
    case 'mlk-day':           return nthWeekdayOfMonth(year, 1, 1, 3);          // 3rd Mon Jan
    case 'presidents-day':    return nthWeekdayOfMonth(year, 2, 1, 3);          // 3rd Mon Feb
    case 'mothers-day':       return nthWeekdayOfMonth(year, 5, 0, 2);          // 2nd Sun May
    case 'memorial-day':      return lastWeekdayOfMonth(year, 5, 1);            // Last Mon May
    case 'fathers-day':       return nthWeekdayOfMonth(year, 6, 0, 3);          // 3rd Sun Jun
    case 'donut-day':         return nthWeekdayOfMonth(year, 6, 5, 1);          // 1st Fri Jun
    case 'labor-day':         return nthWeekdayOfMonth(year, 9, 1, 1);          // 1st Mon Sep
    case 'grandparents-day':  return addDays(nthWeekdayOfMonth(year, 9, 1, 1), 6); // Sun after Labor Day
    case 'columbus-day':      return nthWeekdayOfMonth(year, 10, 1, 2);         // 2nd Mon Oct
    case 'thanksgiving':      return nthWeekdayOfMonth(year, 11, 4, 4);         // 4th Thu Nov
    case 'green-wednesday':   return addDays(nthWeekdayOfMonth(year, 11, 4, 4), -1); // day before Thanksgiving
    case 'black-friday':      return addDays(nthWeekdayOfMonth(year, 11, 4, 4), 1);  // day after Thanksgiving
    case 'cyber-monday':      return addDays(nthWeekdayOfMonth(year, 11, 4, 4), 4);  // Mon after Thanksgiving
    case 'lunar-ny':          return lookupOrFallback(LUNAR_NEW_YEAR, year);
    case 'hanukkah':          return lookupOrFallback(HANUKKAH_START, year);
    case 'diwali':            return lookupOrFallback(DIWALI, year);
    case 'ramadan':           return lookupOrFallback(RAMADAN, year);
    case 'holi':              return lookupOrFallback(HOLI, year);
    default:                  return null;
  }
}
