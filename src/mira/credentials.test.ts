import { describe, expect, test } from "bun:test";
import {
  isValidApiHash,
  validateTelegramApiCredentials,
} from "./credentials";

describe("validateTelegramApiCredentials", () => {
  test("accepts valid pair", () => {
    expect(() =>
      validateTelegramApiCredentials(
        12345678,
        "0123456789abcdef0123456789abcdef",
      ),
    ).not.toThrow();
  });

  test("rejects api_hash wrong length", () => {
    expect(() =>
      validateTelegramApiCredentials(12345678, "a".repeat(33)),
    ).toThrow(/32 hexadecimal/);
  });
});

describe("isValidApiHash", () => {
  test("trims before check", () => {
    expect(isValidApiHash(" 0123456789abcdef0123456789abcdef ")).toBe(true);
  });
});
