// The server process's own local clock can't be trusted for "what day/time
// is it right now" — most cloud hosts run their containers in UTC
// regardless of where the business actually operates, which silently
// shifted every attendance check-in/out timestamp (and the "today" it was
// filed under) by Mogadishu's fixed UTC+3 offset. These format the current
// instant directly against the business's own timezone via Intl, so the
// result is correct no matter what timezone the host happens to be in.
const BUSINESS_TIMEZONE = "Africa/Mogadishu";

export function businessDateString(date: Date = new Date()): string {
  // en-CA is the locale whose built-in date format is already YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE }).format(date);
}

export function businessTimeString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
