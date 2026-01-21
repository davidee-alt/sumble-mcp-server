# Sumble MCP Server

An MCP (Model Context Protocol) server that provides Claude with access to the Sumble API for organization enrichment, people discovery, and job listings.

## Features

This MCP server exposes four tools:

| Tool | Description | Credit Cost |
|------|-------------|-------------|
| `find_organizations` | Find companies by technology stack, category, or query | 5 credits/filter/org |
| `enrich_organization` | Get detailed technology data for a specific company | 5 credits/technology |
| `find_jobs` | Search job listings by technology, location, or company | 3 credits/job |
| `find_people` | Find people at a company by role, level, or location | 1 credit/person |

## Prerequisites

- Node.js 18 or later
- A Sumble API key (get one at https://sumble.com/account/api-keys)

## Installation

```bash
# Clone or download this directory
cd sumble-mcp-server

# Install dependencies
npm install

# Build the TypeScript
npm run build
```

## Configuration

Set your Sumble API key as an environment variable:

```bash
export SUMBLE_API_KEY="your-api-key-here"
```

## Usage Options

### Option 1: Local Development (stdio)

For testing locally or use with Claude Desktop:

```bash
npm start
# or for development with hot reload
npm run dev
```

### Option 2: HTTP/SSE Server (for Claude.ai custom connector)

Run the HTTP server for remote deployment:

```bash
# Build first
npm run build

# Start the HTTP server
node dist/server-http.js

# Server starts on port 3000 by default
# Change with: PORT=8080 node dist/server-http.js
```

## Deploying for Claude.ai Custom Connector

To use this with Claude.ai's custom connector feature, you need to deploy the HTTP/SSE server to a publicly accessible URL.

### Deploy to Railway (Recommended)

1. Create a [Railway](https://railway.app) account
2. Create a new project from GitHub
3. Add environment variable: `SUMBLE_API_KEY`
4. Railway will auto-detect and deploy

### Deploy to Render

1. Create a [Render](https://render.com) account
2. Create a new Web Service
3. Connect your GitHub repo
4. Set build command: `npm install && npm run build`
5. Set start command: `node dist/server-http.js`
6. Add environment variable: `SUMBLE_API_KEY`

### Deploy to Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch (first time)
fly launch

# Set secret
fly secrets set SUMBLE_API_KEY="your-api-key"

# Deploy
fly deploy
```

### Deploy to Cloudflare Workers

See `cloudflare/` directory for a Workers-compatible version.

## Adding to Claude.ai

Once deployed:

1. Go to Claude.ai Settings → Connectors
2. Click "Add custom connector"
3. Fill in:
   - **Name**: `Sumble`
   - **Remote MCP server URL**: `https://your-deployment-url.com/sse`
   - Leave OAuth fields blank (API key is in the server)
4. Click "Add"

## Tool Examples

### Find Organizations Using Python

```json
{
  "technologies": ["python"],
  "limit": 10
}
```

### Enrich a Company's Tech Stack

```json
{
  "domain": "stripe.com",
  "technology_categories": ["Cloud Infrastructure"]
}
```

### Find Engineering Jobs

```json
{
  "technologies": ["react", "typescript"],
  "countries": ["US"],
  "limit": 20
}
```

### Find Executives at a Company

```json
{
  "domain": "anthropic.com",
  "job_levels": ["Executive", "C-Level"],
  "limit": 10
}
```

## Using with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "sumble": {
      "command": "node",
      "args": ["/path/to/sumble-mcp-server/dist/index.js"],
      "env": {
        "SUMBLE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## API Rate Limits

The Sumble API allows 10 requests per second. The MCP server respects these limits.

## Troubleshooting

### "SUMBLE_API_KEY environment variable is required"

Make sure you've set the environment variable:
```bash
export SUMBLE_API_KEY="your-key"
```

### Connection refused

Ensure the server is running and the port is accessible. For remote deployments, check your firewall/security group settings.

### 401 Unauthorized from Sumble API

Your API key may be invalid or expired. Generate a new one at https://sumble.com/account/api-keys

## License

MIT
