import { describe, it, expect } from "vitest";
import { safeCompare } from "@/lib/validators";

describe("safeCompare (constant-time)", () => {
  it("returns true for identical strings", () => {
    expect(safeCompare("secret123", "secret123")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(safeCompare("secret123", "secret456")).toBe(false);
  });

  it("returns false for different-length strings", () => {
    expect(safeCompare("short", "muchlongerstring")).toBe(false);
  });

  it("returns false when first is null", () => {
    expect(safeCompare(null, "secret")).toBe(false);
  });

  it("returns false when second is null", () => {
    expect(safeCompare("secret", null)).toBe(false);
  });

  it("returns false when both null", () => {
    expect(safeCompare(null, null)).toBe(false);
  });

  it("returns false when first is undefined", () => {
    expect(safeCompare(undefined, "secret")).toBe(false);
  });

  it("returns false for empty string vs secret", () => {
    expect(safeCompare("", "secret")).toBe(false);
  });

  it("handles unicode correctly", () => {
    expect(safeCompare("ключ-секрет", "ключ-секрет")).toBe(true);
    expect(safeCompare("ключ-секрет", "ключ-другой")).toBe(false);
  });
});
