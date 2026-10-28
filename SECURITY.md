# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Vellum Assistant, please report it responsibly. **Do not open a public GitHub issue.**

Try to fix it on your own copy of Vellum-Selfhost-LTS, and then if functional, add to official repo.

## Scope

This policy covers the code in this repository, including:
- The assistant runtime (`assistant/`)
- The gateway (`gateway/`)
- The CLI (`cli/`)
- End-user app surfaces (`clients/` — web, iOS, macOS/Electron)
- Native clients (`clients/`)
- The credential execution service (`credential-executor/`)
- The packages shared between services (`packages/`)

## Security Model

For details on Vellum Assistant's security architecture — including sandboxing, credential storage, permission modes, and trust rules — see the [Security Architecture documentation](assistant/docs/architecture/security.md).
