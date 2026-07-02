import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./client.js";

describe("api client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("listItems requests /api/items and returns the parsed JSON", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ id: "1" }]), { status: 200 }));

    const items = await api.listItems();

    expect(fetchMock).toHaveBeenCalledWith("/api/items", expect.objectContaining({ headers: expect.any(Object) }));
    expect(items).toEqual([{ id: "1" }]);
  });

  it("listItems appends includeInactive=true when requested", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    await api.listItems(true);

    expect(fetchMock).toHaveBeenCalledWith("/api/items?includeInactive=true", expect.any(Object));
  });

  it("createItem POSTs the input as JSON", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "1", name: "x" }), { status: 201 }));

    await api.createItem({ name: "x", intervalDays: 7 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/items");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "x", intervalDays: 7 });
  });

  it("deleteItem returns undefined for a 204 response without parsing a body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(api.deleteItem("1")).resolves.toBeUndefined();
  });

  it("throws an error with the server-provided message when the response is not ok", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "見つかりません", code: "NOT_FOUND" } }), { status: 404 }),
    );

    await expect(api.completeItem("missing")).rejects.toThrow("見つかりません");
  });

  it("falls back to a generic error message when the error body isn't JSON", async () => {
    fetchMock.mockResolvedValue(new Response("not json", { status: 500 }));

    await expect(api.completeItem("x")).rejects.toThrow("Request failed: 500");
  });
});
