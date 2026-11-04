import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";
import { createServer } from "./server.js";

it("lists the tools, resources and annotations", async () => {
  const server = createServer();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual([
    "get_job",
    "in_demand_job_titles",
    "list_employment_types",
    "popular_job_titles",
    "search_jobs",
    "suggest_jobs",
    "suggest_skills",
  ]);
  for (const tool of tools) {
    // list_employment_types is a static table, so it does not touch the open world.
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: tool.name !== "list_employment_types",
    });
    expect(tool.outputSchema).toBeDefined();
  }

  const { resources } = await client.listResources();
  expect(resources.map((r) => r.uri).sort()).toEqual(["careersfuture://about", "careersfuture://filters"]);
  const about = await client.readResource({ uri: "careersfuture://about" });
  expect(JSON.stringify(about.contents)).toContain("search_jobs");

  expect((await client.listPrompts().catch(() => ({ prompts: [] }))).prompts).toEqual([]);

  await client.close();
  await server.close();
});
