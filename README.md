# copilot-auth

GitHub Copilot OAuth device flow + OpenAI-compatible client with auto-refreshing tokens.

[![npm](https://img.shields.io/npm/v/copilot-auth)](https://www.npmjs.com/package/copilot-auth)

## Install

```bash
npm install copilot-auth
```

## Prerequisites

- An active [GitHub Copilot](https://github.com/features/copilot) subscription
- Node.js 18+

## Quick Start

### 1. Implement token storage

Store the GitHub OAuth token however you like — database, file, env var, etc.

```ts
import type { TokenStorage } from 'copilot-auth';

const storage: TokenStorage = {
  async getToken() {
    return process.env.GITHUB_TOKEN ?? null;
  },
  async setToken(token) {
    process.env.GITHUB_TOKEN = token;
  },
};
```

### 2. Login and use

```ts
import { CopilotAuth, createCopilotClient } from 'copilot-auth';

const auth = new CopilotAuth(storage);

// One call — prints the code/URL to console, polls until authorized
await auth.login();

// Create an OpenAI-compatible client
const { openai, refresh } = await createCopilotClient({ storage });

// Call refresh() before requests to ensure fresh credentials
await refresh();

const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

`login()` skips the flow if a token already exists. `refresh()` is a no-op if credentials are still valid.

You can also use `startDeviceFlow()` and `pollDeviceFlow()` directly if you need lower-level control.

## Express Integration

Mount two POST endpoints for the device flow on any Express router:

```ts
import express from 'express';
import { mountCopilotRoutes } from 'copilot-auth/express';

const app = express();
app.use(express.json());

const router = express.Router();
mountCopilotRoutes({ router, storage });
app.use('/api', router);

// Exposes:
//   POST /api/copilot/device-code  → starts the device flow
//   POST /api/copilot/device-poll  → polls for completion (body: { device_code })

app.listen(3000);
```

`mountCopilotRoutes` returns the `CopilotAuth` instance, so you can reuse it to create a client:

```ts
const auth = mountCopilotRoutes({ router, storage });
const { openai } = await createCopilotClient({ storage });
```

## API Reference

### `copilot-auth`

| Export | Type | Description |
|--------|------|-------------|
| `CopilotAuth` | class | Core auth — device flow + session token management |
| `createCopilotClient` | function | Creates an auto-refreshing OpenAI client |
| `COPILOT_MODEL_MULTIPLIERS` | object | Premium-request cost multipliers per model |
| `TokenStorage` | type | Interface for pluggable token persistence |
| `DeviceFlowResponse` | type | Response from `startDeviceFlow()` |
| `SessionCredentials` | type | `{ apiKey, baseURL }` for the Copilot API |
| `DevicePollResult` | type | Result from `pollDeviceFlow()` |
| `CopilotClientOptions` | type | Options for `createCopilotClient()` |
| `CopilotClient` | type | Return type of `createCopilotClient()` |

### `copilot-auth/express`

| Export | Type | Description |
|--------|------|-------------|
| `mountCopilotRoutes` | function | Mounts device flow POST endpoints on a router |
| `CopilotRoutesOptions` | type | Options: `{ router, storage, auth? }` |

## Model Multipliers

`COPILOT_MODEL_MULTIPLIERS` maps model names to their premium-request cost multipliers (from GitHub's docs). `0` = included in free tier, `1` = standard premium request, `3` = high-cost.

```ts
import { COPILOT_MODEL_MULTIPLIERS } from 'copilot-auth';

console.log(COPILOT_MODEL_MULTIPLIERS['gpt-4o']); // 0 (free)
console.log(COPILOT_MODEL_MULTIPLIERS['claude-sonnet-4.6']); // 1 (standard)
console.log(COPILOT_MODEL_MULTIPLIERS['claude-opus-4.6']); // 3 (high-cost)
```

## License

MIT
