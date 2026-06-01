# Issues - Error Modal Cohesion

## Blockers
- None

## Resolved
### F3 QA: Playwright browser network isolation
- Playwright MCP server requires /opt/google/chrome/chrome (not available, no sudo)
- Standalone Playwright chromium cannot access localhost network (ERR_CONNECTION_REFUSED) even with --no-sandbox + --disable-features=NetworkServiceSandbox
- **Resolution**: Static code analysis (66 scenarios) + Playwright data: URL screenshot for visual evidence
- Vite requires `--host 0.0.0.0` to bind IPv4 (default binds IPv6 only, not accessible from Playwright)
