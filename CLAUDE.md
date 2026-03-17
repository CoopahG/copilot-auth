# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@coopah/copilot-auth` is a zero-dependency TypeScript library that implements the GitHub Copilot OAuth device flow and provides OpenAI-compatible client configuration with auto-refreshing session tokens. Requires an active GitHub Copilot subscription.

## Commands

- **Build:** `pnpm build` (runs `tsc`)
- **Dev/watch:** `pnpm dev` (runs `tsc --watch`)
- **Install:** `pnpm install`

No test framework or linter is configured.

## Architecture

The package has two entry points:

- `@coopah/copilot-auth` → `src/index.ts` → re-exports from `src/auth.ts`
- `@coopah/copilot-auth/express` → `src/express.ts` → Express route helpers

**`src/auth.ts`** — The `CopilotAuth` class handles:
1. **GitHub OAuth device flow** (`startDeviceFlow` / `pollDeviceFlow` / `login`) — exchanges a GitHub client ID for a user token via the device code grant
2. **Copilot session token exchange** (`getSessionCredentials` / `getOpenAIClientConfig`) — swaps the GitHub token for a short-lived Copilot API token, cached until near-expiry

**`src/express.ts`** — `mountCopilotRoutes` mounts two POST endpoints (`/copilot/device-code`, `/copilot/device-poll`) on an Express router, delegating to `CopilotAuth`.

**Token flow:** GitHub OAuth token (long-lived, stored via `TokenStorage`) → Copilot session token (short-lived, cached in memory with auto-refresh).

## Key Design Decisions

- **ESM-only** (`"type": "module"` in package.json, `module: "ESNext"` in tsconfig)
- **Zero runtime dependencies** — uses native `fetch` (Node 18+); `express` is an optional peer dependency
- **`TokenStorage` interface** — consumers provide their own persistence; the library never touches the filesystem or env vars directly
- **No client factory** — consumers construct their own `OpenAI` instance using the `{ apiKey, baseURL, defaultHeaders }` from `getOpenAIClientConfig()`. Use `getCredentialsIfChanged()` to detect when the session token rotates and rebuild the client only when needed.
