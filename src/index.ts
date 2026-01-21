import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// =============================================================================
// SUMBLE API CLIENT
// =============================================================================

const SUMBLE_API_BASE = "https://api.sumble.com";

interface SumbleClientConfig {
  apiKey: string;
}

class SumbleClient {
  private apiKey: string;

  constructor(config: SumbleClientConfig) {
    this.apiKey = config.apiKey;
  }

  private async request<T>(endpoint: string, body: object): Promise<T> {
    const response = await fetch(`${SUMBLE_API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Sumble API error (${response.status}): ${errorText}`
      );
    }

    return response.json() as Promise<T>;
  }

  // Find organizations matching filters
  async findOrganizations(params: {
    filters: {
      technologies?: string[];
      technology_categories?: string[];
      since?: string;
      query?: string;
    };
    order_by_column?: string;
    order_by_direction?: "ASC" | "DESC";
    limit?: number;
    offset?: number;
  }) {
    return this.request("/v3/organizations/find", params);
  }

  // Enrich an organization with technology data
  async enrichOrganization(params: {
    organization: { domain?: string; id?: number; slug?: string };
    filters: {
      technologies?: string[];
      technology_categories?: string[];
      since?: string;
      query?: string;
    };
  }) {
    return this.request("/v3/organizations/enrich", params);
  }

  // Find job listings
  async findJobs(params: {
    organization?: { domain?: string; id?: number; slug?: string };
    filters: {
      technologies?: string[];
      technology_categories?: string[];
      countries?: string[];
      since?: string;
      query?: string;
    };
    limit?: number;
    offset?: number;
  }) {
    return this.request("/v3/jobs/find", params);
  }

  // Find people at an organization
  async findPeople(params: {
    organization: { domain?: string; id?: number; slug?: string };
    filters: {
      job_functions?: string[];
      job_levels?: string[];
      countries?: string[];
      since?: string;
      query?: string;
    };
    limit?: number;
    offset?: number;
  }) {
    return this.request("/v3/people/find", params);
  }
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const TOOLS: Tool[] = [
  {
    name: "find_organizations",
    description: `Find organizations matching specific filters. Use this to discover companies based on their technology stack, industry, or other criteria.

Cost: 5 credits per filter per organization found (minimum 5 credits per org).

Examples:
- Find companies using Python
- Find companies in a specific technology category
- Search for organizations matching a query`,
    inputSchema: {
      type: "object",
      properties: {
        technologies: {
          type: "array",
          items: { type: "string" },
          description: "List of technologies to search for (e.g., ['python', 'react', 'aws'])",
        },
        technology_categories: {
          type: "array",
          items: { type: "string" },
          description: "List of technology categories to search for",
        },
        query: {
          type: "string",
          description: "Free-text query to search organizations",
        },
        since: {
          type: "string",
          description: "Only consider data since this date. Format: YYYY-MM-DD",
        },
        order_by_column: {
          type: "string",
          enum: [
            "industry",
            "employee_count",
            "employee_count_int",
            "first_activity_time",
            "last_activity_time",
            "jobs_count",
            "teams_count",
            "people_count",
            "jobs_count_growth_6mo",
            "cloud_spend_estimate_millions_usd",
          ],
          description: "Column to order results by",
        },
        order_by_direction: {
          type: "string",
          enum: ["ASC", "DESC"],
          description: "Sort direction",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          default: 10,
          description: "Maximum number of results to return (1-200)",
        },
        offset: {
          type: "integer",
          minimum: 0,
          maximum: 10000,
          default: 0,
          description: "Number of results to skip for pagination",
        },
      },
    },
  },
  {
    name: "enrich_organization",
    description: `Enrich a specific organization with technology data. Provide either a domain, Sumble ID, or slug to identify the organization.

Cost: 5 credits per technology found.

Use this to:
- Get detailed technology stack for a company
- Find what specific technologies a company uses
- Discover technology adoption details including job posts and team usage`,
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Company web domain (e.g., 'google.com')",
        },
        organization_id: {
          type: "integer",
          description: "Sumble organization ID",
        },
        slug: {
          type: "string",
          description: "Sumble organization slug",
        },
        technologies: {
          type: "array",
          items: { type: "string" },
          description: "Specific technologies to search for",
        },
        technology_categories: {
          type: "array",
          items: { type: "string" },
          description: "Technology categories to search for",
        },
        query: {
          type: "string",
          description: "Free-text query for technology search",
        },
        since: {
          type: "string",
          description: "Only consider data since this date. Format: YYYY-MM-DD",
        },
      },
      oneOf: [
        { required: ["domain"] },
        { required: ["organization_id"] },
        { required: ["slug"] },
      ],
    },
  },
  {
    name: "find_jobs",
    description: `Find job listings, optionally scoped to a specific organization. Search by technologies, categories, or countries.

Cost: 3 credits per job retrieved.

Use this to:
- Find job postings that mention specific technologies
- Discover hiring trends at companies
- Research job market for specific skills`,
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Company domain to scope the search (optional)",
        },
        organization_id: {
          type: "integer",
          description: "Sumble organization ID to scope the search (optional)",
        },
        slug: {
          type: "string",
          description: "Sumble organization slug to scope the search (optional)",
        },
        technologies: {
          type: "array",
          items: { type: "string" },
          description: "Technologies to search for in job postings",
        },
        technology_categories: {
          type: "array",
          items: { type: "string" },
          description: "Technology categories to search for",
        },
        countries: {
          type: "array",
          items: { type: "string" },
          description: "Countries to filter by (e.g., ['US', 'CA'])",
        },
        query: {
          type: "string",
          description: "Free-text query for job search",
        },
        since: {
          type: "string",
          description: "Only consider jobs since this date. Format: YYYY-MM-DD",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 10,
          description: "Maximum number of jobs to return (1-100)",
        },
        offset: {
          type: "integer",
          minimum: 0,
          maximum: 10000,
          default: 0,
          description: "Number of results to skip for pagination",
        },
      },
    },
  },
  {
    name: "find_people",
    description: `Find people at a specific organization. Filter by job function, job level, or country.

Cost: 1 credit per person found.

Use this to:
- Find decision-makers at a company
- Discover team members with specific roles
- Research organizational structure`,
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Company web domain (e.g., 'google.com')",
        },
        organization_id: {
          type: "integer",
          description: "Sumble organization ID",
        },
        slug: {
          type: "string",
          description: "Sumble organization slug",
        },
        job_functions: {
          type: "array",
          items: { type: "string" },
          description: "Job functions to filter by (e.g., ['Engineer', 'Executive'])",
        },
        job_levels: {
          type: "array",
          items: { type: "string" },
          description: "Job levels to filter by (e.g., ['Senior', 'Manager'])",
        },
        countries: {
          type: "array",
          items: { type: "string" },
          description: "Countries to filter by (e.g., ['US', 'CA'])",
        },
        query: {
          type: "string",
          description: "Free-text query for people search",
        },
        since: {
          type: "string",
          description: "Only consider data since this date. Format: YYYY-MM-DD",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 250,
          default: 10,
          description: "Maximum number of people to return (1-250)",
        },
        offset: {
          type: "integer",
          minimum: 0,
          maximum: 10000,
          default: 0,
          description: "Number of results to skip for pagination",
        },
      },
      oneOf: [
        { required: ["domain"] },
        { required: ["organization_id"] },
        { required: ["slug"] },
      ],
    },
  },
];

// =============================================================================
// TOOL HANDLERS
// =============================================================================

async function handleToolCall(
  client: SumbleClient,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case "find_organizations": {
      const filters: Record<string, unknown> = {};
      
      if (args.technologies) filters.technologies = args.technologies;
      if (args.technology_categories) filters.technology_categories = args.technology_categories;
      if (args.since) filters.since = args.since;
      if (args.query) filters.query = args.query;

      const result = await client.findOrganizations({
        filters: Object.keys(filters).length > 0 ? filters : { technologies: [] },
        order_by_column: args.order_by_column as string | undefined,
        order_by_direction: args.order_by_direction as "ASC" | "DESC" | undefined,
        limit: (args.limit as number) || 10,
        offset: (args.offset as number) || 0,
      });

      return JSON.stringify(result, null, 2);
    }

    case "enrich_organization": {
      // Build organization identifier
      const organization: Record<string, unknown> = {};
      if (args.domain) organization.domain = args.domain;
      else if (args.organization_id) organization.id = args.organization_id;
      else if (args.slug) organization.slug = args.slug;
      else throw new Error("Must provide domain, organization_id, or slug");

      // Build filters
      const filters: Record<string, unknown> = {};
      if (args.technologies) filters.technologies = args.technologies;
      if (args.technology_categories) filters.technology_categories = args.technology_categories;
      if (args.since) filters.since = args.since;
      if (args.query) filters.query = args.query;

      const result = await client.enrichOrganization({
        organization,
        filters: Object.keys(filters).length > 0 ? filters : { technologies: [] },
      });

      return JSON.stringify(result, null, 2);
    }

    case "find_jobs": {
      // Build organization identifier (optional for jobs)
      let organization: Record<string, unknown> | undefined;
      if (args.domain) organization = { domain: args.domain };
      else if (args.organization_id) organization = { id: args.organization_id };
      else if (args.slug) organization = { slug: args.slug };

      // Build filters
      const filters: Record<string, unknown> = {};
      if (args.technologies) filters.technologies = args.technologies;
      if (args.technology_categories) filters.technology_categories = args.technology_categories;
      if (args.countries) filters.countries = args.countries;
      if (args.since) filters.since = args.since;
      if (args.query) filters.query = args.query;

      const result = await client.findJobs({
        organization,
        filters: Object.keys(filters).length > 0 ? filters : { technologies: [] },
        limit: (args.limit as number) || 10,
        offset: (args.offset as number) || 0,
      });

      return JSON.stringify(result, null, 2);
    }

    case "find_people": {
      // Build organization identifier
      const organization: Record<string, unknown> = {};
      if (args.domain) organization.domain = args.domain;
      else if (args.organization_id) organization.id = args.organization_id;
      else if (args.slug) organization.slug = args.slug;
      else throw new Error("Must provide domain, organization_id, or slug");

      // Build filters
      const filters: Record<string, unknown> = {};
      if (args.job_functions) filters.job_functions = args.job_functions;
      if (args.job_levels) filters.job_levels = args.job_levels;
      if (args.countries) filters.countries = args.countries;
      if (args.since) filters.since = args.since;
      if (args.query) filters.query = args.query;

      const result = await client.findPeople({
        organization,
        filters: Object.keys(filters).length > 0 ? filters : {},
        limit: (args.limit as number) || 10,
        offset: (args.offset as number) || 0,
      });

      return JSON.stringify(result, null, 2);
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// =============================================================================
// MAIN SERVER
// =============================================================================

async function main() {
  // Get API key from environment
  const apiKey = process.env.SUMBLE_API_KEY;
  if (!apiKey) {
    console.error("Error: SUMBLE_API_KEY environment variable is required");
    process.exit(1);
  }

  const client = new SumbleClient({ apiKey });

  // Create the MCP server
  const server = new Server(
    {
      name: "sumble-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleToolCall(client, name, args as Record<string, unknown>);
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Sumble MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
