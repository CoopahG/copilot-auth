# @coopah/copilot-auth

GitHub Copilot OAuth device flow + OpenAI-compatible client config with auto-refreshing tokens.

[![npm](https://img.shields.io/npm/v/@coopah/copilot-auth)](https://www.npmjs.com/package/@coopah/copilot-auth)

## Install

```bash
npm install @coopah/copilot-auth
```

## Prerequisites

- An active [GitHub Copilot](https://github.com/features/copilot) subscription
- Node.js 18+

## Quick Start

### 1. Implement token storage

Store the GitHub OAuth token however you like — database, file, env var, etc.

```ts
import type { TokenStorage } from '@coopah/copilot-auth';

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
import { CopilotAuth } from '@coopah/copilot-auth';
import OpenAI from 'openai';

const auth = new CopilotAuth({ storage });

// One call — prints the code/URL to console, polls until authorized
await auth.login();

// Get an auto-refreshing OpenAI-compatible config
const config = await auth.getOpenAIClientConfig();
const openai = new OpenAI(config);

const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

`login()` skips the flow if a token already exists. `getSessionCredentials()` caches and auto-refreshes the Copilot session token.

You can also use `startDeviceFlow()` and `pollDeviceFlow()` directly if you need lower-level control.

### Refreshing credentials

The session token expires periodically. Use `getCredentialsIfChanged()` to rebuild your client only when needed:

```ts
const newCreds = await auth.getCredentialsIfChanged();
if (newCreds) {
  openai = new OpenAI(await auth.getOpenAIClientConfig());
}
```

## Express Integration

Mount two POST endpoints for the device flow on any Express router:

```ts
import express from 'express';
import { mountCopilotRoutes } from '@coopah/copilot-auth/express';

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

`mountCopilotRoutes` returns the `CopilotAuth` instance, so you can reuse it:

```ts
const auth = mountCopilotRoutes({ router, storage });
const config = await auth.getOpenAIClientConfig();
```

## API Reference

### `@coopah/copilot-auth`

| Export | Type | Description |
|--------|------|-------------|
| `CopilotAuth` | class | Core auth — device flow + session token management |
| `CopilotAuthOptions` | type | Options: `{ storage, extraHeaders? }` |
| `TokenStorage` | type | Interface for pluggable token persistence |
| `DeviceFlowResponse` | type | Response from `startDeviceFlow()` |
| `SessionCredentials` | type | `{ apiKey, baseURL }` for the Copilot API |
| `OpenAIClientConfig` | type | `{ apiKey, baseURL, defaultHeaders }` for `new OpenAI(...)` |
| `DevicePollResult` | type | Result from `pollDeviceFlow()` |

### `@coopah/copilot-auth/express`

| Export | Type | Description |
|--------|------|-------------|
| `mountCopilotRoutes` | function | Mounts device flow POST endpoints on a router |
| `CopilotRoutesOptions` | type | Options: `{ router, storage, auth? }` |

## License

MIT
