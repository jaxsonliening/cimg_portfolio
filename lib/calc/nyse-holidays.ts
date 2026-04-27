// NYSE trading calendar.
//
// The daily cron writes price/fund snapshots after the US session
// closes. On non-trading days, Yahoo returns the previous session's
// close, and writing those values under today's date corrupts
// summary.as_of and the chart's most-recent point. This module
// resolves whether a given UTC date is a session day for the NYSE.
//
// Holidays computed algorithmically rather than hard-coded so we never
// have to touch this file when a year rolls over. Verified against the
// NYSE-published calendar for 2024–2027 in the matching test file.
//
// Half-day sessions (early closes after Thanksgiving / on Christmas
// Eve) are treated as full trading days because the cron fires at
// 22:30 UTC = 18:30 ET, well after the 13:00 ET early close. The data
// Yahoo serves at that point is the official session's closing data,
// which is the correct thing to snapshot.

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Easter Sunday by the Anonymous Gregorian algorithm (Meeus / Jones /
// Butcher). Returns the date at UTC midnight.
function easterSunday(year: number): Date {
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
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 (March) or 4 (April)
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// nth occurrence of `weekday` (0=Sun..6=Sat) in the given month.
function nthWeekdayOfMonth(
  year: number,
  month: number, // 0-indexed
  weekday: number,
  n: number,
): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7));
}

function lastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
): Date {
  // Day 0 of next month = last day of this month.
  const last = new Date(Date.UTC(year, month + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month, last.getUTCDate() - offset));
}

// NYSE rule for fixed-date holidays:
//   Sat → observed on the preceding Friday (markets closed Friday).
//   Sun → observed on the following Monday.
function observedDate(date: Date): Date {
  const day = date.getUTCDay();
  if (day === 6) return new Date(date.getTime() - DAY_MS);
  if (day === 0) return new Date(date.getTime() + DAY_MS);
  return date;
}

export function nyseHolidays(year: number): Set<string> {
  const dates: Date[] = [
    // Fixed-date holidays — adjusted when they fall on a weekend.
    observedDate(new Date(Date.UTC(year, 0, 1))), // New Year's Day
    observedDate(new Date(Date.UTC(year, 5, 19))), // Juneteenth (NYSE since 2022)
    observedDate(new Date(Date.UTC(year, 6, 4))), // Independence Day
    observedDate(new Date(Date.UTC(year, 11, 25))), // Christmas Day

    // Day-of-week holidays — already on a Mon/Thu, no shift needed.
    nthWeekdayOfMonth(year, 0, 1, 3), // MLK Jr. Day — 3rd Mon Jan
    nthWeekdayOfMonth(year, 1, 1, 3), // Presidents' Day — 3rd Mon Feb
    lastWeekdayOfMonth(year, 4, 1), // Memorial Day — last Mon May
    nthWeekdayOfMonth(year, 8, 1, 1), // Labor Day — 1st Mon Sep
    nthWeekdayOfMonth(year, 10, 4, 4), // Thanksgiving — 4th Thu Nov

    // Good Friday — two days before Easter Sunday.
    new Date(easterSunday(year).getTime() - 2 * DAY_MS),
  ];
  return new Set(dates.map(isoDate));
}

export function isTradingDay(date: Date): boolean {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !nyseHolidays(date.getUTCFullYear()).has(isoDate(date));
}
