// Core auth
export { CopilotAuth } from './auth';
export type {
    TokenStorage,
    DeviceFlowResponse,
    SessionCredentials,
    DevicePollResult,
} from './auth';

// OpenAI client factory
export { createCopilotClient, COPILOT_MODEL_MULTIPLIERS } from './client';
export type { CopilotClientOptions, CopilotClient } from './client';
