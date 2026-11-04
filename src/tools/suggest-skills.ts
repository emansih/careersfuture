import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McfClient } from "../mcf/client.js";
import { skillSuggestionsSchema } from "../mcf/jobs.js";
import { errorResult, jsonResult, READ_ONLY_ANNOTATIONS } from "./shared.js";

export function registerSuggestSkillsTool(server: McpServer, client: McfClient): void {
  server.registerTool(
    "suggest_skills",
    {
      title: "Suggest skills for a job title",
      description:
        "Suggest skills commonly associated with a job title. The returned uuids can be passed to search_jobs as skillUuids.",
      inputSchema: {
        jobTitle: z.string().trim().min(1).describe("Job title, e.g. 'software engineer'."),
      },
      outputSchema: { skills: z.array(z.object({ skill: z.string(), uuid: z.string() })) },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ jobTitle }) => {
      try {
        const response = await client.request(
          { method: "POST", path: "/v2/skills/suggestions", body: { jobTitle } },
          skillSuggestionsSchema,
        );
        return jsonResult({
          skills: response.skills.map(({ skill, uuid }) => ({ skill, uuid })),
        });
      } catch (error: unknown) {
        return errorResult(error, "suggest skills");
      }
    },
  );
}
