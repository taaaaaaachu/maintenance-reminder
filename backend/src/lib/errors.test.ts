import { describe, expect, it } from "vitest";
import { badRequest, HttpError, notFound } from "./errors.js";

describe("HttpError", () => {
  it("carries status, code, and message", () => {
    const error = new HttpError(418, "TEAPOT", "I'm a teapot");
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(418);
    expect(error.code).toBe("TEAPOT");
    expect(error.message).toBe("I'm a teapot");
  });
});

describe("notFound", () => {
  it("defaults to a generic message", () => {
    const error = notFound();
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("Not Found");
  });

  it("accepts a custom message", () => {
    const error = notFound("宛先が見つかりません");
    expect(error.message).toBe("宛先が見つかりません");
  });
});

describe("badRequest", () => {
  it("sets status 400 and the given message", () => {
    const error = badRequest("不正な値です");
    expect(error.status).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toBe("不正な値です");
  });
});
