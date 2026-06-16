import { afterEach, describe, expect, it } from "vitest";
import { ENV } from "./env";
import { canAdministerTenant } from "./trpc";

const originalTenancyMode = ENV.tenancyMode;

afterEach(() => {
  ENV.tenancyMode = originalTenancyMode;
});

describe("canAdministerTenant", () => {
  it("allows tenant owner/admin roles in multi-tenant mode", () => {
    ENV.tenancyMode = "multi";

    expect(canAdministerTenant("user", "owner")).toBe(true);
    expect(canAdministerTenant("user", "admin")).toBe(true);
  });

  it("does not let platform admin roles bypass tenant membership in multi-tenant mode", () => {
    ENV.tenancyMode = "multi";

    expect(canAdministerTenant("super_admin", "member")).toBe(false);
    expect(canAdministerTenant("admin", null)).toBe(false);
  });

  it("keeps legacy platform admin fallback in single-tenant mode", () => {
    ENV.tenancyMode = "single";

    expect(canAdministerTenant("super_admin", "member")).toBe(true);
    expect(canAdministerTenant("admin", null)).toBe(true);
  });
});
