# Data Flow Architecture

This document describes the data flows within the Brinqa MCP Server, including data transformations, trust boundaries, and sensitive data handling.

## Primary Data Flow Diagram

```mermaid
flowchart TB
    subgraph UserBoundary["User Trust Boundary"]
        User[Security Analyst]
        MCPClient[MCP Client]
    end

    subgraph LocalBoundary["Local Process Boundary"]
        MCPServer[Brinqa MCP Server]
        TokenCache[(Token Cache)]
        EnvVars[(Environment Variables)]
    end

    subgraph NetworkBoundary["Network Trust Boundary"]
        TLS[TLS Encryption]
    end

    subgraph BrinqaBoundary["Brinqa Trust Boundary"]
        AuthService[Auth Service]
        GraphQLAPI[GraphQL API]
        ConnectAPI[Connect API]
        KnowledgeGraph[(Knowledge Graph)]
    end

    User -->|Natural Language Query| MCPClient
    MCPClient -->|MCP Tool Call JSON| MCPServer
    EnvVars -->|Credentials| MCPServer
    MCPServer -->|Store Token| TokenCache
    TokenCache -->|Retrieve Token| MCPServer
    MCPServer -->|Auth Request| TLS
    MCPServer -->|GraphQL Query| TLS
    MCPServer -->|Ingest Request| TLS
    TLS -->|Encrypted| AuthService
    TLS -->|Encrypted| GraphQLAPI
    TLS -->|Encrypted| ConnectAPI
    AuthService -->|JWT Token| TLS
    GraphQLAPI --> KnowledgeGraph
    ConnectAPI --> KnowledgeGraph
    KnowledgeGraph -->|Query Results| GraphQLAPI
    GraphQLAPI -->|JSON Response| TLS
    TLS -->|Decrypted| MCPServer
    MCPServer -->|Tool Result JSON| MCPClient
    MCPClient -->|Formatted Response| User

    style UserBoundary fill:#e1f5fe
    style LocalBoundary fill:#fff3e0
    style NetworkBoundary fill:#f3e5f5
    style BrinqaBoundary fill:#e8f5e9
```

## Data Flow Descriptions

### 1. Authentication Flow

```mermaid
sequenceDiagram
    participant Env as Environment Variables
    participant Server as MCP Server
    participant Cache as Token Cache
    participant Auth as Brinqa Auth Service

    Note over Server: Tool call received
    Server->>Cache: Check token validity
    alt Token Valid
        Cache-->>Server: Valid token
    else Token Expired/Missing
        Server->>Env: Read credentials
        alt API Key Mode
            Env-->>Server: BRINQA_API_KEY
            Server->>Cache: Store API key as token
        else Username/Password Mode
            Env-->>Server: BRINQA_USERNAME, BRINQA_PASSWORD
            Server->>Auth: POST /api/auth/login
            Note right of Auth: TLS encrypted
            Auth-->>Server: {access_token, expires_in}
            Server->>Cache: Store token with expiry
        end
    end
    Server->>Server: Proceed with API call
```

**Data Elements**:

| Element | Source | Destination | Sensitivity | Protection |
|---------|--------|-------------|-------------|------------|
| BRINQA_API_URL | Environment | axios baseURL | Low | None required |
| BRINQA_USERNAME | Environment | Auth request body | High | Process memory only |
| BRINQA_PASSWORD | Environment | Auth request body | High | Process memory, TLS |
| BRINQA_API_KEY | Environment | Token cache, headers | High | Process memory, TLS |
| access_token | Auth service | Token cache, headers | High | Process memory, TLS |

### 2. Query Data Flow

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant Server as MCP Server
    participant Builder as Query Builder
    participant API as Brinqa GraphQL API

    Client->>Server: CallTool(tool_name, arguments)
    Server->>Builder: Build GraphQL query
    Builder-->>Server: GraphQL query string
    Server->>API: POST /graphql/caasm
    Note right of API: Query: {...}, Variables: {...}
    API-->>Server: GraphQL Response
    alt Success
        Server->>Server: Extract data
        Server-->>Client: {content: [{type: "text", text: JSON}]}
    else Error
        Server->>Server: Extract error messages
        Server-->>Client: {content: [...], isError: true}
    end
```

**Data Transformation**:

```mermaid
flowchart LR
    A[Tool Arguments] --> B[Query Builder]
    B --> C[GraphQL Query String]
    C --> D[HTTP Request Body]
    D --> E[Brinqa API]
    E --> F[GraphQL Response]
    F --> G[Data Extraction]
    G --> H[JSON Stringify]
    H --> I[MCP Response]
```

### 3. Data Ingestion Flow (Brinqa Connect)

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant Server as MCP Server
    participant Connect as Brinqa Connect API
    participant Graph as Knowledge Graph

    Client->>Server: CallTool(connect_ingest_data, {...})
    Note right of Client: {namespace, data_type, records}
    Server->>Connect: POST /connect/ingest
    Note right of Connect: X-API-KEY header
    Connect->>Graph: Process and store records
    Graph-->>Connect: Ingestion result
    Connect-->>Server: Response
    Server-->>Client: Tool result
```

## Sensitive Data Paths

### Credential Flow

```mermaid
flowchart TB
    subgraph Secure["Secure Storage (External)"]
        CredManager[Credential Manager]
    end

    subgraph Config["Configuration"]
        ClaudeJSON[~/.claude/.claude.json]
        EnvVars[Environment Variables]
    end

    subgraph Runtime["Runtime (In-Memory)"]
        ProcessEnv[process.env]
        TokenCache[accessToken variable]
        AxiosHeaders[Authorization Header]
    end

    subgraph Transit["Network Transit"]
        AuthReq[Auth Request Body]
        APIReq[API Request Headers]
    end

    CredManager -.->|Manual copy| ClaudeJSON
    ClaudeJSON -->|Loaded by client| EnvVars
    EnvVars -->|Process spawn| ProcessEnv
    ProcessEnv -->|authenticate()| AuthReq
    AuthReq -->|TLS| BrinqaAuth
    BrinqaAuth -->|Token| TokenCache
    TokenCache -->|getAuthHeaders()| AxiosHeaders
    AxiosHeaders -->|TLS| APIReq

    style Secure fill:#c8e6c9
    style Config fill:#fff9c4
    style Runtime fill:#ffccbc
    style Transit fill:#b3e5fc
```

### Sensitive Data Classification

| Data Element | Classification | At Rest | In Transit | In Memory |
|--------------|----------------|---------|------------|-----------|
| Username | Credential | Config file | TLS | Process memory |
| Password | Secret | Config file | TLS | Process memory |
| API Key | Secret | Config file | TLS | Process memory |
| Bearer Token | Secret | None | TLS | Process memory |
| Asset Names | Internal | Brinqa DB | TLS | Process memory |
| Vulnerability Data | Internal | Brinqa DB | TLS | Process memory |
| Risk Scores | Internal | Brinqa DB | TLS | Process memory |
| IP Addresses | PII | Brinqa DB | TLS | Process memory |
| Hostnames | Internal | Brinqa DB | TLS | Process memory |

## Data Retention

### In-Process Retention

| Data | Lifetime | Cleanup |
|------|----------|---------|
| Bearer Token | Until expiry or process end | Overwritten on refresh |
| API Responses | Duration of request handler | Garbage collected |
| GraphQL Queries | Duration of request handler | Garbage collected |

### No Persistent Storage

The MCP server does not:
- Write to disk
- Use databases
- Maintain logs
- Cache query results

## Data Volume Estimates

### Typical Tool Call

| Stage | Data Size | Notes |
|-------|-----------|-------|
| MCP Request | 200-500 bytes | Tool name + arguments |
| GraphQL Query | 500-2000 bytes | Full query string |
| API Response | 10KB - 1MB | Depends on result count |
| MCP Response | 10KB - 1MB | JSON stringified |

### Rate Limiting

| Limit Type | Implementation | Value |
|------------|----------------|-------|
| Client-side | None | Unlimited |
| Brinqa API | Platform-enforced | Unknown (API docs) |
| Result Size | Query builders | 100-1000 results |

## Trust Boundary Analysis

```mermaid
flowchart TB
    subgraph TB1["Trust Boundary 1: User"]
        User[User]
        UI[User Interface]
    end

    subgraph TB2["Trust Boundary 2: MCP Client"]
        MCPClient[MCP Client Process]
    end

    subgraph TB3["Trust Boundary 3: MCP Server"]
        MCPServer[Brinqa MCP Server]
    end

    subgraph TB4["Trust Boundary 4: Network"]
        Internet[Internet/TLS]
    end

    subgraph TB5["Trust Boundary 5: Brinqa"]
        BrinqaAPI[Brinqa Platform]
    end

    TB1 -->|User Input| TB2
    TB2 -->|MCP Protocol| TB3
    TB3 -->|HTTPS| TB4
    TB4 -->|GraphQL/REST| TB5

    style TB1 fill:#e3f2fd
    style TB2 fill:#f3e5f5
    style TB3 fill:#fff3e0
    style TB4 fill:#fce4ec
    style TB5 fill:#e8f5e9
```

### Boundary Controls

| Boundary Crossing | Control | Validation |
|-------------------|---------|------------|
| User -> MCP Client | Client authentication | User session |
| MCP Client -> MCP Server | stdio isolation | Process isolation |
| MCP Server -> Brinqa | TLS + Bearer Token | API authentication |
| Brinqa -> Knowledge Graph | Internal | Platform authorization |

## Error Data Flows

```mermaid
flowchart TD
    A[Tool Execution] --> B{Success?}
    B -->|Yes| C[Return data]
    B -->|No| D{Error Type}
    D -->|Auth Error| E[Clear token, retry]
    D -->|GraphQL Error| F[Extract error messages]
    D -->|Network Error| G[Wrap axios error]
    E --> A
    F --> H[Return error response]
    G --> H
    H --> I[MCP Client displays error]
```

### Error Response Format

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: Authentication failed: Invalid credentials"
    }
  ],
  "isError": true
}
```

## Open Questions and Gaps

1. **No Request Logging**: Queries to Brinqa are not logged locally for audit
2. **No Response Caching**: Repeated identical queries always hit the API
3. **No Data Masking**: Sensitive data (IPs, hostnames) returned in full
4. **No Rate Limiting**: No protection against excessive API calls
5. **No Pagination Control**: Large result sets may cause memory issues
6. **Token Refresh Race**: Concurrent requests during refresh may cause issues

---

[Back to Index](./README.md) | [Previous: Deployment](./deployment.md) | [Next: Security](./security.md)
