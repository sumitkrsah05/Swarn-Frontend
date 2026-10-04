import { describe, expect, it } from "vitest";
import { formatTokens } from "./format";

describe("formatTokens", () => {
  it("keeps small counts exact and abbreviates the rest", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1000)).toBe("1k");
    expect(formatTokens(12_345)).toBe("12.3k");
    expect(formatTokens(1_234_567)).toBe("1.23M");
    expect(formatTokens(null)).toBe("—");
  });
});
