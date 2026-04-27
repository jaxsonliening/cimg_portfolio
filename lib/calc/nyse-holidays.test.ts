import { describe, it, expect } from "vitest";
import { isTradingDay, nyseHolidays } from "./nyse-holidays";

// Pulled from the NYSE-published calendar at
// https://www.nyse.com/markets/hours-calendars. Cross-check on
// release-year changes, not on every test run.
const NYSE_CALENDAR: Record<number, string[]> = {
  2024: [
    "2024-01-01", // New Year's Day
    "2024-01-15", // MLK Day
    "2024-02-19", // Presidents' Day
    "2024-03-29", // Good Friday
    "2024-05-27", // Memorial Day
    "2024-06-19", // Juneteenth
    "2024-07-04", // Independence Day
    "2024-09-02", // Labor Day
    "2024-11-28", // Thanksgiving
    "2024-12-25", // Christmas
  ],
  2025: [
    "2025-01-01",
    "2025-01-20",
    "2025-02-17",
    "2025-04-18",
    "2025-05-26",
    "2025-06-19",
    "2025-07-04",
    "2025-09-01",
    "2025-11-27",
    "2025-12-25",
  ],
  2026: [
    "2026-01-01",
    "2026-01-19",
    "2026-02-16",
    "2026-04-03", // Good Friday — Easter Apr 5 2026
    "2026-05-25",
    "2026-06-19",
    "2026-07-03", // Jul 4 falls on Sat → observed Fri
    "2026-09-07",
    "2026-11-26",
    "2026-12-25",
  ],
  2027: [
    "2027-01-01",
    "2027-01-18",
    "2027-02-15",
    "2027-03-26", // Good Friday — Easter Mar 28 2027
    "2027-05-31",
    "2027-06-18", // Jun 19 falls on Sat → observed Fri
    "2027-07-05", // Jul 4 falls on Sun → observed Mon
    "2027-09-06",
    "2027-11-25",
    "2027-12-24", // Dec 25 falls on Sat → observed Fri
  ],
};

describe("nyseHolidays", () => {
  for (const [yearStr, expected] of Object.entries(NYSE_CALENDAR)) {
    const year = Number(yearStr);
    it(`matches the published NYSE calendar for ${year}`, () => {
      const got = nyseHolidays(year);
      expect(Array.from(got).sort()).toEqual(expected.slice().sort());
    });
  }
});

describe("isTradingDay", () => {
  it("rejects weekends", () => {
    expect(isTradingDay(new Date(Date.UTC(2026, 3, 25)))).toBe(false); // Sat
    expect(isTradingDay(new Date(Date.UTC(2026, 3, 26)))).toBe(false); // Sun
  });

  it("rejects holidays", () => {
    expect(isTradingDay(new Date(Date.UTC(2026, 3, 3)))).toBe(false); // Good Friday
    expect(isTradingDay(new Date(Date.UTC(2026, 6, 3)))).toBe(false); // Independence (observed)
    expect(isTradingDay(new Date(Date.UTC(2024, 10, 28)))).toBe(false); // Thanksgiving
  });

  it("accepts ordinary weekdays", () => {
    expect(isTradingDay(new Date(Date.UTC(2026, 3, 27)))).toBe(true); // Mon
    expect(isTradingDay(new Date(Date.UTC(2026, 6, 2)))).toBe(true); // Thu before observed Jul 4
    expect(isTradingDay(new Date(Date.UTC(2024, 11, 24)))).toBe(true); // Christmas Eve (early close, not closed)
  });
});
