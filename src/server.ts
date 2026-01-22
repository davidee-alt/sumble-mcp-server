import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

const SUMBLE_API_KEY = process.env.SUMBLE_API_KEY;
if (!SUMBLE_API_KEY) {
  console.error("Error: SUMBLE_API_KEY environment variable is required");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || "10000");
const SUMBLE_BASE_URL = "https://api.sumble.com";

async function sumbleRequest(endpoint: string, body: any): Promise<any> {
  const url = `${SUMBLE_BASE_URL}${endpoint}`;
  console.log(`[Sumble API] POST ${url}`);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUMBLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sumble API error: ${response.status} ${errorText}`);
  }
  return response.json();
}

const server = new McpServer({ name: "sumble-mcp-server", version: "1.0.0" });

server.tool(
  "enrich_organization",
  "Get detailed tech stack for a company domain. Costs 5 credits/technology.",
  { domain: z.string(), technologies: z.array(z.string()).optional() },
  async ({ domain, technologies }) => {
    try {
      const techFilter = technologies?.length ? technologies : ["python", "javascript", "typescript", "react", "node.js", "aws", "docker", "kubernetes"];
      const result = await sumbleRequest("/v3/organizations/enrich", {
        organization: { domain },
        filters: { technologies: techFilter },
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "find_organizations",
  "Search for organizations by technology stack, industry, location.",
  { technologies: z.array(z.string()).optional(), industries: z.array(z.string()).optional(), countries: z.array(z.string()).optional(), limit: z.number().optional().default(10) },
  async ({ technologies, industries, countries, limit }) => {
    try {
      const filters: any = {};
      if (technologies?.length) filters.technologies = technologies;
      if (industries?.length) filters.industries = industries;
      if (countries?.length) filters.countries = countries;
      const result = await sumbleRequest("/v3/organizations/find", { filters, limit: limit || 10 });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "find_people",
  "Search for contacts at companies. Costs 1 credit/person.",
  { organization_domain: z.string(), job_titles: z.array(z.string()).optional(), countries: z.array(z.string()).optional(), limit: z.number().optional().default(10) },
  async ({ organization_domain, job_titles, countries, limit }) => {
    try {
      const filters: any = {};
      if (job_titles?.length) filters.job_titles = job_titles;
      if (countries?.length) filters.countries = countries;
      const result = await sumbleRequest("/v3/people/find", { organization: { domain: organization_domain }, filters, limit: limit || 10 });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }
);

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});

const transports: Record<string, SSEServerTransport> = {};

app.get("/", (req, res) => res.json({ status: "ok" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/sse", async (req, res) => {
  console.log("[SSE] New connection");
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  res.on("close", () => { delete transports[transport.sessionId]; });
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];
  if (!transport) { res.status(400).json({ error: "Invalid session" }); return; }
  await transport.handlePostMessage(req, res, req.body);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
