# Brinqa MCP Server - Architecture Documentation

This documentation provides a comprehensive view of the Brinqa MCP (Model Context Protocol) Server architecture, designed for integrating with the Brinqa Cyber Risk Analytics and Vulnerability Risk Management platform.

## Documentation Index

| Document | Description |
|----------|-------------|
| [System Context](./context.md) | C4 Level 1 - System context and external interactions |
| [Containers](./containers.md) | C4 Level 2 - Container architecture and runtime components |
| [Components](./components.md) | C4 Level 3 - Internal component structure and responsibilities |
| [Deployment](./deployment.md) | Deployment views across environments |
| [Data Flows](./data-flows.md) | Data flow diagrams and sensitive data paths |
| [Security](./security.md) | Threat model, controls, and security architecture |
| [TOGAF Mapping](./togaf-mapping.md) | TOGAF-aligned architectural views |
| [Decisions](./decisions.md) | Architecture Decision Records (ADRs) |

## Quick Overview

### What is this system?

The Brinqa MCP Server is a **Model Context Protocol (MCP) server** that provides AI assistants (such as Claude) with programmatic access to the Brinqa platform. It enables querying of:

- **Assets**: Hosts, applications, containers, cloud resources
- **Vulnerabilities**: CVEs, security findings with CVSS scores
- **Findings**: Specific vulnerability instances on assets
- **Risk Scores**: Organization and asset-level risk analytics
- **Tickets**: Remediation workflow tracking
- **Connectors**: Data source integration status
- **Clusters**: Automated data groupings
- **Data Models**: Knowledge graph schema exploration

### Key Characteristics

| Characteristic | Value |
|----------------|-------|
| **Type** | MCP Server (stdio transport) |
| **Language** | TypeScript (ES2022) |
| **Runtime** | Node.js |
| **Primary Protocol** | GraphQL over HTTPS |
| **Authentication** | Bearer Token (OAuth) or API Key |
| **Deployment** | Local process, spawned by MCP client |

### Architecture Highlights

```
+-------------------+     stdio      +-------------------+     HTTPS/GraphQL    +-------------------+
|   MCP Client      |<-------------->|   Brinqa MCP      |<-------------------->|   Brinqa Platform |
|   (e.g., Claude)  |                |   Server          |                      |   API             |
+-------------------+                +-------------------+                      +-------------------+
```

## Architecture Dimensions Summary

| Dimension | Current State | Key Considerations |
|-----------|--------------|---------------------|
| Modularity | Single-file monolith | Simple, appropriate for scope |
| Scalability | Single instance | Limited by MCP client process model |
| Reliability | Process-level | Tied to parent MCP client lifecycle |
| Security | Token-based auth | Credentials in environment variables |
| Observability | Console stderr | No structured logging or metrics |
| Maintainability | TypeScript + strict mode | Good type safety, limited tests |

## Version Information

- **Documentation Version**: 1.0.0
- **Server Version**: 1.0.0
- **Last Updated**: 2026-01-16

## Open Questions and Gaps

1. **Testing**: No unit or integration tests are present in the codebase
2. **Error Recovery**: Limited retry logic beyond token refresh
3. **Rate Limiting**: No client-side rate limiting implementation
4. **Pagination**: GraphQL pagination exists but not exposed via tool parameters
5. **Logging**: No structured logging framework integrated

---

*This documentation was generated using architectural analysis of the codebase.*
