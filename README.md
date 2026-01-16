# Brinqa MCP Server

An MCP (Model Context Protocol) server for the Brinqa Cyber Risk Analytics and Vulnerability Risk Management platform.

## Overview

This MCP server provides tools to interact with the Brinqa Platform API, enabling you to query assets, vulnerabilities, findings, risk scores, tickets, and more directly from Claude or other MCP-compatible clients.

## Authentication

The Brinqa Platform API supports two authentication methods:

### Option 1: Username/Password (Bearer Token)
Set the following environment variables:
- `BRINQA_API_URL`: Your Brinqa platform URL (e.g., `https://your-instance.brinqa.net`)
- `BRINQA_USERNAME`: Your Brinqa username
- `BRINQA_PASSWORD`: Your Brinqa password

The server will automatically obtain and refresh bearer tokens (valid for 24 hours).

### Option 2: API Key (Brinqa Connect)
For Brinqa Connect API access:
- `BRINQA_API_URL`: Your Brinqa platform URL
- `BRINQA_API_KEY`: Your Brinqa API key

## Available Tools

### query_assets
Query assets from Brinqa (hosts, applications, containers, cloud resources).
- Filter by asset type, status, criticality
- Custom field selection
- Support for Brinqa query syntax

### query_vulnerabilities
Query vulnerabilities and CVEs with risk scores and remediation status.
- Filter by severity (CRITICAL, HIGH, MEDIUM, LOW, INFO)
- Filter by status (OPEN, CLOSED, REMEDIATED, ACCEPTED)
- Search by CVE ID
- Include affected assets

### query_findings
Query security findings (specific vulnerability instances on assets).
- Filter by finding type, status, risk score range
- Filter by age (days since discovery)

### get_risk_scores
Retrieve risk analytics and scores.
- Organization-level or asset-level risk
- Risk factor breakdown
- Historical risk trends

### query_tickets
Query remediation tickets.
- Filter by status, priority, assignee
- SLA status tracking

### get_connectors
View data connector status and sync history.
- Filter by connector type or status
- View sync history

### execute_graphql
Execute custom GraphQL queries for advanced use cases.

### get_clusters
Query automated data clusters based on asset/vulnerability attributes.

### connect_ingest_data
Ingest custom data via Brinqa Connect API.

### get_data_models
Explore Brinqa data models, attributes, and relationships.

## Installation

```bash
npm install
npm run build
```

## Configuration

Add to your Claude configuration (`~/.claude/.claude.json`):

```json
{
  "mcpServers": {
    "brinqa": {
      "command": "node",
      "args": ["/path/to/brinqa-mcp/dist/index.js"],
      "env": {
        "BRINQA_API_URL": "https://your-instance.brinqa.net",
        "BRINQA_USERNAME": "your-username",
        "BRINQA_PASSWORD": "your-password"
      }
    }
  }
}
```

## API Limitations

- GraphQL queries are designed for < 5,000 results
- Typical queries should return 100-200 entries
- For bulk exports, use Brinqa Connect

## References

- [Brinqa Platform API Documentation](https://docs.brinqa.com/docs/brinqa-api/)
- [Brinqa Connect API](https://docs.brinqa.com/docs/connectors/brinqa-connect/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
