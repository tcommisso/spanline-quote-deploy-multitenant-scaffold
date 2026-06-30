export const APP_TIME_ZONE = "Australia/Sydney";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function parseDateOnly(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid date string: ${date}`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function parseTimeOnly(time: string) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!match) throw new Error(`Invalid time string: ${time}`);
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3] ?? "0"),
  };
}

function partsInTimeZone(value: Date | number | string, timeZone: string): DateParts {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const part = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find(item => item.type === type)?.value;
    if (!value) throw new Error(`Missing ${type} in formatted date`);
    return Number(value);
  };

  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

function offsetMsForTimeZone(value: Date, timeZone: string) {
  const parts = partsInTimeZone(value, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - value.getTime();
}

export function addDaysToDateOnly(date: string, days: number) {
  const parsed = parseDateOnly(date);
  const value = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
}

export function formatDateInTimeZone(value: Date | number | string, timeZone = APP_TIME_ZONE) {
  const parts = partsInTimeZone(value, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function getDateTimePartsInTimeZone(value: Date | number | string, timeZone = APP_TIME_ZONE) {
  const parts = partsInTimeZone(value, timeZone);
  return {
    ...parts,
    date: `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`,
  };
}

export function zonedDateTimeToUnixSeconds(date: string, time: string, timeZone = APP_TIME_ZONE) {
  const dateParts = parseDateOnly(date);
  const timeParts = parseTimeOnly(time);
  const localAsUtcMs = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    timeParts.second
  );

  let utcMs = localAsUtcMs - offsetMsForTimeZone(new Date(localAsUtcMs), timeZone);
  for (let i = 0; i < 3; i += 1) {
    const nextUtcMs = localAsUtcMs - offsetMsForTimeZone(new Date(utcMs), timeZone);
    if (nextUtcMs === utcMs) break;
    utcMs = nextUtcMs;
  }

  return Math.floor(utcMs / 1000);
}
