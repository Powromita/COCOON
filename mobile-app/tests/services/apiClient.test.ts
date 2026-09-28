/**
 * ApiClient: base URL, headers, and normalization of every failure into an
 * AppError with a user-facing message.
 */
import { ApiClient } from "../../services/api/client";
import { AppError, toUserFacingError } from "../../utils/errors";

type FetchArgs = [string, RequestInit];

function respond(status: number, body: unknown): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text } as unknown as Response;
}

function clientWith(impl: (...args: FetchArgs) => Promise<Response>, token: string | null = null) {
  const fetchMock = jest.fn(impl);
  const client = new ApiClient("https://cocoon.example/", async () => token, fetchMock as unknown as typeof fetch);
  return { client, fetchMock };
}

async function caught(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error("expected the request to fail");
}

describe("ApiClient", () => {
  it("joins the configured base URL, sends JSON, auth and idempotency headers", async () => {
    const { client, fetchMock } = clientWith(async () => respond(201, { ok: 1 }), "tok123");
    await client.post("/api/v1/optimizations", { a: 1 }, { idempotencyKey: "k1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://cocoon.example/api/v1/optimizations");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(init.headers).toEqual(
      expect.objectContaining({ "Content-Type": "application/json", Authorization: "Bearer tok123", "Idempotency-Key": "k1" })
    );
  });

  it("throws not_configured when no base URL is set", async () => {
    const client = new ApiClient(undefined);
    const e = await caught(client.get("/api/v1/capabilities"));
    expect(e.kind).toBe("not_configured");
  });

  it("normalizes an M0 ErrorEnvelope (422) and keeps the backend's own message", async () => {
    const { client } = clientWith(async () =>
      respond(422, {
        error: { code: "VALIDATION_ERROR", message: "rooms need 60.5 m2 but at most 45 m2 is usable", trace_id: "t-1", retryable: false, details: {} },
      })
    );
    const e = await caught(client.post("/api/v1/optimizations", {}));
    expect(e).toBeInstanceOf(AppError);
    expect(e.kind).toBe("validation");
    expect(e.code).toBe("VALIDATION_ERROR");
    expect(e.traceId).toBe("t-1");
    expect(toUserFacingError(e).message).toBe("rooms need 60.5 m2 but at most 45 m2 is usable");
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "conflict"],
    [429, "rate_limited"],
    [500, "server"],
    [503, "unavailable"],
  ])("maps HTTP %i to %s", async (status, kind) => {
    const { client } = clientWith(async () => respond(status, { detail: "nope" }));
    const e = await caught(client.get("/x"));
    expect(e.kind).toBe(kind);
    expect(e.status).toBe(status);
  });

  it("reads FastAPI {detail: {error, error_reason}} bodies (ANSYS routes)", async () => {
    const { client } = clientWith(async () =>
      respond(503, { detail: { error: "ANSYS validation is unavailable on this server", error_reason: "no licence" } })
    );
    const e = await caught(client.get("/api/ansys/jobs"));
    expect(e.backendMessage).toBe("ANSYS validation is unavailable on this server — no licence");
  });

  it("flags a non-JSON success body as malformed", async () => {
    const { client } = clientWith(async () => respond(200, "<html>proxy login</html>"));
    expect((await caught(client.get("/x"))).kind).toBe("malformed");
  });

  it("turns a fetch rejection into a network error with a friendly message", async () => {
    const { client } = clientWith(async () => {
      throw new TypeError("Network request failed");
    });
    const e = await caught(client.get("/x"));
    expect(e.kind).toBe("network");
    const shown = toUserFacingError(e);
    expect(shown.title).toBe("Unable to connect to COCOON backend");
    expect(shown.category).toBe("NETWORK ERROR");
    expect(shown.message).toMatch(/saved results are still available offline/);
  });

  it("times out a request that never answers", async () => {
    const { client } = clientWith(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );
    const e = await caught(client.get("/slow", { timeoutMs: 20 }));
    expect(e.kind).toBe("timeout");
    expect(e.retryable).toBe(true);
  });

  it("never exposes a stack trace in user-facing text", () => {
    const fatal = new Error("boom");
    const shown = toUserFacingError(fatal);
    expect(JSON.stringify(shown)).not.toContain("at ");
    expect(shown.message).toBe("boom");
    expect(shown.category).toBe("APP ERROR");
  });
});
