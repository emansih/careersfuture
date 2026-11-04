# careersfuture-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server (TypeScript, stdio) for searching Singapore job postings on [MyCareersFuture](https://www.mycareersfuture.gov.sg).

> **Unofficial.** This wraps the public web API that the MyCareersFuture site itself uses. It was reverse-engineered (see [`docs/mycareersfuture-api.md`](docs/mycareersfuture-api.md)), is not documented or supported by the operator, and can change or break without notice. No authentication is used, and the server never calls the view-count or analytics endpoints. Please keep request volume modest.

## Tools

All tools are read-only (`readOnlyHint`, `openWorldHint`), return JSON text plus `structuredContent` (with an `outputSchema`), and report failures as `isError` results instead of crashing.

### `search_jobs`

Search postings. Returns `{ total, page, limit, hasMore, results[] }` (plus `filteredOutByMinPostingDate` when `minPostingDate` is set). Each result is a compact summary: uuid, title, company, hiringCompany, salary min/max/type, isHideSalary, employmentTypes, positionLevels, categories, district, newPostingDate, jobPostId, totalNumberJobApplication. With `detail: "full"` it also has address, skills and jobDetailsUrl. Descriptions and ranking scores are never included; use `get_job`. Text output is compact (unindented) JSON, and large `limit` values still produce large outputs.

| Input | Type | Notes |
|---|---|---|
| `search` | string | Free-text keywords |
| `salary` | int | Minimum monthly SGD; matches jobs whose salary range **maximum** is at least this |
| `employmentTypes` | enum[] | `Permanent`, `Full Time`, `Contract`, `Part Time`, `Temporary`, `Freelance`, `Internship/Attachment`, `Flexi-work`. Other values (e.g. `Internship`, `Flexi Time`) make upstream return HTTP 400, so they are rejected locally |
| `categories` | enum[] | The 43 job function names (see the `careersfuture://filters` resource), e.g. `Information Technology` |
| `positionLevels` | enum[] | `Senior Management`, `Middle Management`, `Manager`, `Professional`, `Senior Executive`, `Executive`, `Junior Executive`, `Non-executive`, `Fresh/entry level` |
| `districtIds` | int[] | District ids 1-28; `998` = Islandwide; `999` = overseas |
| `region` | enum[] | Convenience: `Central`, `East`, `North`, `North-East`, `West`, `Islandwide`, expanded to district ids and merged with `districtIds` |
| `schemeIds` | int[] | `2` = CCP, `7` = Mid-Career Pathways, `8` = GRIT (others exist but had no jobs) |
| `flexibleWorkArrangements` | int[] 1-6 | 1 Flexi-Hours, 2 Telecommuting, 3 Employees Choice of Days Off, 4 Staggered Time, 5 Compressed Work Schedule, 6 Creative Scheduling |
| `postingCompany` | `Direct` \| `Third Party`[] | Direct employers / recruiters |
| `responsiveEmployer` | boolean | `true` limits to responsive employers |
| `company`, `blacklistTerm`, `skillUuids`, `uuids` | various | Passed through, but live tests showed **no effect** on results |
| `minPostingDate` | `YYYY-MM-DD` | Validated as a real date. **The upstream API ignores it.** It is still sent, but also applied client-side to the returned page only (keeps results whose `newPostingDate` is on or after it). `total` stays the unfiltered upstream count; `filteredOutByMinPostingDate` reports how many were dropped. With `sortBy: "new_posting_date"`, `hasMore` becomes false once a page's last result is older than the date. Pair it with that sort order |
| `detail` | `compact` \| `full` | Default `compact`; `full` adds address, skills and jobDetailsUrl per result |
| `sortBy` | `relevancy` \| `new_posting_date` \| `min_monthly_salary` \| `normalised_job_title` | `relevancy` is the default (field omitted upstream); salary sorts highest first |
| `limit` | int 1-100 | Default 20; large limits produce very large outputs |
| `page` | int >= 0 | 0-based, default 0 |

Only provided fields are sent. The body always has `"sessionId": ""` and never `guid`.

### `get_job`

Full posting for one job. Inputs: `uuid` (32 hex chars; hyphenated UUIDs accepted), optional `lang` (`english` \| `zh-Hans` \| `ms` \| `ta`), optional `includeRawHtml` (default false). The HTML description is converted to plain text. Never sends `updateApplicationCount`.

### `list_employment_types`

No inputs. Returns a static, live-tested table `{ employmentTypes: [{ id, searchName, graphqlName }] }` with no network call. Pass `searchName` to `search_jobs`; `graphqlName` is the upstream lookup's label, which search rejects for `Internship` and `Flexi Time` (the lookup is not used, for that reason).

### `suggest_skills`

Input: `jobTitle`. Returns `{ skills: [{ skill, uuid }] }`; the uuids work as `skillUuids` in `search_jobs`.

### `suggest_jobs`

Input: `searchTerms` (string[]) and/or `skillUuids` (string[]); at least one required. Returns `{ total, results[] }` with the same summaries as `search_jobs`.

### `popular_job_titles` / `in_demand_job_titles`

No inputs. Return `{ titles: [{ title, count }] }`.

## Resources

- `careersfuture://about` - what the server does and its tools
- `careersfuture://filters` - all allowed, live-tested filter values: employment types, categories, position levels, flexible work arrangements, scheme ids, region to district id table, posting company, sort options, languages.

## Example usage

Ask your MCP client something like:

> Find the 5 newest permanent software engineer jobs paying at least 6000 a month, then show me the full description of the first one.

which becomes roughly:

```json
{ "name": "search_jobs", "arguments": { "search": "software engineer", "employmentTypes": ["Permanent"], "salary": 6000, "sortBy": "new_posting_date", "limit": 5 } }
```
```json
{ "name": "get_job", "arguments": { "uuid": "3a368bc886540633415264664f9fdcfa" } }
```

## Install, build, run

```bash
pnpm install
pnpm build
pnpm start         # runs dist/index.js over stdio
pnpm dev           # watch mode via tsx
pnpm typecheck
pnpm test          # no network needed; the HTTP client is faked
```

The server logs to stderr only; stdout is reserved for MCP JSON-RPC.

## Test with the Inspector

```bash
pnpm build
pnpm inspect
```

This runs `pnpm dlx @modelcontextprotocol/inspector node dist/index.js` and opens the Inspector UI.

## Add to Claude

Claude Code:

```bash
claude mcp add careersfuture -- node <abs path>/dist/index.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "careersfuture": {
      "command": "node",
      "args": ["<abs path>/dist/index.js"]
    }
  }
}
```

## Layout

- `src/index.ts` - entry point, stdio transport
- `src/server.ts` - `createServer({ client? })` factory
- `src/mcf/` - HTTP client (`client.ts`, injectable `fetch`, 15s timeout), response schemas and summaries (`jobs.ts`), HTML to text (`html.ts`)
- `src/tools/`, `src/resources/` - one registration per file
- `*.test.ts` - vitest tests (in-memory MCP client plus fake fetch)
