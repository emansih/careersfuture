import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McfClient } from "../mcf/client.js";
import {
  CATEGORIES,
  EMPLOYMENT_TYPES,
  POSITION_LEVELS,
  POSTING_COMPANIES,
  REGION_NAMES,
  REGIONS,
  SORT_VALUES,
} from "../mcf/filters.js";
import { jobSummarySchema, searchResponseSchema, summarizeJob } from "../mcf/jobs.js";
import { errorResult, jsonResult, READ_ONLY_ANNOTATIONS } from "./shared.js";

function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const stringList = (description: string) => z.array(z.string().trim().min(1)).optional().describe(description);

const inputSchema = {
  search: z
    .string()
    .optional()
    .describe("Free-text keywords, e.g. 'software engineer'. Trimmed; omitted when blank."),
  salary: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Minimum monthly salary in SGD. Matches jobs whose salary range MAXIMUM is at least this value (the minimum of the range can be lower).",
    ),
  employmentTypes: z
    .array(z.enum(EMPLOYMENT_TYPES))
    .optional()
    .describe(
      `Employment types (OR within the list). Allowed: ${EMPLOYMENT_TYPES.join(", ")}. Use these search names; the GraphQL names 'Internship' and 'Flexi Time' are rejected upstream with HTTP 400. See list_employment_types.`,
    ),
  categories: z
    .array(z.enum(CATEGORIES))
    .optional()
    .describe(`Job function categories (OR within the list). Allowed: ${CATEGORIES.join(" | ")}.`),
  positionLevels: z
    .array(z.enum(POSITION_LEVELS))
    .optional()
    .describe(`Job levels (OR within the list). Allowed: ${POSITION_LEVELS.join(", ")}.`),
  districtIds: z
    .array(z.number().int().min(1))
    .optional()
    .describe(
      "Singapore district ids (1-28, e.g. 1 = D01 Marina, Raffles Place; 998 = Islandwide jobs; 999 = overseas). Unknown ids just return 0 results. Combined with any ids from 'region'.",
    ),
  region: z
    .array(z.enum(REGION_NAMES))
    .optional()
    .describe(
      `Convenience: regions expanded to districtIds. ${REGION_NAMES.map((r) => `${r} = ${REGIONS[r].join(",")}`).join("; ")}.`,
    ),
  schemeIds: z
    .array(z.number().int().min(1))
    .optional()
    .describe(
      "Government support scheme ids: 2 = Career Conversion Programme (CCP), 7 = Mid-Career Pathways Programme, 8 = GRaduate Industry Traineeships (GRIT). Ids 1, 3, 4, 5, 6 (P-Max, Career Trial, Career Support, SGUnited Traineeships, SGUnited Mid-Career Pathways) exist but had no jobs when tested. Scheme names are rejected upstream.",
    ),
  company: z
    .string()
    .optional()
    .describe("Company filter. Live tests showed NO effect on results; sent anyway."),
  postingCompany: z
    .array(z.enum(POSTING_COMPANIES))
    .optional()
    .describe("'Direct' = direct employers, 'Third Party' = recruiters/agencies. Omit for both."),
  blacklistTerm: z
    .string()
    .optional()
    .describe("Keyword to exclude. Live tests showed NO effect on results; sent anyway."),
  skillUuids: stringList(
    "Skill UUIDs (e.g. from suggest_skills). Live tests showed NO effect on result totals (it may only affect ranking); sent anyway.",
  ),
  minPostingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .refine(isRealDate, "Not a valid calendar date")
    .optional()
    .describe(
      "Only jobs posted on or after this date (YYYY-MM-DD). The MyCareersFuture API IGNORES this filter, so it is sent upstream but also applied client-side to the returned page only (total is the unfiltered upstream count; filteredOutByMinPostingDate reports how many were dropped). Pair with sortBy 'new_posting_date' for meaningful results.",
    ),
  flexibleWorkArrangements: z
    .array(z.number().int().min(1).max(6))
    .optional()
    .describe(
      "Flexible work arrangement ids (numbers, not names): 1 = Flexi-Hours, 2 = Telecommuting, 3 = Employees Choice of Days Off, 4 = Staggered Time, 5 = Compressed Work Schedule, 6 = Creative Scheduling.",
    ),
  responsiveEmployer: z
    .boolean()
    .optional()
    .describe("true = only responsive employers. false is the same as omitting it."),
  uuids: stringList("Job UUIDs. Live tests showed NO effect on results; sent anyway."),
  sortBy: z
    .enum(SORT_VALUES)
    .optional()
    .describe(
      "'relevancy' (default; field omitted), 'new_posting_date' (newest first), 'min_monthly_salary' (highest first), or 'normalised_job_title' (works, though the web UI does not offer it).",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Results per page (1-100, default 20). Large limits produce very large outputs."),
  detail: z
    .enum(["compact", "full"])
    .default("compact")
    .describe(
      "'compact' (default) omits skills, address and jobDetailsUrl per result; 'full' includes them. get_job always has the full posting.",
    ),
  page: z.number().int().min(0).default(0).describe("0-based page number (default 0)."),
};

const outputSchema = {
  total: z
    .number()
    .describe("Total matching jobs across all pages, as reported upstream (not reduced by minPostingDate)."),
  filteredOutByMinPostingDate: z
    .number()
    .optional()
    .describe("Present when minPostingDate is set: results on this page dropped by the client-side date filter."),
  page: z.number(),
  limit: z.number(),
  hasMore: z.boolean().describe("True when further pages exist."),
  results: z.array(jobSummarySchema),
};

type SearchInput = {
  [K in keyof typeof inputSchema]: z.output<(typeof inputSchema)[K]>;
};

/** Builds the POST body: always `sessionId: ""`, never `guid`, other fields only when provided. */
export function buildSearchBody(input: Omit<SearchInput, "limit" | "page" | "detail">): Record<string, unknown> {
  const body: Record<string, unknown> = { sessionId: "" };

  const text = (key: string, value: string | undefined): void => {
    const trimmed = value?.trim();
    if (trimmed) body[key] = trimmed;
  };
  const list = (key: string, value: ReadonlyArray<unknown> | undefined): void => {
    if (value && value.length > 0) body[key] = value;
  };

  text("search", input.search);
  if (input.salary !== undefined) body["salary"] = input.salary;
  list("employmentTypes", input.employmentTypes);
  list("categories", input.categories);
  list("positionLevels", input.positionLevels);
  const districts = new Set<number>(input.districtIds ?? []);
  for (const region of input.region ?? []) for (const id of REGIONS[region]) districts.add(id);
  list("districtIds", [...districts]);
  list("schemeIds", input.schemeIds);
  text("company", input.company);
  list("postingCompany", input.postingCompany);
  text("blacklistTerm", input.blacklistTerm);
  list("skillUuids", input.skillUuids);
  if (input.minPostingDate !== undefined) body["minPostingDate"] = input.minPostingDate;
  list("flexibleWorkArrangements", input.flexibleWorkArrangements);
  if (input.responsiveEmployer !== undefined) body["responsiveEmployer"] = input.responsiveEmployer;
  list("uuids", input.uuids);
  if (input.sortBy !== undefined && input.sortBy !== "relevancy") body["sortBy"] = [input.sortBy];

  return body;
}

export function registerSearchJobsTool(server: McpServer, client: McfClient): void {
  server.registerTool(
    "search_jobs",
    {
      title: "Search jobs",
      description:
        "Search job postings on MyCareersFuture (Singapore). Returns a compact summary per job (no description; use get_job with a uuid for the full posting) plus paging info. All filters are optional and combine with AND.",
      inputSchema,
      outputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ limit, page, detail, ...filters }) => {
      try {
        const response = await client.request(
          {
            method: "POST",
            path: "/v2/search",
            query: { limit, page },
            body: buildSearchBody(filters),
          },
          searchResponseSchema,
        );
        const upstream = response.results;
        const total = response.total ?? upstream.length;
        let hasMore = (page + 1) * limit < total;

        const min = filters.minPostingDate;
        let kept = upstream;
        if (min !== undefined) {
          // Upstream ignores minPostingDate, so filter client-side on the date part.
          kept = upstream.filter((job) => (job.metadata?.newPostingDate ?? "").slice(0, 10) >= min);
          // Newest-first: once this page ends before min, later pages are all older.
          const lastDate = upstream.at(-1)?.metadata?.newPostingDate?.slice(0, 10);
          if (filters.sortBy === "new_posting_date" && lastDate !== undefined && lastDate < min) {
            hasMore = false;
          }
        }

        return jsonResult({
          total,
          ...(min !== undefined ? { filteredOutByMinPostingDate: upstream.length - kept.length } : {}),
          page,
          limit,
          hasMore,
          results: kept.map((job) => summarizeJob(job, detail)),
        });
      } catch (error: unknown) {
        return errorResult(error, "search jobs");
      }
    },
  );
}
