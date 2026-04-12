import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/formatters";
import {
  emailSchema,
  passwordSchema,
  loginSchema,
  registerSchema,
  profileSchema,
  siteImportSchema,
  seoSettingsSchema,
  apiConnectionSchema,
} from "@/lib/validations";

// ── cn() utility ──────────────────────────────────────────────────────────────

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("handles conditional classes", () => {
    const isHidden = false;
    expect(cn("base", isHidden && "hidden", "extra")).toBe("base extra");
  });

  it("deduplicates conflicting tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles undefined and null inputs", () => {
    expect(cn("a", undefined, null, "b")).toBe("a b");
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });
});

// ── timeAgo() ─────────────────────────────────────────────────────────────────

describe("timeAgo", () => {
  it('returns "Never" for null', () => {
    expect(timeAgo(null)).toBe("Never");
  });

  it('returns "Just now" for dates less than a minute ago', () => {
    const now = new Date().toISOString();
    expect(timeAgo(now)).toBe("Just now");
  });

  it("returns minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(timeAgo(fiveMinAgo)).toBe("5m ago");
  });

  it("returns hours ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    expect(timeAgo(twoHoursAgo)).toBe("2h ago");
  });

  it("returns days ago", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
    expect(timeAgo(threeDaysAgo)).toBe("3d ago");
  });
});

// ── Validation schemas ────────────────────────────────────────────────────────

describe("emailSchema", () => {
  it("accepts a valid email", () => {
    expect(emailSchema.safeParse("user@example.com").success).toBe(true);
  });

  it("rejects empty string", () => {
    expect(emailSchema.safeParse("").success).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("accepts 8+ characters", () => {
    expect(passwordSchema.safeParse("abcdefgh").success).toBe(true);
  });

  it("rejects fewer than 8 characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects missing password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("enforces minimum password length", () => {
    const result = registerSchema.safeParse({ email: "a@b.com", password: "short" });
    expect(result.success).toBe(false);
  });

  it("accepts valid input", () => {
    const result = registerSchema.safeParse({ email: "a@b.com", password: "longpassword" });
    expect(result.success).toBe(true);
  });
});

describe("profileSchema", () => {
  it("requires display_name", () => {
    const result = profileSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts minimal profile", () => {
    const result = profileSchema.safeParse({ display_name: "Jason" });
    expect(result.success).toBe(true);
  });

  it("rejects display_name over 100 chars", () => {
    const result = profileSchema.safeParse({ display_name: "x".repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe("siteImportSchema", () => {
  it("accepts a valid domain", () => {
    expect(siteImportSchema.safeParse({ domain: "example.com" }).success).toBe(true);
  });

  it("accepts domain with protocol", () => {
    expect(siteImportSchema.safeParse({ domain: "https://example.com" }).success).toBe(true);
  });

  it("rejects empty domain", () => {
    expect(siteImportSchema.safeParse({ domain: "" }).success).toBe(false);
  });

  it("rejects invalid domain", () => {
    expect(siteImportSchema.safeParse({ domain: "notadomain" }).success).toBe(false);
  });
});

describe("seoSettingsSchema", () => {
  it("accepts empty object (all optional)", () => {
    expect(seoSettingsSchema.safeParse({}).success).toBe(true);
  });

  it("rejects seo_title over 60 chars", () => {
    const result = seoSettingsSchema.safeParse({ seo_title: "x".repeat(61) });
    expect(result.success).toBe(false);
  });

  it("rejects seo_description over 160 chars", () => {
    const result = seoSettingsSchema.safeParse({ seo_description: "x".repeat(161) });
    expect(result.success).toBe(false);
  });

  it("accepts valid twitter handle", () => {
    expect(seoSettingsSchema.safeParse({ twitter_handle: "@jason" }).success).toBe(true);
  });

  it("rejects invalid twitter handle", () => {
    expect(seoSettingsSchema.safeParse({ twitter_handle: "not a handle!" }).success).toBe(false);
  });
});

describe("apiConnectionSchema", () => {
  it("accepts valid connection", () => {
    const result = apiConnectionSchema.safeParse({
      provider: "openai",
      api_key: "sk-test",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown provider", () => {
    const result = apiConnectionSchema.safeParse({
      provider: "unknown",
      api_key: "key",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty api_key", () => {
    const result = apiConnectionSchema.safeParse({
      provider: "openai",
      api_key: "",
    });
    expect(result.success).toBe(false);
  });
});
