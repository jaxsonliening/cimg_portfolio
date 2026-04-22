/**
 * True if `now` (defaults to current time) is within the extended
 * US equity market window: weekdays, 9:15 ET to 16:15 ET. Handles both
 * EDT and EST automatically via the Intl API — no manual DST math.
 *
 * GitHub Actions fires the intraday cron every 15 min from 13:00 to
 * 21:15 UTC. The handler calls this to no-op on misfires.
 */
export function isWithinMarketHours(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value;
  if (weekday === "Sat" || weekday === "Sun") return false;

  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return false;

  const minutes = hour * 60 + minute;
  const OPEN = 9 * 60 + 15;   // 09:15 ET (pre-open tick)
  const CLOSE = 16 * 60 + 15; // 16:15 ET (post-close tick)
  return minutes >= OPEN && minutes <= CLOSE;
}
