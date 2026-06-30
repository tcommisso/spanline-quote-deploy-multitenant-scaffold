import { describe, expect, it } from "vitest";
import {
  addDaysToDateOnly,
  APP_TIME_ZONE,
  formatDateInTimeZone,
  getDateTimePartsInTimeZone,
  zonedDateTimeToUnixSeconds,
} from "../../shared/timezone";

describe("timezone helpers", () => {
  it("converts Sydney winter wall-clock time using AEST", () => {
    const seconds = zonedDateTimeToUnixSeconds("2026-07-01", "10:30", APP_TIME_ZONE);
    expect(new Date(seconds * 1000).toISOString()).toBe("2026-07-01T00:30:00.000Z");
  });

  it("converts Sydney summer wall-clock time using AEDT", () => {
    const seconds = zonedDateTimeToUnixSeconds("2026-01-15", "10:30", APP_TIME_ZONE);
    expect(new Date(seconds * 1000).toISOString()).toBe("2026-01-14T23:30:00.000Z");
  });

  it("formats UTC instants as Sydney local dates and time parts", () => {
    const instant = new Date("2026-06-30T23:30:00.000Z");
    expect(formatDateInTimeZone(instant, APP_TIME_ZONE)).toBe("2026-07-01");
    expect(getDateTimePartsInTimeZone(instant, APP_TIME_ZONE)).toMatchObject({
      date: "2026-07-01",
      hour: 9,
      minute: 30,
    });
  });

  it("adds calendar days without UTC timezone drift", () => {
    expect(addDaysToDateOnly("2026-06-30", 1)).toBe("2026-07-01");
  });
});
