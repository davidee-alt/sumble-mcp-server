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
  console.log(`Sumble API request: ${method} ${url}`);
  if (body) console.log(`Request body: ${JSON.stringify(body)}`);
  
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sumble API error: ${response.status} ${errorText}`);
  }
  return response.json();
}

const PORT = parseInt(process.env.PORT || "10000");

interface SSEClient {
  id: string;
  res: http.ServerResponse;
}

const clients = new Map<string, SSEClient>();

const httpServer = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (url.pathname === "/" || url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", server: "sumble-mcp-server" }));
    return;
  }

  if (url.pathname === "/sse" && req.method === "GET") {
    const clientId = Math.random().toString(36).substring(2, 10);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "sumble-mcp-server.onrender.com";
    const baseUrl = `${proto}://${host}`;

    const messageEndpoint = `${baseUrl}/message?sessionId=${clientId}`;
    res.write(`event: endpoint\ndata: ${messageEndpoint}\n\n`);

    clients.set(clientId, { id: clientId, res });
    console.log(`New SSE connection: ${clientId}`);

    const keepAlive = setInterval(() => {
      if (clients.has(clientId)) {
        res.write(`:keepalive\n\n`);
      } else {
        clearInterval(keepAlive);
      }
    }, 5000);

    req.on("close", () => {
      clients.delete(clientId);
      clearInterval(keepAlive);
      console.log(`SSE connection closed: ${clientId}`);
    });

    return;
  }

  if (url.pathname === "/message" && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId || !clients.has(sessionId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or expired session" }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => { body += chunk; });

    req.on("end", async () => {
      try {
        const message = JSON.parse(body);
        const client = clients.get(sessionId);
        console.log(`Received message: ${message.method}`);

        let response: any;

        if (message.method === "initialize") {
          response = {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "sumble-mcp-server", version: "1.0.0" },
            },
          };
        } else if (message.method === "tools/list") {
          const tools = [
            { name: "find_organizations", description: "Search for organizations by technology stack, industry, location. Costs 5 credits/filter/org.", inputSchema: { type: "object", properties: { technologies: { type: "array", items: { type: "string" }, description: "Technologies to filter by" }, industries: { type: "array", items: { type: "string" }, description: "Industries to filter by" }, countries: { type: "array", items: { type: "string" }, description: "Countries to filter by" }, employee_range: { type: "string", description: "Employee range like '1-10', '11-50'" }, limit: { type: "number", description: "Max results", default: 10 } } } },
            { name: "enrich_organization", description: "Get detailed tech stack for a company domain. Costs 5 credits/technology.", inputSchema: { type: "object", properties: { domain: { type: "string", description: "Company domain (e.g., 'example.com')" } }, required: ["domain"] } },
            { name: "find_jobs", description: "Search job listings. Costs 3 credits/job.", inputSchema: { type: "object", properties: { keywords: { type: "string", description: "Search keywords" }, technologies: { type: "array", items: { type: "string" }, description: "Technologies" }, countries: { type: "array", items: { type: "string" }, description: "Countries" }, remote: { type: "boolean", description: "Remote only" }, limit: { type: "number", description: "Max results", default: 10 } } } },
            { name: "find_people", description: "Search for contacts at companies. Costs 1 credit/person.", inputSchema: { type: "object", properties: { organization_domain: { type: "string", description: "Company domain" }, job_titles: { type: "array", items: { type: "string" }, description: "Job titles" }, countries: { type: "array", items: { type: "string" }, description: "Countries" }, limit: { type: "number", description: "Max results", default: 10 } } } },
          ];
          response = { jsonrpc: "2.0", id: message.id, result: { tools } };
        } else if (message.method === "tools/call") {
          const toolName = message.params?.name;
          const args = message.params?.arguments || {};
          console.log(`Executing tool: ${toolName} with args: ${JSON.stringify(args)}`);

          try {
            let result;
            if (toolName === "find_organizations") {
              // v2 endpoint for finding organizations
              result = await sumbleRequest("/v2/organizations/find", "POST", {
                filters: {
                  technologies: args.technologies || [],
                  industries: args.industries || [],
                  countries: args.countries || [],
                },
                limit: args.limit || 10,
              });
            } else if (toolName === "enrich_organization") {
              // v2 endpoint for enriching - requires POST with nested structure
              result = await sumbleRequest("/v2/organizations/enrich", "POST", {
                organization: { domain: args.domain },
                filters: {},
              });
            } else if (toolName === "find_jobs") {
              // v2 endpoint for jobs
              result = await sumbleRequest("/v2/jobs/find", "POST", {
                filters: {
                  technologies: args.technologies || [],
                  countries: args.countries || [],
                  keywords: args.keywords ? [args.keywords] : [],
                },
                limit: args.limit || 10,
              });
            } else if (toolName === "find_people") {
              // v3 endpoint for people
              result = await sumbleRequest("/v3/people/find", "POST", {
                organization: { domain: args.organization_domain },
                filters: {
                  job_titles: args.job_titles || [],
                  countries: args.countries || [],
                },
                limit: args.limit || 10,
              });
            } else {
              throw new Error(`Unknown tool: ${toolName}`);
            }
            console.log(`Tool ${toolName} completed successfully`);
            response = { jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } };
          } catch (err: any) {
            console.error(`Tool ${toolName} failed:`, err.message);
            response = { jsonrpc: "2.0", id: message.id, error: { code: -32000, message: err.message } };
          }
        } else if (message.method === "notifications/initialized") {
          res.writeHead(202, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "accepted" }));
          return;
        } else {
          response = { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } };
        }

        if (response) {
          client?.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
          console.log(`Sending response for message id: ${message.id}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
        }
      } catch (err: any) {
        console.error("Error processing message:", err);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

httpServer.listen(PORT, () => {
  console.log(`Sumble MCP Server running on port ${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
});
