import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McfClient } from "../mcf/client.js";
import { jobDetailsOutputSchema, jobDetailsSchema, summarizeJobDetails } from "../mcf/jobs.js";
import { errorResult, jsonResult, READ_ONLY_ANNOTATIONS } from "./shared.js";

const UUID_RE = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const inputSchema = {
  uuid: z
    .string()
    .trim()
    .regex(UUID_RE, "Expected a 32-character hex job uuid (hyphenated form also accepted)")
    .describe(
      "Job uuid from search_jobs results, e.g. '3a368bc886540633415264664f9fdcfa'. Hyphenated UUIDs are accepted and normalised.",
    ),
  lang: z
    .enum(["english", "zh-Hans", "ms", "ta"])
    .optional()
    .describe("Request a translated posting: english, zh-Hans (Chinese), ms (Malay) or ta (Tamil)."),
  includeRawHtml: z
    .boolean()
    .default(false)
    .describe("Also return the original HTML description as descriptionHtml (default false)."),
};

export function registerGetJobTool(server: McpServer, client: McfClient): void {
  server.registerTool(
    "get_job",
    {
      title: "Get job details",
      description:
        "Fetch the full MyCareersFuture posting for a job uuid, with the HTML description converted to plain text. Does not bump the job's application counter.",
      inputSchema,
      outputSchema: jobDetailsOutputSchema.shape,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ uuid, lang, includeRawHtml }) => {
      try {
        const job = await client.request(
          {
            method: "GET",
            path: `/v2/jobs/${uuid.replaceAll("-", "").toLowerCase()}`,
            query: { lang },
          },
          jobDetailsSchema,
        );
        return jsonResult(summarizeJobDetails(job, includeRawHtml));
      } catch (error: unknown) {
        return errorResult(error, "get job");
      }
    },
  );
}
