import type { z } from "zod";

export const MCF_BASE_URL = "https://api.mycareersfuture.gov.sg";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ERROR_BODY_CHARS = 500;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface McfClientOptions {
  readonly baseUrl?: string;
  /** Injectable fetch implementation (defaults to global fetch). */
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
}

/** Error raised for transport failures, non-2xx responses and unexpected payloads. */
export class McfError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "McfError";
    this.status = status;
  }
}

export type QueryParams = Readonly<Record<string, string | number | undefined>>;

export interface RequestSpec {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly query?: QueryParams;
  readonly body?: unknown;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}... [truncated]` : text;
}

/** Small typed HTTP client for the unofficial MyCareersFuture API. */
export class McfClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: McfClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? MCF_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Performs a request and validates the JSON response against `schema`. */
  async request<S extends z.ZodType>(spec: RequestSpec, schema: S): Promise<z.output<S>> {
    const url = new URL(this.baseUrl + spec.path);
    for (const [key, value] of Object.entries(spec.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      "mcf-client": "jobseeker",
      accept: "application/json",
    };
    const init: RequestInit = {
      method: spec.method,
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    };
    if (spec.body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(spec.body);
    }

    const label = `${spec.method} ${url.pathname}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), init);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new McfError(
        timedOut ? `${label} timed out after ${this.timeoutMs}ms` : `${label} failed: ${reason}`,
        undefined,
        { cause: error },
      );
    }

    const text = await response.text();
    if (!response.ok) {
      throw new McfError(
        `${label} returned HTTP ${response.status}: ${truncate(text, MAX_ERROR_BODY_CHARS)}`,
        response.status,
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new McfError(
        `${label} returned non-JSON body: ${truncate(text, MAX_ERROR_BODY_CHARS)}`,
        response.status,
      );
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new McfError(
        `${label} returned an unexpected response shape: ${truncate(parsed.error.message, MAX_ERROR_BODY_CHARS)}`,
        response.status,
      );
    }
    return parsed.data;
  }
}
