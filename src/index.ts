#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";

// Environment variables
const BRINQA_API_URL = process.env.BRINQA_API_URL || "";
const BRINQA_USERNAME = process.env.BRINQA_USERNAME || "";
const BRINQA_PASSWORD = process.env.BRINQA_PASSWORD || "";
const BRINQA_API_KEY = process.env.BRINQA_API_KEY || "";

interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

class BrinqaClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private axiosInstance: AxiosInstance;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
  }

  private async authenticate(): Promise<void> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return;
    }

    // If API key is provided, use it directly (for Brinqa Connect)
    if (BRINQA_API_KEY) {
      this.accessToken = BRINQA_API_KEY;
      this.tokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      return;
    }

    // Otherwise, authenticate with username/password
    if (!BRINQA_USERNAME || !BRINQA_PASSWORD) {
      throw new Error(
        "Authentication credentials not configured. Set BRINQA_USERNAME and BRINQA_PASSWORD or BRINQA_API_KEY."
      );
    }

    try {
      const response = await this.axiosInstance.post<AuthResponse>(
        "/api/auth/login",
        {
          username: BRINQA_USERNAME,
          password: BRINQA_PASSWORD,
        }
      );

      this.accessToken = response.data.access_token;
      // Token is valid for 24 hours (86400 seconds), refresh 5 minutes before expiry
      this.tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Authentication failed: ${error.response?.data?.message || error.message}`
        );
      }
      throw error;
    }
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    await this.authenticate();
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async executeGraphQL<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const headers = await this.getAuthHeaders();

    try {
      const response = await this.axiosInstance.post<GraphQLResponse<T>>(
        "/graphql/caasm",
        {
          query,
          variables,
        },
        { headers }
      );

      if (response.data.errors && response.data.errors.length > 0) {
        const errorMessages = response.data.errors
          .map((e) => e.message)
          .join("; ");
        throw new Error(`GraphQL errors: ${errorMessages}`);
      }

      if (!response.data.data) {
        throw new Error("No data returned from GraphQL query");
      }

      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401) {
          // Token expired, clear it and retry
          this.accessToken = null;
          this.tokenExpiry = 0;
          return this.executeGraphQL<T>(query, variables);
        }
        throw new Error(
          `GraphQL request failed: ${error.response?.data?.message || error.message}`
        );
      }
      throw error;
    }
  }

  async connectApiRequest(
    method: "GET" | "POST" | "PUT" | "DELETE",
    endpoint: string,
    data?: unknown
  ): Promise<unknown> {
    const headers = await this.getAuthHeaders();

    // For Brinqa Connect, use X-API-KEY if available
    if (BRINQA_API_KEY) {
      headers["X-API-KEY"] = BRINQA_API_KEY;
    }

    try {
      const response = await this.axiosInstance.request({
        method,
        url: `/connect${endpoint}`,
        headers,
        data,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Brinqa Connect API request failed: ${error.response?.data?.message || error.message}`
        );
      }
      throw error;
    }
  }
}

// Tool definitions
const tools: Tool[] = [
  {
    name: "query_assets",
    description:
      "Query assets from Brinqa using GraphQL. Retrieve information about hosts, applications, containers, cloud resources, and other asset types. Supports filtering by asset type, status, criticality, and custom attributes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        asset_type: {
          type: "string",
          description:
            "Type of assets to query (e.g., Host, Application, Container, CloudResource). Leave empty for all types.",
        },
        status: {
          type: "string",
          enum: ["ACTIVE", "INACTIVE", "DELETED"],
          description: "Filter by asset status. Default is ACTIVE.",
        },
        limit: {
          type: "number",
          description:
            "Maximum number of results to return (default: 100, max: 1000)",
        },
        filter: {
          type: "string",
          description:
            "Additional filter expression in Brinqa query syntax (e.g., 'criticality = \"HIGH\"')",
        },
        fields: {
          type: "array",
          items: { type: "string" },
          description:
            "Specific fields to return (e.g., ['name', 'ipAddress', 'criticality'])",
        },
      },
      required: [],
    },
  },
  {
    name: "query_vulnerabilities",
    description:
      "Query vulnerabilities and findings from Brinqa. Retrieve CVEs, security findings, and vulnerability details with risk scores, affected assets, and remediation status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        severity: {
          type: "string",
          enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
          description: "Filter by vulnerability severity",
        },
        status: {
          type: "string",
          enum: ["OPEN", "CLOSED", "REMEDIATED", "ACCEPTED"],
          description: "Filter by vulnerability status",
        },
        cve_id: {
          type: "string",
          description:
            "Search for a specific CVE ID (e.g., CVE-2023-12345)",
        },
        limit: {
          type: "number",
          description:
            "Maximum number of results to return (default: 100, max: 1000)",
        },
        filter: {
          type: "string",
          description:
            "Additional filter expression in Brinqa query syntax",
        },
        include_affected_assets: {
          type: "boolean",
          description: "Include affected asset information in results",
        },
      },
      required: [],
    },
  },
  {
    name: "query_findings",
    description:
      "Query security findings from Brinqa. Findings represent specific instances of vulnerabilities or security issues discovered on assets.",
    inputSchema: {
      type: "object" as const,
      properties: {
        finding_type: {
          type: "string",
          description:
            "Type of finding (e.g., VulnerabilityFinding, ComplianceFinding, ConfigurationFinding)",
        },
        status: {
          type: "string",
          enum: ["NEW", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
          description: "Filter by finding status",
        },
        risk_score_min: {
          type: "number",
          description: "Minimum risk score (0-100)",
        },
        risk_score_max: {
          type: "number",
          description: "Maximum risk score (0-100)",
        },
        limit: {
          type: "number",
          description:
            "Maximum number of results to return (default: 100, max: 1000)",
        },
        age_days: {
          type: "number",
          description: "Filter findings discovered within the last N days",
        },
      },
      required: [],
    },
  },
  {
    name: "get_risk_scores",
    description:
      "Get risk scores and risk analytics from Brinqa. Retrieve overall risk posture, asset risk scores, and risk trends.",
    inputSchema: {
      type: "object" as const,
      properties: {
        scope: {
          type: "string",
          enum: ["ORGANIZATION", "ASSET", "APPLICATION", "BUSINESS_UNIT"],
          description: "Scope of risk scores to retrieve",
        },
        entity_id: {
          type: "string",
          description:
            "Specific entity ID to get risk score for (required for ASSET, APPLICATION scopes)",
        },
        include_factors: {
          type: "boolean",
          description: "Include risk factor breakdown in results",
        },
        include_trends: {
          type: "boolean",
          description: "Include historical risk trend data",
        },
      },
      required: [],
    },
  },
  {
    name: "query_tickets",
    description:
      "Query remediation tickets from Brinqa. Tickets track the remediation workflow for vulnerabilities and findings.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"],
          description: "Filter by ticket status",
        },
        priority: {
          type: "string",
          enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
          description: "Filter by ticket priority",
        },
        assignee: {
          type: "string",
          description: "Filter by assignee username or ID",
        },
        sla_status: {
          type: "string",
          enum: ["WITHIN_SLA", "AT_RISK", "BREACHED"],
          description: "Filter by SLA status",
        },
        limit: {
          type: "number",
          description:
            "Maximum number of results to return (default: 100, max: 1000)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_connectors",
    description:
      "Get information about data connectors configured in Brinqa. View connector status, last sync times, and data source configurations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        connector_type: {
          type: "string",
          description:
            "Filter by connector type (e.g., Qualys, Tenable, Rapid7)",
        },
        status: {
          type: "string",
          enum: ["ACTIVE", "INACTIVE", "ERROR", "SYNCING"],
          description: "Filter by connector status",
        },
        include_sync_history: {
          type: "boolean",
          description: "Include recent sync history",
        },
      },
      required: [],
    },
  },
  {
    name: "execute_graphql",
    description:
      "Execute a custom GraphQL query against the Brinqa Platform API. Use this for advanced queries not covered by other tools. The Brinqa API uses GraphQL for flexible data retrieval.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The GraphQL query to execute",
        },
        variables: {
          type: "object",
          description: "Variables to pass to the GraphQL query",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_clusters",
    description:
      "Get cluster information from Brinqa. Clusters are automated groupings of data based on attributes such as asset type, vulnerability type, operating system, or compliance status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cluster_type: {
          type: "string",
          description:
            "Type of cluster (e.g., AssetCluster, VulnerabilityCluster)",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return",
        },
      },
      required: [],
    },
  },
  {
    name: "connect_ingest_data",
    description:
      "Ingest custom data into Brinqa using the Brinqa Connect API. Use this to send custom, unstructured data to the Brinqa Platform when standard connectors are not available.",
    inputSchema: {
      type: "object" as const,
      properties: {
        namespace: {
          type: "string",
          description:
            "Namespace qualifier for the data (e.g., 'development', 'production', 'global')",
        },
        data_type: {
          type: "string",
          description: "Type of data being ingested (e.g., 'asset', 'finding')",
        },
        records: {
          type: "array",
          items: { type: "object" },
          description: "Array of records to ingest",
        },
      },
      required: ["namespace", "data_type", "records"],
    },
  },
  {
    name: "get_data_models",
    description:
      "Get information about Brinqa data models. View available entity types, attributes, and relationships in the Brinqa knowledge graph.",
    inputSchema: {
      type: "object" as const,
      properties: {
        model_name: {
          type: "string",
          description:
            "Specific model name to retrieve (e.g., 'Host', 'Vulnerability', 'Finding')",
        },
        include_attributes: {
          type: "boolean",
          description: "Include attribute definitions",
        },
        include_relationships: {
          type: "boolean",
          description: "Include relationship definitions",
        },
      },
      required: [],
    },
  },
];

// GraphQL query builders
function buildAssetsQuery(params: {
  asset_type?: string;
  status?: string;
  limit?: number;
  filter?: string;
  fields?: string[];
}): string {
  const limit = Math.min(params.limit || 100, 1000);
  const fields =
    params.fields?.join("\n        ") ||
    `id
        name
        assetType
        status
        criticality
        riskScore
        ipAddress
        hostname
        operatingSystem
        lastSeen
        discoveredAt
        owner
        businessUnit
        environment
        tags`;

  const filters: string[] = [];
  if (params.asset_type) {
    filters.push(`assetType: "${params.asset_type}"`);
  }
  if (params.status) {
    filters.push(`status: ${params.status}`);
  }
  if (params.filter) {
    filters.push(`filter: "${params.filter}"`);
  }

  const filterStr = filters.length > 0 ? `(${filters.join(", ")})` : "";

  return `
    query GetAssets {
      assets${filterStr} {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes(first: ${limit}) {
          ${fields}
        }
      }
    }
  `;
}

function buildVulnerabilitiesQuery(params: {
  severity?: string;
  status?: string;
  cve_id?: string;
  limit?: number;
  filter?: string;
  include_affected_assets?: boolean;
}): string {
  const limit = Math.min(params.limit || 100, 1000);
  const affectedAssetsFields = params.include_affected_assets
    ? `affectedAssets {
            id
            name
            assetType
          }`
    : "";

  const filters: string[] = [];
  if (params.severity) {
    filters.push(`severity: ${params.severity}`);
  }
  if (params.status) {
    filters.push(`status: ${params.status}`);
  }
  if (params.cve_id) {
    filters.push(`cveId: "${params.cve_id}"`);
  }
  if (params.filter) {
    filters.push(`filter: "${params.filter}"`);
  }

  const filterStr = filters.length > 0 ? `(${filters.join(", ")})` : "";

  return `
    query GetVulnerabilities {
      vulnerabilities${filterStr} {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes(first: ${limit}) {
          id
          cveId
          title
          description
          severity
          cvssScore
          cvssVector
          status
          riskScore
          exploitAvailable
          exploitMaturity
          patchAvailable
          publishedDate
          lastModifiedDate
          firstDiscoveredDate
          affectedAssetCount
          ${affectedAssetsFields}
          references
          remediation
        }
      }
    }
  `;
}

function buildFindingsQuery(params: {
  finding_type?: string;
  status?: string;
  risk_score_min?: number;
  risk_score_max?: number;
  limit?: number;
  age_days?: number;
}): string {
  const limit = Math.min(params.limit || 100, 1000);

  const filters: string[] = [];
  if (params.finding_type) {
    filters.push(`findingType: "${params.finding_type}"`);
  }
  if (params.status) {
    filters.push(`status: ${params.status}`);
  }
  if (params.risk_score_min !== undefined) {
    filters.push(`riskScoreMin: ${params.risk_score_min}`);
  }
  if (params.risk_score_max !== undefined) {
    filters.push(`riskScoreMax: ${params.risk_score_max}`);
  }
  if (params.age_days) {
    filters.push(`discoveredAfter: "-${params.age_days}d"`);
  }

  const filterStr = filters.length > 0 ? `(${filters.join(", ")})` : "";

  return `
    query GetFindings {
      findings${filterStr} {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes(first: ${limit}) {
          id
          findingType
          title
          description
          status
          severity
          riskScore
          baseRiskScore
          overallRiskScore
          discoveredAt
          lastSeenAt
          resolvedAt
          asset {
            id
            name
            assetType
          }
          vulnerability {
            id
            cveId
            title
          }
          assignee
          dueDate
          slaStatus
        }
      }
    }
  `;
}

function buildTicketsQuery(params: {
  status?: string;
  priority?: string;
  assignee?: string;
  sla_status?: string;
  limit?: number;
}): string {
  const limit = Math.min(params.limit || 100, 1000);

  const filters: string[] = [];
  if (params.status) {
    filters.push(`status: ${params.status}`);
  }
  if (params.priority) {
    filters.push(`priority: ${params.priority}`);
  }
  if (params.assignee) {
    filters.push(`assignee: "${params.assignee}"`);
  }
  if (params.sla_status) {
    filters.push(`slaStatus: ${params.sla_status}`);
  }

  const filterStr = filters.length > 0 ? `(${filters.join(", ")})` : "";

  return `
    query GetTickets {
      tickets${filterStr} {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes(first: ${limit}) {
          id
          ticketId
          title
          description
          status
          priority
          severity
          assignee
          reporter
          createdAt
          updatedAt
          dueDate
          slaStatus
          slaDueDate
          findingsCount
          affectedAssetsCount
          externalTicketId
          externalTicketUrl
        }
      }
    }
  `;
}

function buildRiskScoresQuery(params: {
  scope?: string;
  entity_id?: string;
  include_factors?: boolean;
  include_trends?: boolean;
}): string {
  const factorsFields = params.include_factors
    ? `riskFactors {
          name
          weight
          score
          description
        }`
    : "";

  const trendsFields = params.include_trends
    ? `riskTrends {
          date
          score
          changePercent
        }`
    : "";

  if (params.scope === "ASSET" && params.entity_id) {
    return `
      query GetAssetRiskScore {
        asset(id: "${params.entity_id}") {
          id
          name
          riskScore
          baseRiskScore
          overallRiskScore
          ${factorsFields}
          ${trendsFields}
        }
      }
    `;
  }

  return `
    query GetRiskScores {
      riskSummary {
        overallRiskScore
        criticalAssetCount
        highRiskAssetCount
        mediumRiskAssetCount
        lowRiskAssetCount
        totalAssetCount
        openFindingsCount
        criticalFindingsCount
        averageRemediationTime
        ${factorsFields}
        ${trendsFields}
      }
    }
  `;
}

function buildConnectorsQuery(params: {
  connector_type?: string;
  status?: string;
  include_sync_history?: boolean;
}): string {
  const syncHistoryFields = params.include_sync_history
    ? `syncHistory {
          syncId
          startTime
          endTime
          status
          recordsProcessed
          errorsCount
        }`
    : "";

  const filters: string[] = [];
  if (params.connector_type) {
    filters.push(`connectorType: "${params.connector_type}"`);
  }
  if (params.status) {
    filters.push(`status: ${params.status}`);
  }

  const filterStr = filters.length > 0 ? `(${filters.join(", ")})` : "";

  return `
    query GetConnectors {
      connectors${filterStr} {
        id
        name
        connectorType
        status
        lastSyncTime
        lastSyncStatus
        recordsCount
        configuration {
          enabled
          syncSchedule
        }
        ${syncHistoryFields}
      }
    }
  `;
}

function buildClustersQuery(params: {
  cluster_type?: string;
  limit?: number;
}): string {
  const limit = Math.min(params.limit || 50, 500);

  const filters: string[] = [];
  if (params.cluster_type) {
    filters.push(`clusterType: "${params.cluster_type}"`);
  }

  const filterStr = filters.length > 0 ? `(${filters.join(", ")})` : "";

  return `
    query GetClusters {
      clusters${filterStr} {
        nodes(first: ${limit}) {
          id
          name
          clusterType
          description
          entityCount
          riskScore
          criteria {
            attribute
            operator
            value
          }
          createdAt
          updatedAt
        }
      }
    }
  `;
}

function buildDataModelsQuery(params: {
  model_name?: string;
  include_attributes?: boolean;
  include_relationships?: boolean;
}): string {
  const attributesFields = params.include_attributes
    ? `attributes {
          name
          type
          description
          required
          indexed
        }`
    : "";

  const relationshipsFields = params.include_relationships
    ? `relationships {
          name
          targetModel
          cardinality
          description
        }`
    : "";

  if (params.model_name) {
    return `
      query GetDataModel {
        dataModel(name: "${params.model_name}") {
          name
          description
          category
          ${attributesFields}
          ${relationshipsFields}
        }
      }
    `;
  }

  return `
    query GetDataModels {
      dataModels {
        name
        description
        category
        ${attributesFields}
        ${relationshipsFields}
      }
    }
  `;
}

// Main server setup
async function main() {
  if (!BRINQA_API_URL) {
    console.error(
      "Error: BRINQA_API_URL environment variable is required"
    );
    console.error(
      "Please set BRINQA_API_URL to your Brinqa platform URL (e.g., https://your-instance.brinqa.net)"
    );
    process.exit(1);
  }

  const client = new BrinqaClient(BRINQA_API_URL);

  const server = new Server(
    {
      name: "brinqa-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case "query_assets": {
          const params = args as {
            asset_type?: string;
            status?: string;
            limit?: number;
            filter?: string;
            fields?: string[];
          };
          const query = buildAssetsQuery(params);
          result = await client.executeGraphQL(query);
          break;
        }

        case "query_vulnerabilities": {
          const params = args as {
            severity?: string;
            status?: string;
            cve_id?: string;
            limit?: number;
            filter?: string;
            include_affected_assets?: boolean;
          };
          const query = buildVulnerabilitiesQuery(params);
          result = await client.executeGraphQL(query);
          break;
        }

        case "query_findings": {
          const params = args as {
            finding_type?: string;
            status?: string;
            risk_score_min?: number;
            risk_score_max?: number;
            limit?: number;
            age_days?: number;
          };
          const query = buildFindingsQuery(params);
          result = await client.executeGraphQL(query);
          break;
        }

        case "get_risk_scores": {
          const params = args as {
            scope?: string;
            entity_id?: string;
            include_factors?: boolean;
            include_trends?: boolean;
          };
          const query = buildRiskScoresQuery(params);
          result = await client.executeGraphQL(query);
          break;
        }

        case "query_tickets": {
          const params = args as {
            status?: string;
            priority?: string;
            assignee?: string;
            sla_status?: string;
            limit?: number;
          };
          const query = buildTicketsQuery(params);
          result = await client.executeGraphQL(query);
          break;
        }

        case "get_connectors": {
          const params = args as {
            connector_type?: string;
            status?: string;
            include_sync_history?: boolean;
          };
          const query = buildConnectorsQuery(params);
          result = await client.executeGraphQL(query);
          break;
        }

        case "execute_graphql": {
          const params = args as {
            query: string;
            variables?: Record<string, unknown>;
          };
          result = await client.executeGraphQL(
            params.query,
            params.variables
          );
          break;
        }

        case "get_clusters": {
          const params = args as {
            cluster_type?: string;
            limit?: number;
          };
          const query = buildClustersQuery(params);
          result = await client.executeGraphQL(query);
          break;
        }

        case "connect_ingest_data": {
          const params = args as {
            namespace: string;
            data_type: string;
            records: unknown[];
          };
          result = await client.connectApiRequest("POST", "/ingest", {
            namespace: params.namespace,
            dataType: params.data_type,
            records: params.records,
          });
          break;
        }

        case "get_data_models": {
          const params = args as {
            model_name?: string;
            include_attributes?: boolean;
            include_relationships?: boolean;
          };
          const query = buildDataModelsQuery(params);
          result = await client.executeGraphQL(query);
          break;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
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

  console.error("Brinqa MCP server started");
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
