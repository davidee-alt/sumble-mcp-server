import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import http from "http";

const SUMBLE_API_KEY = process.env.SUMBLE_API_KEY;
if (!SUMBLE_API_KEY) {
  console.error("Error: SUMBLE_API_KEY environment variable is required");
  process.exit(1);
}

const BASE_URL = "https://api.sumble.com";

async function sumbleRequest(endpoint: string, method: string = "GET", body?: any) {
  const url = `${BASE_URL}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      "Authorization": `Bearer ${SUMBLE_API_KEY}`,
      "Content-Type": "application/json",
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sumble API error: ${response.status} ${errorText}`);
  }
  return response.json();
}

// Create MCP server
const server = new McpServer({
  name: "sumble-mcp-server",
  version: "1.0.0",
});

// Register tools
server.tool(
  "find_organizations",
  "Search for organizations by technology stack, industry, location, and other criteria. Costs 5 credits per filter per organization returned.",
  {
    technologies: z.array(z.string()).optional().describe("Filter by technologies used"),
    industries: z.array(z.string()).optional().describe("Filter by industries"),
    countries: z.array(z.string()).optional().describe("Filter by countries"),
    employee_range: z.string().optional().describe("Employee range like '1-10', '11-50', '51-200'"),
    limit: z.number().optional().default(10).describe("Maximum results to return"),
    offset: z.number().optional().default(0).describe("Offset for pagination"),
  },
  async (params) => {
    const result = await sumbleRequest("/v1/organizations/search", "POST", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "enrich_organization",
  "Get detailed technology stack and company information for a specific organization. Costs 5 credits per technology returned.",
  {
    domain: z.string().describe("Company domain to enrich (e.g., 'example.com')"),
  },
  async (params) => {
    const result = await sumbleRequest(`/v1/organizations/enrich?domain=${encodeURIComponent(params.domain)}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "find_jobs",
  "Search for job listings. Costs 3 credits per job returned.",
  {
    keywords: z.string().optional().describe("Keywords to search for"),
    technologies: z.array(z.string()).optional().describe("Filter by technologies"),
    countries: z.array(z.string()).optional().describe("Filter by countries"),
    remote: z.boolean().optional().describe("Filter for remote jobs"),
    limit: z.number().optional().default(10).describe("Maximum results"),
    offset: z.number().optional().default(0).describe("Offset for pagination"),
  },
  async (params) => {
    const result = await sumbleRequest("/v1/jobs/search", "POST", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "find_people",
  "Search for people/contacts at companies. Costs 1 credit per person returned.",
  {
    organization_domain: z.string().optional().describe("Filter by company domain"),
    job_titles: z.array(z.string()).optional().describe("Filter by job titles"),
    countries: z.array(z.string()).optional().describe("Filter by countries"),
    limit: z.number().optional().default(10).describe("Maximum results"),
    offset: z.number().optional().default(0).describe("Offset for pagination"),
  },
  async (params) => {
    const result = await sumbleRequest("/v1/people/search", "POST", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Simple HTTP server with SSE support
const PORT = parseInt(process.env.PORT || "3000");

interface SSEClient {
  id: string;
  res: http.ServerResponse;
}

const clients = new Map<string, SSEClient>();

const httpServer = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === "/" || url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", server: "sumble-mcp-server" }));
    return;
  }

  // SSE endpoint
  if (url.pathname === "/sse" && req.method === "GET") {
    const clientId = Math.random().toString(36).substring(7);
    
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // Send endpoint info
    const endpoint = `${url.protocol}//${req.headers.host}/message?sessionId=${clientId}`;
    res.write(`event: endpoint\ndata: ${endpoint}\n\n`);

    clients.set(clientId, { id: clientId, res });
    console.log(`New SSE connection: ${clientId}`);

    req.on("close", () => {
      clients.delete(clientId);
      console.log(`SSE connection closed: ${clientId}`);
    });

    // Keep alive
    const keepAlive = setInterval(() => {
      if (clients.has(clientId)) {
        res.write(": keepalive\n\n");
      } else {
        clearInterval(keepAlive);
      }
    }, 30000);

    return;
  }

  // Message endpoint
  if (url.pathname === "/message" && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    
    if (!sessionId || !clients.has(sessionId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid session" }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const message = JSON.parse(body);
        const client = clients.get(sessionId);

        // Handle MCP messages
        if (message.method === "initialize") {
          const response = {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "sumble-mcp-server", version: "1.0.0" },
            },
          };
          client?.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
          res.writeHead(202);
          res.end();
        } else if (message.method === "tools/list") {
          const tools = [
            {
              name: "find_organizations",
              description: "Search for organizations by technology stack, industry, location. Costs 5 credits/filter/org.",
              inputSchema: {
                type: "object",
                properties: {
                  technologies: { type: "array", items: { type: "string" }, description: "Technologies to filter by" },
                  industries: { type: "array", items: { type: "string" }, description: "Industries to filter by" },
                  countries: { type: "array", items: { type: "string" }, description: "Countries to filter by" },
                  employee_range: { type: "string", description: "Employee range like '1-10', '11-50'" },
                  limit: { type: "number", description: "Max results", default: 10 },
                },
              },
            },
            {
              name: "enrich_organization",
              description: "Get detailed tech stack for a company domain. Costs 5 credits/technology.",
              inputSchema: {
                type: "object",
                properties: {
                  domain: { type: "string", description: "Company domain (e.g., 'example.com')" },
                },
                required: ["domain"],
              },
            },
            {
              name: "find_jobs",
              description: "Search job listings. Costs 3 credits/job.",
              inputSchema: {
                type: "object",
                properties: {
                  keywords: { type: "string", description: "Search keywords" },
                  technologies: { type: "array", items: { type: "string" }, description: "Technologies" },
                  countries: { type: "array", items: { type: "string" }, description: "Countries" },
                  remote: { type: "boolean", description: "Remote only" },
                  limit: { type: "number", description: "Max results", default: 10 },
                },
              },
            },
            {
              name: "find_people",
              description: "Search for contacts at companies. Costs 1 credit/person.",
              inputSchema: {
                type: "object",
                properties: {
                  organization_domain: { type: "string", description: "Company domain" },
                  job_titles: { type: "array", items: { type: "string" }, description: "Job titles" },
                  countries: { type: "array", items: { type: "string" }, description: "Countries" },
                  limit: { type: "number", description: "Max results", default: 10 },
                },
              },
            },
          ];
          const response = { jsonrpc: "2.0", id: message.id, result: { tools } };
          client?.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
          res.writeHead(202);
          res.end();
        } else if (message.method === "tools/call") {
          const toolName = message.params?.name;
          const args = message.params?.arguments || {};
          
          try {
            let result;
            if (toolName === "find_organizations") {
              result = await sumbleRequest("/v1/organizations/search", "POST", args);
            } else if (toolName === "enrich_organization") {
              result = await sumbleRequest(`/v1/organizations/enrich?domain=${encodeURIComponent(args.domain)}`);
            } else if (toolName === "find_jobs") {
              result = await sumbleRequest("/v1/jobs/search", "POST", args);
            } else if (toolName === "find_people") {
              result = await sumbleRequest("/v1/people/search", "POST", args);
            } else {
              throw new Error(`Unknown tool: ${toolName}`);
            }
            
            const response = {
              jsonrpc: "2.0",
              id: message.id,
              result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
            };
            client?.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
          } catch (err: any) {
            const response = {
              jsonrpc: "2.0",
              id: message.id,
              error: { code: -32000, message: err.message },
            };
            client?.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
          }
          res.writeHead(202);
          res.end();
        } else if (message.method === "notifications/initialized") {
          res.writeHead(202);
          res.end();
        } else {
          const response = {
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32601, message: "Method not found" },
          };
          client?.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
          res.writeHead(202);
          res.end();
        }
      } catch (err: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

httpServer.listen(PORT, () => {
  console.log(`Sumble MCP Server running on port ${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
});
