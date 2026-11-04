# MyCareersFuture API: handover notes

Reverse-engineered from the public web app at https://www.mycareersfuture.gov.sg (JS bundles and live calls, 2026-11-04). There is no official public API documentation, so treat everything here as observed behaviour that can change without notice.

## TL;DR for building the MCP tools

- **Job search and job details need no authentication.** No token, no cookie, no API key.
- Search: `POST https://api.mycareersfuture.gov.sg/v2/search?limit=<n>&page=<n>` with a JSON body.
- Job details: `GET https://api.mycareersfuture.gov.sg/v2/jobs/<uuid>`.
- Send `content-type: application/json`. The web app also sends `mcf-client: jobseeker`; requests succeed without it, but send it anyway to look like the real client.
- `sessionId` and `guid` in the body are analytics/personalisation fields, not auth. Send `"sessionId": ""` and omit `guid`.

## Base URL

`https://api.mycareersfuture.gov.sg` (the bundle's `API_V2` constant points at `/v2` on this host).

## 1. Search jobs

```
POST /v2/search?limit=20&page=0
content-type: application/json
mcf-client: jobseeker
```

```json
{
  "sessionId": "",
  "search": "software engineer",
  "employmentTypes": ["Permanent"],
  "sortBy": ["new_posting_date"]
}
```

`limit` and `page` go in the **query string**; everything else goes in the body. `page` is 0-based. `limit=100` works (tested); the web app uses 20. Responses are large: 100 results came to about 96k characters of MCP tool output, so trim fields before returning them to a model, or keep `limit` small.

### Body fields

The web app adds each field only when it has a value. Taken from the search function in `app-e96e9bea.*.js`.

| Field | Type | Notes |
|---|---|---|
| `sessionId` | string | Always sent; `""` is fine. |
| `guid` | string | Signed-in user's profile ID (see "Where guid comes from"). Optional; omit it. |
| `search` | string | Free-text keywords, trimmed. |
| `salary`, `employmentTypes`, `categories`, `positionLevels`, `districtIds`, `schemeIds`, `flexibleWorkArrangements`, `postingCompany`, `responsiveEmployer`, `sortBy` | | The sidebar filters. Values and behaviour are in **"Search filters"** below. |
| `minPostingDate` | string | **Tested: ignored by the API** (see "Filtering by posting date" below). The web app sends `YYYY-MM-DD`. |
| `company` | string | **Tested: no effect** on `total` (with both a UEN and a company name). |
| `blacklistTerm` | string | **Tested: no effect** on `total` (`search: "engineer"` plus `blacklistTerm: "sales"` gave the same 12472). |
| `skillUuids` | string[] | **Tested: no effect** on `total`. It may only affect ranking. |
| `uuids` | string[] | **Tested: no effect** on `total`. |
| `schemes` | string[] | Scheme names (`"CCP"`, full names) are **rejected with HTTP 400**. Use `schemeIds`. |
| `geolocation` | array | Not tested. |

### Search filters (the sidebar)

How each control in the web app's filter sidebar maps to the request body. The request shapes were captured from the real UI: I hooked `XMLHttpRequest` in a signed-in Chrome and clicked each filter. Every value was then checked against the live API on 2026-11-04. "Totals" are for `search: "engineer"` (12472 unfiltered) unless they say otherwise.

**Validation:** `employmentTypes`, `categories` and `positionLevels` are checked against an OpenAPI enum. An unknown value fails the whole request with **HTTP 400**: `{"message":"body: must be equal to one of the allowed values","errors":[{"path":"employmentTypes.0","errorCode":"enum.openapi.requestValidation",...}]}`. Unknown numeric IDs (`districtIds`, `schemeIds`) are not rejected; they return 0 results. Combining filters ANDs them; several values inside one filter OR them.

The web app also mirrors filter state in the page URL (`/search?search=...&positionLevel=...&districts=1&districts=2&postingCompany=Direct&flexibleWorkArrangement=1&responsiveEmployer=true&schemeIds=8&sortBy=relevancy&page=0`). The URL names are singular and differ from the API body names. Use the body names below.

#### Sort By → `sortBy`

| UI label | Body value |
|---|---|
| Relevance | omit `sortBy` (the app drops it for `relevancy`) |
| Date Posted | `["new_posting_date"]` (newest first) |
| Salary | `["min_monthly_salary"]` (highest first; tested order 80000, 40000, 30000, ...) |

The skills suggestion flow also uses `["normalised_job_title"]`.

#### Minimum Salary → `salary`

An integer, in monthly SGD. **It matches jobs whose salary range *maximum* is at least the value.** With `salary: 8000` the lowest `maximum` returned was exactly 8000, while `minimum` went as low as 4000. The app does `parseInt` on the input.

#### Employment type dropdown → `employmentTypes`

`string[]`. The allowed values, checked one by one with no search term (totals in brackets):

`"Permanent"` (29322), `"Full Time"` (54283), `"Contract"` (11403), `"Part Time"` (4471), `"Temporary"` (1861), `"Freelance"` (1020), `"Internship/Attachment"` (1295), `"Flexi-work"` (valid, but 0 jobs).

Watch out: the GraphQL `common.employmentTypes` lookup returns `"Internship"` and `"Flexi Time"`, and **both get HTTP 400 from search**, as do `"Contract Basis"`, `"Flexi Work"` and `"Flexi-Work"`. Hard-code the list above instead of using the lookup.

#### Job Function dropdown → `categories`

`string[]` of category names. All 43 values below were tested and accepted:

Accounting / Auditing / Taxation · Admin / Secretarial · Advertising / Media · Architecture / Interior Design · Banking and Finance · Building and Construction · Consulting · Customer Service · Design · Education and Training · Engineering · Entertainment · Environment / Health · Events / Promotions · F&B · General Management · General Work · Healthcare / Pharmaceutical · Hospitality · Human Resources · Information Technology · Insurance · Legal · Logistics / Supply Chain · Manufacturing · Marketing / Public Relations · Medical / Therapy Services · Personal Care / Beauty · Precision Engineering · Professional Services · Public / Civil Service · Purchasing / Merchandising · Real Estate / Property Management · Repair and Maintenance · Risk Management · Sales / Retail · Sciences / Laboratory / R&D · Security and Investigation · Social Services · Telecommunications · Travel / Tourism · Wholesale Trade · Others

(The source is `JOB_CATEGORIES` in `npm.mcf-8104721c.*.js`. The UI sorts them alphabetically and puts "Others" last.)

#### Responsive Companies toggle → `responsiveEmployer`

`true` limits results to employers with `postedCompany.responsiveEmployer.isResponsive: true` (7178 of 12472, and 20 of 20 sampled were responsive). `false` is the same as omitting it, so there is no filter for "only unresponsive".

#### Government Support → `schemeIds`

`int[]`. IDs come from the `SCHEME_ID` enum in `npm.mcf-8104721c.*.js`. The UI shows only three of them:

| UI label | Scheme | `schemeIds` | Total, no search term |
|---|---|---|---|
| For fresh graduates | GRaduate Industry Traineeships (GRIT) | `8` | 22 |
| For mid-career attachments | Mid-Career Pathways Programme | `7` | 27 |
| For mid-career switchers | Career Conversion Programme (CCP) | `2` | 603 |
| All available | all three | `[2, 7, 8]` | |

The other enum IDs exist but had no jobs on 2026-11-04: 1 P-Max, 3 Career Trial, 4 Career Support, 5 SGUnited Traineeships, 6 SGUnited Mid-Career Pathways. The captured UI requests sent `[8]`, then `[2, 7, 8]` after ticking all three. That "All available" sends exactly `[2, 7, 8]` is an assumption; it wasn't clicked on its own.

#### Flexible Work Arrangements → `flexibleWorkArrangements`

`int[]` (not strings), captured from the UI as `[1]`. Each ID was tested:

| ID | UI label | Total |
|---|---|---|
| 1 | Flexi-Hours | 462 |
| 2 | Telecommuting | 105 |
| 3 | Employees Choice of Days Off | 36 |
| 4 | Staggered Time | 85 |
| 5 | Compressed Work Schedule | 129 |
| 6 | Creative Scheduling | 82 |

Results carry the same IDs in `results[].flexibleWorkArrangements[]` as `{id, flexibleWorkArrangement}`.

#### Job Level → `positionLevels`

`string[]` of names, captured from the UI as `["Senior Executive"]`. Allowed values, in UI order (totals with no search term): `"Senior Management"` (1559), `"Middle Management"` (1926), `"Manager"` (7448), `"Professional"` (8520), `"Senior Executive"` (5775), `"Executive"` (17739), `"Junior Executive"` (7773), `"Non-executive"` (11379), `"Fresh/entry level"` (10102). `"Operational"` is in an older constant table but returns HTTP 400.

#### Location → `districtIds`

`int[]`. Ticking a region in the UI sends every district ID in that region. Ticking **Central** sent `[1,2,3,4,6,7,8,9,10,11,12,13,14,15,20]`. IDs 1–28 were all accepted.

| Region | District IDs |
|---|---|
| Central | 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20 |
| East | 16, 17, 18 |
| North | 25, 26, 27 |
| North-East | 19, 28 |
| West | 5, 21, 22, 23, 24 |
| Islandwide | **998** (4635 results for "engineer") |
| (Overseas, not in UI) | 999 (9 results) |

The region grouping comes from `DISTRICTS` in `npm.mcf-8104721c.*.js`. That table lists Islandwide as `9999`, but **`9999` returns 0 results**; the jobs carry district `998`. I didn't capture which value the UI sends for Islandwide, so use `998`. District names ("D01 Marina, Raffles Place, People's Park, Cecil" up to "D28 Seletar") are in the same file and in `results[].address.districts[].location`.

#### Posted By → `postingCompany`

`string[]`. The web app always sends this field and defaults it to `[]`.

| UI label | Value | Total | What it matches |
|---|---|---|---|
| Direct Employers | `"Direct"` | 12005 | `hiringCompany: null`, `isPostedOnBehalf: false` |
| Recruiters | `"Third Party"` | 467 | agency posts: `hiringCompany` set, `isPostedOnBehalf: true` |
| both, or `[]` | | 12472 | everything |

### Filtering by posting date

The API accepts `minPostingDate` but ignores it. Live tests on 2026-11-04:

- For search "software engineer", `total` stayed at 1151 and the same results came back with no `minPostingDate`, `"2026-11-04"`, `"2026-11-04T00:00:00.000Z"`, epoch millis, or `"2030-01-01"`. With no search term, `total` stayed at 72195 for both `"2026-11-04"` and `"2030-01-01"`.
- Putting it in the query string (`&minPostingDate=2026-11-04`) made no difference, and neither did the guessed names `postingDate`, `postingDates` or `postingDateFrom`.
- The web app sends it the same way (`.send(O?{minPostingDate:O}:{})` in `app-e96e9bea.*.js`). It only sets it in the skills-based suggestion flow, as `moment().subtract(30,"days").format("YYYY-MM-DD")` with `limit: 10` and `sortBy: ["normalised_job_title"]`.

**Workaround** (the MCP server uses this): sort by `["new_posting_date"]` and filter on `results[].metadata.newPostingDate` yourself, paging until dates fall below the cutoff.

### Response

Top-level keys: `results`, `total`, `countWithoutFilters`, `searchRankingId`, `_links` (`self`, `first`, `next`, `last` hrefs for paging).

Each item in `results` has:

- `uuid`: the job ID, used for the details call
- `title`, `status`
- `salary`: `{ minimum, maximum, type: { salaryType: "Monthly" } }`
- `postedCompany`: `{ uen, name, logoFileName, responsiveEmployer }`; `hiringCompany` is set for agency posts
- `address`: block, street, postalCode, `districts[]`, `lat`, `lng`, `isOverseas`
- `employmentTypes[]`, `positionLevels[]` (`{id, position}`), `categories[]` (`{category, ...}`), `skills[]` (`{skill, uuid}`), `schemes[]`, `flexibleWorkArrangements[]`, `shiftPattern`
- `metadata`: `jobPostId` (e.g. `MCF-2026-1951308`), `newPostingDate`, `updatedAt`, `totalNumberJobApplication`, `jobDetailsUrl` (public web URL), `isHideSalary`, `isPostedOnBehalf`
- Ranking scores: `score`, `title_match_score`, `job_role_score`, `skills_match_score`, `recency_score`, `retriever_score`

The search results do **not** include the job description. Use the details call for that.

## 2. Job details

```
GET /v2/jobs/{uuid}
mcf-client: jobseeker
```

The web app adds `?updateApplicationCount=true` and, for translations, `&lang=<english|zh-Hans|ms|ta>`. Both are optional. Leave `updateApplicationCount` off so you don't bump the job's counters.

Response keys: `uuid`, `title`, `description` (HTML), `minimumYearsExperience`, `numberOfVacancies`, `workingHours`, `shiftPattern`, `otherRequirements`, `skills`, `schemes`, `flexibleWorkArrangements`, `ssocCode`, `ssocVersion`, `occupationId`, `ssecEqa`, `ssecFos`, `categories`, `employmentTypes`, `positionLevels`, `status`, `postedCompany`, `hiringCompany`, `screeningQuestions`, `address`, `salary`, `sourceCode`, `psdUrl`, `_links`, and a richer `metadata` (`createdAt`, `originalPostingDate`, `expiryDate`, `totalNumberOfView`, `repostCount`, `editCount`, ...).

## 3. Lookup values (GraphQL, no auth)

The app's GraphQL endpoint is `POST https://api.mycareersfuture.gov.sg/profile` (Apollo). It answers some queries without auth:

```json
{ "query": "query { common { employmentTypes { id name } } }" }
```

Employment types returned: Temporary (02), Contract (03), Part Time (05), Freelance (06), Permanent (07), Full Time (08), Flexi Time (09), Internship (10). **Don't feed these to search:** `"Internship"` and `"Flexi Time"` get HTTP 400 there. See "Search filters" for the values search accepts.

`common` also has `ssocList`, `ssicList` and `countriesList` (seen in the bundle's `getAllEntities` query). It has **no** `positionLevels`, `categories`, `districts` or `schemes` fields; those queries fail validation. The full value lists are hard-coded in "Search filters" above instead.

## 4. Other endpoints seen in the bundle (not tested)

- `GET /v2/jobs?...`: older GET form of search, same params as query strings. **Unusable right now:** it returned `{"message":"Endpoint request timed out"}` on two tries on 2026-11-04.
- `POST /v2/jobs/suggestions`: suggested jobs from `skillUuids` / `searchTerms`
- `POST /v2/skills/suggestions` `{ jobTitle }`: skills for a job title
- `GET /popular-job-titles`, `GET /in-demand-job-titles`
- `POST /increment-job-post-view-count` `{ uuid }`: **don't call**; it bumps view counts
- `POST /v2/analytics/clickstream`: analytics; don't call

## Authentication (only needed for user-specific features)

You don't need any of this for search. It's documented so the next agent doesn't go looking for a token.

- Sign-in is via Singpass. The API sets **HttpOnly cookies on `api.mycareersfuture.gov.sg`**. No bearer token is readable from JS, localStorage or sessionStorage.
- The frontend only keeps flags it can read: `account-expiry` (JWT `exp`) in localStorage and a `has-myinfo-claims` cookie.
- Authenticated calls send the cookie with superagent `.withCredentials()` or `fetch(..., { credentials: "include" })`:
  - `POST /v2/account` returns the decoded session claims (`authorization`, `exp`, `iat`, `iss`, `userName`, `additionalInfo`, ...). It gives 200 with cookies and 401 without, and is how the app checks whether you're signed in.
  - The GraphQL `/profile` endpoint for profile data (`profileByNric`, `verifiedProfile`, ...)
  - `/v2/occupations/bookmarks*` and the `/sse/v2/...` streams
- The search call is built **without** `withCredentials()`, so browsers send it as `credentials: "omit"`. That's why no token shows up on it: search is public by design.
- Reusing a user's session from a server would mean copying those HttpOnly cookies out of the browser. Don't do that; no current feature needs it.

### Where `guid` comes from

1. On load the app calls `POST /v2/account` with cookies, and the claims include `userName` (the user's NRIC).
2. It then runs the GraphQL query `profileByNric(nric: userName) { id ... }` on `/profile`.
3. The returned `id` is stored in Redux as `state.profile.user.id` (selector `e => e.profile.user.id`, module 42007 in `app-1b08af27.*.js`).
4. The search saga in `app-835983f3.*.js` reads that selector and passes it as `guid`. It's also sent with view, save, apply and follow analytics events.

This was confirmed live: the `id` from `profileByNric` equalled the `guid` in a captured search request. Signed-out users send no `guid`.

## Minimal examples

```bash
curl -s -X POST 'https://api.mycareersfuture.gov.sg/v2/search?limit=20&page=0' \
  -H 'content-type: application/json' -H 'mcf-client: jobseeker' \
  -d '{"sessionId":"","search":"software engineer","employmentTypes":["Permanent"]}'
```

```bash
curl -s 'https://api.mycareersfuture.gov.sg/v2/jobs/3a368bc886540633415264664f9fdcfa' -H 'mcf-client: jobseeker'
```

## How this was investigated (for repeating it)

- Chrome DevTools MCP launches its own clean Chrome profile. To see a signed-in session, use Claude in Chrome, or start chrome-devtools-mcp with `--autoConnect`.
- The Claude in Chrome extension redacts tool output that looks like cookies or JWTs. Return booleans or comparisons from page scripts instead of raw values.
- Bundle analysis: download the `<script src>` files listed in `https://www.mycareersfuture.gov.sg/search` and grep them for `API_V2`, `"/search"`, `guid` and `withCredentials`. File names are content-hashed, so the module names above will drift between deployments.

## Open items

- Confirm which district ID the UI sends for "Islandwide" (`998` works; the bundle's region table says `9999`, which returns nothing).
- `company`, `blacklistTerm`, `skillUuids` and `uuids` had no effect on `total`. Find out whether they need another endpoint or format, or are simply dead.
- Check whether rate limiting applies. Nothing showed up across the handful of test calls.
- Find out whether there is any server-side posting-date filter. `minPostingDate` is ignored on `/v2/search`, and the `GET /v2/jobs` form times out, so it can't be tried there. Until then, filter client-side.
