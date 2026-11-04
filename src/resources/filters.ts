import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CATEGORIES,
  EMPLOYMENT_TYPE_TABLE,
  EMPLOYMENT_TYPES,
  FLEXIBLE_WORK_ARRANGEMENTS,
  LANGUAGES,
  POSITION_LEVELS,
  POSTING_COMPANIES,
  REGIONS,
  SCHEMES,
  SORT_VALUES,
} from "../mcf/filters.js";

/** Allowed search_jobs filter values, live-tested (see docs/mycareersfuture-api.md "Search filters"). */
export const KNOWN_FILTERS = {
  note: "employmentTypes, categories and positionLevels are validated upstream: one unknown value fails the whole request with HTTP 400. Unknown numeric ids return 0 results.",
  employmentTypes: EMPLOYMENT_TYPES,
  employmentTypeTable: EMPLOYMENT_TYPE_TABLE,
  categories: CATEGORIES,
  positionLevels: POSITION_LEVELS,
  flexibleWorkArrangements: FLEXIBLE_WORK_ARRANGEMENTS,
  schemeIds: SCHEMES,
  regionsToDistrictIds: REGIONS,
  districtIdNotes: {
    "1-28": "Singapore postal districts (D01 Marina, Raffles Place... to D28 Seletar)",
    "998": "Islandwide jobs",
    "999": "Overseas jobs",
  },
  postingCompany: POSTING_COMPANIES,
  sortBy: SORT_VALUES,
  languages: LANGUAGES,
  salary: "Minimum monthly SGD; matches jobs whose salary range maximum is at least the value.",
  noEffectFilters: ["company", "blacklistTerm", "skillUuids", "uuids", "minPostingDate (applied client-side by this server)"],
} as const;

export function registerFiltersResource(server: McpServer): void {
  server.registerResource(
    "filters",
    "careersfuture://filters",
    {
      title: "Search filter values",
      description: "All allowed, live-tested values for search_jobs filters, plus the region to district id table.",
      mimeType: "application/json",
    },
    (uri) => ({
      contents: [{ uri: uri.href, text: JSON.stringify(KNOWN_FILTERS, null, 2) }],
    }),
  );
}
