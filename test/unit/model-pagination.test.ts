import { describe, expect, it } from "vitest";
import { pageWindow } from "../../src/application/pagination.js";

describe("model cursor pagination", () => {
  it("returns a stable opaque cursor and resumes after the requested window", () => {
    const first = pageWindow("model-labels", ["a", "b", "c"], { limit: 2 });

    expect(first.items).toEqual(["a", "b"]);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pageWindow("model-labels", ["a", "b", "c"], { limit: 2, cursor: first.nextCursor })).toEqual({
      items: ["c"],
    });
  });

  it("rejects a cursor from a different resource or malformed input", () => {
    const cursor = pageWindow("model-labels", ["a", "b"], { limit: 1 }).nextCursor;

    expect(() => pageWindow("model-bindings", ["a", "b"], { limit: 1, cursor })).toThrow(
      "model.invalid_cursor",
    );
    expect(() => pageWindow("model-labels", ["a", "b"], { limit: 1, cursor: "%%%" })).toThrow(
      "model.invalid_cursor",
    );
  });

  it("rejects page sizes outside the public 1..100 range", () => {
    expect(() => pageWindow("model-labels", ["a", "b"], { limit: 1000 })).toThrow("model.invalid_page");
    expect(() => pageWindow("model-labels", [], { limit: 0 })).toThrow("model.invalid_page");
  });
});
