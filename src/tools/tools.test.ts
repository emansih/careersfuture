import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, expect, it, vi } from "vitest";
import { McfClient } from "../mcf/client.js";
import { EMPLOYMENT_TYPES } from "../mcf/filters.js";
import { createServer } from "../server.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

async function setup(respond: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => respond(new URL(url), init));
  const server = createServer({ client: new McfClient({ fetch: fetchMock }) });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  closers.push(() => client.close(), () => server.close());
  return { client, fetchMock };
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.at(-1) as [string, RequestInit] | undefined;
  if (!call) throw new Error("fetch was not called");
  const [url, init] = call;
  const body = typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
  return { url: new URL(url), init, body };
}

const searchJob = {
  uuid: "c566c8fc71cac10b68b427a5627dd078",
  title: "Software Engineer",
  score: 9.9,
  title_match_score: 4,
  retriever_score: 8.4,
  salary: { minimum: 9000, maximum: 15000, type: { salaryType: "Monthly" } },
  postedCompany: { uen: "1", name: "ACME PTE. LTD." },
  hiringCompany: { uen: "2", name: "REAL EMPLOYER" },
  address: {
    block: "10",
    street: "CENTRAL EXCHANGE GREEN",
    building: "PIXEL",
    postalCode: "138649",
    isOverseas: false,
    districts: [{ id: 5, location: "D05 Pasir Panjang" }],
  },
  employmentTypes: [{ id: 8, employmentType: "Full Time" }],
  positionLevels: [{ id: 9, position: "Executive" }],
  categories: [{ id: 11, category: "Engineering" }],
  skills: [{ skill: "Docker", uuid: "u1" }],
  metadata: {
    jobPostId: "MCF-2026-1",
    newPostingDate: "2026-11-04",
    totalNumberJobApplication: 3,
    isHideSalary: false,
    jobDetailsUrl: "https://www.mycareersfuture.gov.sg/job/x",
  },
};

it("search_jobs sends minimal body, defaults, and headers", async () => {
  const { client, fetchMock } = await setup(() => Response.json({ results: [], total: 0 }));
  const result = await client.callTool({ name: "search_jobs", arguments: {} });
  expect(result.isError).toBeFalsy();

  const { url, init, body } = lastCall(fetchMock);
  expect(url.origin + url.pathname).toBe("https://api.mycareersfuture.gov.sg/v2/search");
  expect(url.searchParams.get("limit")).toBe("20");
  expect(url.searchParams.get("page")).toBe("0");
  expect(init.method).toBe("POST");
  expect(init.headers).toMatchObject({ "mcf-client": "jobseeker", "content-type": "application/json" });
  expect(body).toEqual({ sessionId: "" });
  expect(body).not.toHaveProperty("guid");
});

it("search_jobs maps filters into the body and omits blanks/relevancy", async () => {
  const { client, fetchMock } = await setup(() => Response.json({ results: [], total: 0 }));
  await client.callTool({
    name: "search_jobs",
    arguments: {
      search: "  software engineer ",
      salary: 5000,
      employmentTypes: ["Permanent"],
      categories: [],
      districtIds: [1, 5],
      company: "   ",
      minPostingDate: "2026-10-01",
      responsiveEmployer: false,
      sortBy: "new_posting_date",
      limit: 5,
      page: 2,
    },
  });
  const { url, body } = lastCall(fetchMock);
  expect(url.searchParams.get("limit")).toBe("5");
  expect(url.searchParams.get("page")).toBe("2");
  expect(body).toEqual({
    sessionId: "",
    search: "software engineer",
    salary: 5000,
    employmentTypes: ["Permanent"],
    districtIds: [1, 5],
    minPostingDate: "2026-10-01",
    responsiveEmployer: false,
    sortBy: ["new_posting_date"],
  });

  await client.callTool({ name: "search_jobs", arguments: { sortBy: "relevancy" } });
  expect(lastCall(fetchMock).body).toEqual({ sessionId: "" });

  await client.callTool({ name: "search_jobs", arguments: { sortBy: "normalised_job_title" } });
  expect(lastCall(fetchMock).body).toEqual({ sessionId: "", sortBy: ["normalised_job_title"] });
});

it("search_jobs rejects invalid input without calling the API", async () => {
  const { client, fetchMock } = await setup(() => Response.json({ results: [], total: 0 }));
  for (const args of [{ minPostingDate: "2026-02-30" }, { minPostingDate: "yesterday" }, { limit: 101 }, { page: -1 }]) {
    const result = await client.callTool({ name: "search_jobs", arguments: args }).catch((e: unknown) => e);
    const failed = result instanceof Error || (typeof result === "object" && result !== null && "isError" in result && result.isError === true);
    expect(failed).toBe(true);
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

it("search_jobs returns compact summaries without ranking scores", async () => {
  const { client } = await setup(() => Response.json({ results: [searchJob], total: 45 }));
  const result = await client.callTool({ name: "search_jobs", arguments: { limit: 20, page: 1 } });
  expect(result.isError).toBeFalsy();
  const structured = result.structuredContent as Record<string, unknown>;
  expect(structured).toMatchObject({ total: 45, page: 1, limit: 20, hasMore: true });
  expect((result.content as Array<{ text: string }>)[0]?.text).toBe(JSON.stringify(structured));
  const text = JSON.stringify(structured);
  expect(text).not.toContain("score");
  expect((structured["results"] as unknown[])[0]).toEqual({
    uuid: searchJob.uuid,
    title: "Software Engineer",
    company: "ACME PTE. LTD.",
    hiringCompany: "REAL EMPLOYER",
    salary: { min: 9000, max: 15000, type: "Monthly" },
    isHideSalary: false,
    employmentTypes: ["Full Time"],
    positionLevels: ["Executive"],
    categories: ["Engineering"],
    district: "D05 Pasir Panjang",
    newPostingDate: "2026-11-04",
    jobPostId: "MCF-2026-1",
    totalNumberJobApplication: 3,
  });
});

it("search_jobs detail=full restores address, skills and jobDetailsUrl; text is compact JSON", async () => {
  const { client } = await setup(() => Response.json({ results: [searchJob], total: 1 }));
  const result = await client.callTool({ name: "search_jobs", arguments: { detail: "full" } });
  const structured = result.structuredContent as { results: Array<Record<string, unknown>> };
  expect(structured.results[0]).toMatchObject({
    address: "10 CENTRAL EXCHANGE GREEN, PIXEL, S138649",
    skills: ["Docker"],
    jobDetailsUrl: "https://www.mycareersfuture.gov.sg/job/x",
  });
  const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";
  expect(text).toBe(JSON.stringify(structured));
  expect(text).not.toContain("\n");
});

const dated = (uuid: string, newPostingDate: string) => ({
  ...searchJob,
  uuid,
  metadata: { ...searchJob.metadata, newPostingDate },
});

it("search_jobs filters client-side by minPostingDate and still sends it upstream", async () => {
  const { client, fetchMock } = await setup(() =>
    Response.json({
      results: [dated("a", "2026-11-04"), dated("b", "2026-11-03"), dated("c", "2026-11-02")],
      total: 500,
    }),
  );
  const result = await client.callTool({
    name: "search_jobs",
    arguments: { minPostingDate: "2026-11-03", limit: 3 },
  });
  expect(lastCall(fetchMock).body).toMatchObject({ minPostingDate: "2026-11-03" });
  const structured = result.structuredContent as { results: Array<{ uuid: string }> };
  expect(structured.results.map((r) => r.uuid)).toEqual(["a", "b"]);
  expect(structured).toMatchObject({ total: 500, filteredOutByMinPostingDate: 1, hasMore: true });
});

it("search_jobs minPostingDate: hasMore false only when sorted newest-first and page ends before the date", async () => {
  const older = { results: [dated("a", "2026-11-04"), dated("c", "2026-11-01")], total: 500 };
  const { client } = await setup(() => Response.json(older));

  const sorted = await client.callTool({
    name: "search_jobs",
    arguments: { minPostingDate: "2026-11-03", sortBy: "new_posting_date", limit: 2 },
  });
  expect(sorted.structuredContent).toMatchObject({ hasMore: false, filteredOutByMinPostingDate: 1 });

  const unsorted = await client.callTool({
    name: "search_jobs",
    arguments: { minPostingDate: "2026-11-03", limit: 2 },
  });
  expect(unsorted.structuredContent).toMatchObject({ hasMore: true });

  const noFilter = await client.callTool({ name: "search_jobs", arguments: { sortBy: "new_posting_date", limit: 2 } });
  expect(noFilter.structuredContent).not.toHaveProperty("filteredOutByMinPostingDate");
  expect(noFilter.structuredContent).toMatchObject({ hasMore: true });
});

it("search_jobs reports hasMore=false on the last page", async () => {
  const { client } = await setup(() => Response.json({ results: [searchJob], total: 21 }));
  const result = await client.callTool({ name: "search_jobs", arguments: { limit: 20, page: 1 } });
  expect(result.structuredContent).toMatchObject({ hasMore: false });
});

it("search_jobs returns isError results on HTTP failure", async () => {
  const { client } = await setup(() => new Response("boom", { status: 500 }));
  const result = await client.callTool({ name: "search_jobs", arguments: {} });
  expect(result.isError).toBe(true);
  expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/HTTP 500: boom/);
});

const jobDetails = {
  ...searchJob,
  description: "<p>Build things &amp; ship.</p><ul><li>Python</li><li>Docker</li></ul>",
  minimumYearsExperience: 4,
  numberOfVacancies: 1,
  workingHours: null,
  shiftPattern: null,
  otherRequirements: null,
  schemes: [{ scheme: { name: "SFEC" } }, "Plain"],
  flexibleWorkArrangements: [],
  status: { id: 102, jobStatus: "Open" },
  metadata: { ...searchJob.metadata, expiryDate: "2026-12-04", totalNumberOfView: 77 },
};

it("get_job calls GET /v2/jobs/{uuid} without updateApplicationCount", async () => {
  const { client, fetchMock } = await setup(() => Response.json(jobDetails));
  const result = await client.callTool({ name: "get_job", arguments: { uuid: searchJob.uuid } });
  expect(result.isError).toBeFalsy();

  const { url, init } = lastCall(fetchMock);
  expect(url.pathname).toBe(`/v2/jobs/${searchJob.uuid}`);
  expect(url.search).toBe("");
  expect(url.searchParams.has("updateApplicationCount")).toBe(false);
  expect(init.method).toBe("GET");
  expect(init.headers).toMatchObject({ "mcf-client": "jobseeker" });

  const structured = result.structuredContent as Record<string, unknown>;
  expect(structured["description"]).toBe("Build things & ship.\n\n- Python\n- Docker");
  expect(structured).not.toHaveProperty("descriptionHtml");
  expect(structured).toMatchObject({
    status: "Open",
    minimumYearsExperience: 4,
    expiryDate: "2026-12-04",
    totalNumberOfView: 77,
    schemes: ["SFEC", "Plain"],
  });
});

it("get_job passes lang, normalises hyphenated uuids and can include raw HTML", async () => {
  const { client, fetchMock } = await setup(() => Response.json(jobDetails));
  const result = await client.callTool({
    name: "get_job",
    arguments: { uuid: "C566C8FC-71CA-C10B-68B4-27A5627DD078", lang: "zh-Hans", includeRawHtml: true },
  });
  const { url } = lastCall(fetchMock);
  expect(url.pathname).toBe("/v2/jobs/c566c8fc71cac10b68b427a5627dd078");
  expect(url.searchParams.get("lang")).toBe("zh-Hans");
  expect(url.searchParams.has("updateApplicationCount")).toBe(false);
  expect(result.structuredContent).toMatchObject({ descriptionHtml: jobDetails.description });
});

it("get_job rejects malformed uuids and surfaces 404 as a tool error", async () => {
  const { client, fetchMock } = await setup(() => new Response('{"message":"Not found"}', { status: 404 }));
  const bad = await client.callTool({ name: "get_job", arguments: { uuid: "../etc/passwd" } }).catch((e: unknown) => e);
  expect(bad instanceof Error || (bad as { isError?: boolean }).isError === true).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();

  const result = await client.callTool({ name: "get_job", arguments: { uuid: searchJob.uuid } });
  expect(result.isError).toBe(true);
  expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/HTTP 404.*not found/);
});

it("list_employment_types returns the static table with search names and makes no HTTP call", async () => {
  const { client, fetchMock } = await setup(() => new Response("no", { status: 500 }));
  const result = await client.callTool({ name: "list_employment_types", arguments: {} });
  expect(fetchMock).not.toHaveBeenCalled();
  const types = (result.structuredContent as { employmentTypes: Array<{ searchName: string; graphqlName: string }> })
    .employmentTypes;
  expect(types.map((t) => t.searchName).sort()).toEqual([...EMPLOYMENT_TYPES].sort());
  expect(types).toContainEqual({ id: "10", searchName: "Internship/Attachment", graphqlName: "Internship" });
  expect(types).toContainEqual({ id: "09", searchName: "Flexi-work", graphqlName: "Flexi Time" });
});

async function rejects(client: Client, args: Record<string, unknown>): Promise<boolean> {
  const result = await client.callTool({ name: "search_jobs", arguments: args }).catch((e: unknown) => e);
  return result instanceof Error || (result as { isError?: boolean }).isError === true;
}

it("search_jobs rejects values the upstream enum would 400 on, before any HTTP call", async () => {
  const { client, fetchMock } = await setup(() => Response.json({ results: [], total: 0 }));
  expect(await rejects(client, { employmentTypes: ["Internship"] })).toBe(true);
  expect(await rejects(client, { employmentTypes: ["Flexi Time"] })).toBe(true);
  expect(await rejects(client, { categories: ["Tech"] })).toBe(true);
  expect(await rejects(client, { positionLevels: ["Operational"] })).toBe(true);
  expect(await rejects(client, { postingCompany: ["Agency"] })).toBe(true);
  expect(await rejects(client, { flexibleWorkArrangements: ["Flexible hours"] })).toBe(true);
  expect(await rejects(client, { flexibleWorkArrangements: [7] })).toBe(true);
  expect(await rejects(client, { sortBy: "salary" })).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("search_jobs sends enum values, numeric id arrays, postingCompany and min_monthly_salary sort", async () => {
  const { client, fetchMock } = await setup(() => Response.json({ results: [], total: 0 }));
  await client.callTool({
    name: "search_jobs",
    arguments: {
      employmentTypes: ["Internship/Attachment", "Flexi-work"],
      categories: ["Information Technology"],
      positionLevels: ["Fresh/entry level"],
      flexibleWorkArrangements: [1, 6],
      schemeIds: [2, 7, 8],
      postingCompany: ["Direct", "Third Party"],
      sortBy: "min_monthly_salary",
    },
  });
  expect(lastCall(fetchMock).body).toEqual({
    sessionId: "",
    employmentTypes: ["Internship/Attachment", "Flexi-work"],
    categories: ["Information Technology"],
    positionLevels: ["Fresh/entry level"],
    schemeIds: [2, 7, 8],
    postingCompany: ["Direct", "Third Party"],
    flexibleWorkArrangements: [1, 6],
    sortBy: ["min_monthly_salary"],
  });
});

it("search_jobs expands region into deduplicated districtIds", async () => {
  const { client, fetchMock } = await setup(() => Response.json({ results: [], total: 0 }));
  await client.callTool({ name: "search_jobs", arguments: { region: ["East", "Islandwide"], districtIds: [16, 1] } });
  expect(lastCall(fetchMock).body).toEqual({ sessionId: "", districtIds: [16, 1, 17, 18, 998] });
});

it("suggestion tools hit the right endpoints", async () => {
  const { client, fetchMock } = await setup((url) => {
    switch (url.pathname) {
      case "/v2/skills/suggestions":
        return Response.json({ skills: [{ skill: "Python", uuid: "abc" }] });
      case "/v2/jobs/suggestions":
        return Response.json({ results: [searchJob], total: 1 });
      case "/popular-job-titles":
        return Response.json([{ icmsJobTitle: "Sales Manager", count: 5 }]);
      case "/in-demand-job-titles":
        return Response.json([{ jobTitle: "Nurse", count: 9 }]);
      default:
        return new Response("?", { status: 404 });
    }
  });

  const skills = await client.callTool({ name: "suggest_skills", arguments: { jobTitle: " chef " } });
  expect(lastCall(fetchMock).body).toEqual({ jobTitle: "chef" });
  expect(skills.structuredContent).toEqual({ skills: [{ skill: "Python", uuid: "abc" }] });

  const jobs = await client.callTool({ name: "suggest_jobs", arguments: { searchTerms: ["chef"] } });
  expect(lastCall(fetchMock).body).toEqual({ searchTerms: ["chef"] });
  expect(jobs.structuredContent).toMatchObject({ total: 1 });

  const none = await client.callTool({ name: "suggest_jobs", arguments: {} });
  expect(none.isError).toBe(true);

  const popular = await client.callTool({ name: "popular_job_titles", arguments: {} });
  expect(popular.structuredContent).toEqual({ titles: [{ title: "Sales Manager", count: 5 }] });
  expect(lastCall(fetchMock).init.method).toBe("GET");

  const demand = await client.callTool({ name: "in_demand_job_titles", arguments: {} });
  expect(demand.structuredContent).toEqual({ titles: [{ title: "Nurse", count: 9 }] });
});

it("never calls analytics or view-count endpoints", async () => {
  const { client, fetchMock } = await setup(() => Response.json(jobDetails));
  await client.callTool({ name: "get_job", arguments: { uuid: searchJob.uuid } });
  for (const [url] of fetchMock.mock.calls as Array<[string]>) {
    expect(url).not.toMatch(/increment-job-post-view-count|clickstream/);
  }
});
