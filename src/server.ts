import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McfClient } from "./mcf/client.js";
import { registerAboutResource } from "./resources/about.js";
import { registerFiltersResource } from "./resources/filters.js";
import { registerGetJobTool } from "./tools/get-job.js";
import { registerInDemandJobTitlesTool } from "./tools/in-demand-job-titles.js";
import { registerListEmploymentTypesTool } from "./tools/list-employment-types.js";
import { registerPopularJobTitlesTool } from "./tools/popular-job-titles.js";
import { registerSearchJobsTool } from "./tools/search-jobs.js";
import { registerSuggestJobsTool } from "./tools/suggest-jobs.js";
import { registerSuggestSkillsTool } from "./tools/suggest-skills.js";

export interface CreateServerOptions {
  /** Override the API client (tests inject one with a fake fetch). */
  readonly client?: McfClient;
}

export function createServer(options: CreateServerOptions = {}): McpServer {
  const server = new McpServer({ name: "careersfuture-mcp", version: "0.1.1" });
  const client = options.client ?? new McfClient();

  registerSearchJobsTool(server, client);
  registerGetJobTool(server, client);
  registerListEmploymentTypesTool(server);
  registerSuggestSkillsTool(server, client);
  registerSuggestJobsTool(server, client);
  registerPopularJobTitlesTool(server, client);
  registerInDemandJobTitlesTool(server, client);
  registerAboutResource(server);
  registerFiltersResource(server);

  return server;
}
