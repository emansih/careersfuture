import { expect, it, vi } from "vitest";
import { z } from "zod";
import { McfClient, McfError } from "./client.js";

const schema = z.object({ ok: z.boolean() });

function clientWith(response: Response | Error) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { fetchMock, client: new McfClient({ fetch: fetchMock }) };
}

it("sends mcf-client header, query string and JSON body", async () => {
  const { fetchMock, client } = clientWith(Response.json({ ok: true }));
  const result = await client.request(
    { method: "POST", path: "/v2/search", query: { limit: 3, page: 0, skip: undefined }, body: { a: 1 } },
    schema,
  );
  expect(result).toEqual({ ok: true });

  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(url).toBe("https://api.mycareersfuture.gov.sg/v2/search?limit=3&page=0");
  expect(init?.method).toBe("POST");
  expect(init?.headers).toMatchObject({ "mcf-client": "jobseeker", "content-type": "application/json" });
  expect(init?.body).toBe('{"a":1}');
  expect(init?.signal).toBeInstanceOf(AbortSignal);
});

it("omits content-type and body on GET", async () => {
  const { fetchMock, client } = clientWith(Response.json({ ok: true }));
  await client.request({ method: "GET", path: "/x" }, schema);
  const init = fetchMock.mock.calls[0]?.[1];
  expect(init?.body).toBeUndefined();
  expect(init?.headers).not.toHaveProperty("content-type");
});

it("throws McfError with status and truncated body on non-2xx", async () => {
  const { client } = clientWith(new Response("x".repeat(2000), { status: 503 }));
  const error = await client.request({ method: "GET", path: "/x" }, schema).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(McfError);
  expect((error as McfError).status).toBe(503);
  expect((error as McfError).message).toContain("HTTP 503");
  expect((error as McfError).message).toContain("[truncated]");
  expect((error as McfError).message.length).toBeLessThan(700);
});

it("wraps network failures, non-JSON bodies and bad shapes", async () => {
  await expect(
    clientWith(new Error("socket hang up")).client.request({ method: "GET", path: "/x" }, schema),
  ).rejects.toThrow(/failed: socket hang up/);
  await expect(
    clientWith(new Response("<html>")).client.request({ method: "GET", path: "/x" }, schema),
  ).rejects.toThrow(/non-JSON/);
  await expect(
    clientWith(Response.json({ ok: "nope" })).client.request({ method: "GET", path: "/x" }, schema),
  ).rejects.toThrow(/unexpected response shape/);
});
