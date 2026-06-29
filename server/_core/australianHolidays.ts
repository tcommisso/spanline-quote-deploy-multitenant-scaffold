export const AU_HOLIDAY_JURISDICTIONS = [
  "NATIONAL",
  "ACT",
  "NSW",
  "VIC",
  "QLD",
  "SA",
  "WA",
  "TAS",
  "NT",
] as const;

export type AuHolidayJurisdiction = typeof AU_HOLIDAY_JURISDICTIONS[number];

export type GeneratedAustralianHoliday = {
  dateKey: string;
  name: string;
  jurisdiction: AuHolidayJurisdiction;
  year: number;
  source: "built_in";
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function toDateKey(value: Date | string | number) {
  if (isValidDateKey(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function localDateKeyFromDate(value: Date | string | number) {
  if (isValidDateKey(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function dateKeyToStorageDate(dateKey: string) {
  if (!isValidDateKey(dateKey)) return new Date(Number.NaN);
  return new Date(`${dateKey}T12:00:00.000Z`);
}

export function dateKeyRange(startDate?: string, endDate?: string) {
  const startKey = startDate ? localDateKeyFromDate(startDate) : undefined;
  const endKey = endDate ? localDateKeyFromDate(endDate) : undefined;
  return {
    startKey: startKey && isValidDateKey(startKey) ? startKey : undefined,
    endKey: endKey && isValidDateKey(endKey) ? endKey : undefined,
  };
}

export function isWeekendDateKey(dateKey: string) {
  const date = dateKeyToStorageDate(dateKey);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function dateKey(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function weekday(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return Number.isNaN(date.getTime()) ? Number.NaN : date.getUTCDay();
}

function nthWeekdayOfMonth(year: number, month: number, targetWeekday: number, nth: number) {
  let day = 1;
  while (weekday(year, month, day) !== targetWeekday && day <= 31) day += 1;
  if (day > 31) return 1;
  return day + (nth - 1) * 7;
}

function firstWeekdayOnOrAfter(year: number, month: number, day: number, targetWeekday: number) {
  let cursor = day;
  while (weekday(year, month, cursor) !== targetWeekday && cursor <= day + 7) cursor += 1;
  if (cursor > day + 7) return day;
  return cursor;
}

function easterSunday(year: number) {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dateKeyToStorageDate(dateKey(year, month, day));
}

function offsetDateKey(date: Date, offsetDays: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + offsetDays);
  return toDateKey(next);
}

function addHoliday(
  holidays: GeneratedAustralianHoliday[],
  seen: Set<string>,
  year: number,
  dateKeyValue: string,
  name: string,
  jurisdiction: AuHolidayJurisdiction,
) {
  const key = `${dateKeyValue}|${jurisdiction}|${name.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  holidays.push({ dateKey: dateKeyValue, name, jurisdiction, year, source: "built_in" });
}

function addFixedObserved(
  holidays: GeneratedAustralianHoliday[],
  seen: Set<string>,
  year: number,
  month: number,
  day: number,
  name: string,
) {
  const actual = dateKey(year, month, day);
  addHoliday(holidays, seen, year, actual, name, "NATIONAL");
  const actualWeekday = weekday(year, month, day);
  if (actualWeekday === 6) {
    addHoliday(holidays, seen, year, offsetDateKey(dateKeyToStorageDate(actual), 2), `${name} (observed)`, "NATIONAL");
  } else if (actualWeekday === 0) {
    addHoliday(holidays, seen, year, offsetDateKey(dateKeyToStorageDate(actual), 1), `${name} (observed)`, "NATIONAL");
  }
}

function addChristmasBoxingDay(holidays: GeneratedAustralianHoliday[], seen: Set<string>, year: number) {
  const christmas = dateKey(year, 12, 25);
  const boxing = dateKey(year, 12, 26);
  addHoliday(holidays, seen, year, christmas, "Christmas Day", "NATIONAL");
  addHoliday(holidays, seen, year, boxing, "Boxing Day", "NATIONAL");
  const christmasWeekday = weekday(year, 12, 25);
  const boxingWeekday = weekday(year, 12, 26);
  if (christmasWeekday === 6) {
    addHoliday(holidays, seen, year, dateKey(year, 12, 27), "Christmas Day (observed)", "NATIONAL");
    addHoliday(holidays, seen, year, dateKey(year, 12, 28), "Boxing Day (observed)", "NATIONAL");
  } else if (christmasWeekday === 0) {
    addHoliday(holidays, seen, year, dateKey(year, 12, 27), "Christmas Day (observed)", "NATIONAL");
  } else if (boxingWeekday === 6) {
    addHoliday(holidays, seen, year, dateKey(year, 12, 28), "Boxing Day (observed)", "NATIONAL");
  } else if (boxingWeekday === 0) {
    addHoliday(holidays, seen, year, dateKey(year, 12, 27), "Boxing Day (observed)", "NATIONAL");
  }
}

export function generateAustralianHolidays(
  year: number,
  jurisdictions: AuHolidayJurisdiction[] = ["NATIONAL", "ACT", "NSW"],
) {
  const enabled = new Set(jurisdictions);
  enabled.add("NATIONAL");
  const holidays: GeneratedAustralianHoliday[] = [];
  const seen = new Set<string>();

  addFixedObserved(holidays, seen, year, 1, 1, "New Year's Day");
  addFixedObserved(holidays, seen, year, 1, 26, "Australia Day");
  addFixedObserved(holidays, seen, year, 4, 25, "Anzac Day");
  addChristmasBoxingDay(holidays, seen, year);

  const easter = easterSunday(year);
  addHoliday(holidays, seen, year, offsetDateKey(easter, -2), "Good Friday", "NATIONAL");
  addHoliday(holidays, seen, year, offsetDateKey(easter, -1), "Easter Saturday", "NATIONAL");
  addHoliday(holidays, seen, year, toDateKey(easter), "Easter Sunday", "NATIONAL");
  addHoliday(holidays, seen, year, offsetDateKey(easter, 1), "Easter Monday", "NATIONAL");

  if (enabled.has("ACT")) {
    addHoliday(holidays, seen, year, dateKey(year, 3, nthWeekdayOfMonth(year, 3, 1, 2)), "Canberra Day", "ACT");
    addHoliday(holidays, seen, year, dateKey(year, 5, firstWeekdayOnOrAfter(year, 5, 27, 1)), "Reconciliation Day", "ACT");
    addHoliday(holidays, seen, year, dateKey(year, 6, nthWeekdayOfMonth(year, 6, 1, 2)), "King's Birthday", "ACT");
    addHoliday(holidays, seen, year, dateKey(year, 10, nthWeekdayOfMonth(year, 10, 1, 1)), "Labour Day", "ACT");
  }

  if (enabled.has("NSW")) {
    addHoliday(holidays, seen, year, dateKey(year, 6, nthWeekdayOfMonth(year, 6, 1, 2)), "King's Birthday", "NSW");
    addHoliday(holidays, seen, year, dateKey(year, 8, nthWeekdayOfMonth(year, 8, 1, 1)), "Bank Holiday", "NSW");
    addHoliday(holidays, seen, year, dateKey(year, 10, nthWeekdayOfMonth(year, 10, 1, 1)), "Labour Day", "NSW");
  }

  return holidays
    .filter((holiday) => enabled.has(holiday.jurisdiction))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.jurisdiction.localeCompare(b.jurisdiction));
}
