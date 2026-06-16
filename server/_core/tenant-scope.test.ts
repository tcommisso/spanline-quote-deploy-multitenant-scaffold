import { afterEach, describe, expect, it } from "vitest";
import { ENV } from "./env";
import {
  isMultiTenancyMode,
  isRecordVisibleToTenant,
  tenantScoped,
} from "./tenant-scope";

const originalTenancyMode = ENV.tenancyMode;

afterEach(() => {
  ENV.tenancyMode = originalTenancyMode;
});

describe("tenant-scope", () => {
  it("keeps legacy null tenant visibility in single-tenant mode", () => {
    ENV.tenancyMode = "single";

    expect(isMultiTenancyMode()).toBe(false);
    expect(tenantScoped({} as any, undefined)).toBeUndefined();
    expect(isRecordVisibleToTenant(null, 1)).toBe(true);
    expect(isRecordVisibleToTenant(2, 1)).toBe(false);
  });

  it("fails closed for missing tenant context in multi-tenant mode", () => {
    ENV.tenancyMode = "multi";

    expect(isMultiTenancyMode()).toBe(true);
    expect(tenantScoped({} as any, undefined)).toBeTruthy();
    expect(isRecordVisibleToTenant(null, 1)).toBe(false);
    expect(isRecordVisibleToTenant(1, null)).toBe(false);
  });

  it("only allows exact tenant matches in multi-tenant mode", () => {
    ENV.tenancyMode = "multi";

    expect(isRecordVisibleToTenant(1, 1)).toBe(true);
    expect(isRecordVisibleToTenant(2, 1)).toBe(false);
  });
});
