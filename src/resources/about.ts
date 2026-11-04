import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const ABOUT_TEXT = `careersfuture-mcp: MCP server for searching Singapore job postings on MyCareersFuture (https://www.mycareersfuture.gov.sg).

It wraps the public, unauthenticated web API that the MyCareersFuture site itself uses. That API is unofficial and reverse-engineered, so it can change without notice. All tools are read-only.

Tools:
- search_jobs: search postings with filters (keywords, salary, employment type, category, position level, district, skills, posting date, sort) and paging. Returns compact summaries.
- get_job: full details for one job uuid, with the description converted to plain text.
- list_employment_types: employment types with ids; pass searchName to search_jobs (static list).
- suggest_skills: skills (with uuids) commonly associated with a job title.
- suggest_jobs: jobs related to search terms and/or skill uuids.
- popular_job_titles: most popular job titles with counts.
- in_demand_job_titles: in-demand job titles with counts.

Resources:
- careersfuture://about: this text.
- careersfuture://filters: all allowed search_jobs filter values (employment types, categories, position levels, flexible work arrangements, scheme ids, regions to district ids, sort options).

Typical flow: search_jobs, then get_job on a result's uuid.
`;

export function registerAboutResource(server: McpServer): void {
  server.registerResource(
    "about",
    "careersfuture://about",
    {
      title: "About",
      description: "What this server does and which tools it offers.",
      mimeType: "text/plain",
    },
    (uri) => ({
      contents: [{ uri: uri.href, text: ABOUT_TEXT }],
    }),
  );
}
