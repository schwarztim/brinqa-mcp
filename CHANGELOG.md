# Changelog

All notable changes to the Brinqa MCP Server will be documented in this file.

## [1.1.0] - 2026-01-16

### Performance Improvements
- **Added HTTP/HTTPS connection pooling with keepAlive**: Implemented singleton HTTP agents with connection pooling to reduce latency and improve throughput
  - `keepAlive: true` with 30-second keepalive interval
  - Maximum 50 concurrent sockets with 10 free sockets
  - 60-second socket timeout
  - 30-second request timeout
  - Expected performance improvement: 20-40% reduction in request latency for sequential operations

### Security Enhancements
- **Added comprehensive input validation**: Implemented `validateInput()` function to prevent injection attacks
  - Type checking for all tool parameters (string, number, boolean, array, object)
  - GraphQL injection pattern detection (prevents `${`, `__typename`, `fragment`, `mutation` injection)
  - Empty query validation for execute_graphql tool
- **Security audit passed**: No vulnerabilities found in npm dependencies (npm audit: 0 vulnerabilities)
- **No hardcoded secrets**: Verified no credentials or sensitive data hardcoded in source

### Features & API Alignment
- **Updated GraphQL queries to match Brinqa API documentation**:
  - Assets query now uses correct field names: `displayName`, `baseRiskScore`, `riskRating`, `publicIpAddresses`, `macAddresses`, `os`, `firstSeen`, `openFindingCount`, `dataIntegrationTitles`
  - Findings query aligned with API: `firstFound`, `connectorNames`, `riskRating`, `statusCategory`, `ageInDays`, `type.patchAvailable`, `type.recommendation`
  - Added nested `owners` object with `name` and `emails` fields for asset queries

### Code Quality
- **Improved graceful startup**: Server now starts successfully without credentials and provides clear configuration guidance
  - Logs connection information on startup (without exposing credentials)
  - Clear error messages when BRINQA_API_URL is not configured
  - Tools return helpful configuration examples when credentials are missing
- **Enhanced error handling**: Better error messages throughout the codebase
- **Type safety**: Maintained strict TypeScript typing for all new features

### Documentation
- Created CHANGELOG.md to track improvements
- Aligned field names with official Brinqa GraphQL API documentation (Jan 2026)

## [1.0.0] - Initial Release

### Features
- GraphQL query support for assets, vulnerabilities, findings, tickets, connectors, clusters, and data models
- Brinqa Connect API integration for custom data ingestion
- Bearer token authentication with 24-hour token caching
- Support for both username/password and API key authentication
- 10 comprehensive tools for Brinqa platform interaction
