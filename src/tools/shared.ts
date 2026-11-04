import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { McfError } from "../mcf/client.js";

/** Annotations shared by all tools: they only read from a public third-party API. */
export const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: true,
};

export function jsonResult(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

export function errorResult(error: unknown, action: string): CallToolResult {
  let message: string;
  if (error instanceof McfError) {
    message = error.status === 404 ? `${error.message} (not found; check the identifier)` : error.message;
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }
  return {
    isError: true,
    content: [{ type: "text", text: `Failed to ${action}: ${message}` }],
  };
}
