import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EMPLOYMENT_TYPE_TABLE } from "../mcf/filters.js";
import { jsonResult, READ_ONLY_ANNOTATIONS } from "./shared.js";

/**
 * Returns a static, live-tested table instead of calling the GraphQL lookup: the lookup's names
 * ("Internship", "Flexi Time") are rejected by search, so the static list is both safer and offline.
 */
export function registerListEmploymentTypesTool(server: McpServer): void {
  server.registerTool(
    "list_employment_types",
    {
      title: "List employment types",
      description:
        "List employment types with their MyCareersFuture ids. Pass `searchName` (not graphqlName and not id) to search_jobs employmentTypes. graphqlName is the upstream lookup's label, which search rejects for 'Internship' and 'Flexi Time'. Static list, no network call.",
      inputSchema: {},
      outputSchema: {
        employmentTypes: z.array(
          z.object({ id: z.string(), searchName: z.string(), graphqlName: z.string() }),
        ),
      },
      annotations: { ...READ_ONLY_ANNOTATIONS, openWorldHint: false },
    },
    () => jsonResult({ employmentTypes: EMPLOYMENT_TYPE_TABLE.map((t) => ({ ...t })) }),
  );
}
