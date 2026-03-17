import OpenAI from 'openai';
import { CopilotAuth, type TokenStorage } from './auth';

const COPILOT_HEADERS: Record<string, string> = {
    'Editor-Version': 'vscode/1.95.0',
    'Editor-Plugin-Version': 'copilot/1.0.0',
    'Copilot-Integration-Id': 'vscode-chat',
};

export interface CopilotClientOptions {
    /** Your token storage implementation */
    storage: TokenStorage;
    /** Default model to use (default: 'gpt-4o') */
    model?: string;
    /** Extra default headers to merge in */
    extraHeaders?: Record<string, string>;
}

export interface CopilotClient {
    /** The auto-refreshing OpenAI client */
    openai: OpenAI;
    /** The underlying auth instance (for device flow, manual refresh, etc.) */
    auth: CopilotAuth;
    /** Call before each request to ensure the client has fresh credentials */
    refresh(): Promise<void>;
}

/**
 * Creates an OpenAI-compatible client that authenticates via GitHub Copilot.
 * The client auto-refreshes session tokens when they expire.
 *
 * Usage:
 * ```ts
 * const { openai, refresh } = await createCopilotClient({ storage: myStorage });
 * await refresh(); // ensure fresh token
 * const res = await openai.chat.completions.create({ model: 'gpt-4o', messages: [...] });
 * ```
 */
export async function createCopilotClient(options: CopilotClientOptions): Promise<CopilotClient> {
    const auth = new CopilotAuth(options.storage);
    const creds = await auth.getSessionCredentials();

    const headers = { ...COPILOT_HEADERS, ...options.extraHeaders };

    let client = new OpenAI({
        apiKey: creds.apiKey,
        baseURL: creds.baseURL,
        defaultHeaders: headers,
    });

    const result: CopilotClient = {
        openai: client,
        auth,
        async refresh() {
            const newCreds = await auth.getCredentialsIfChanged();
            if (newCreds) {
                client = new OpenAI({
                    apiKey: newCreds.apiKey,
                    baseURL: newCreds.baseURL,
                    defaultHeaders: headers,
                });
                result.openai = client;
            }
        },
    };

    return result;
}

/**
 * Premium-request multipliers per model (from GitHub docs).
 * 0 = free, 0.25/0.33 = low-cost, 1 = standard premium, 3 = high-cost.
 */
export const COPILOT_MODEL_MULTIPLIERS: Record<string, number> = {
    'gpt-4.1': 0,
    'gpt-4o': 0,
    'gpt-5-mini': 0,
    'raptor-mini': 0,
    'claude-haiku-4.5': 0.33,
    'gemini-3-flash': 0.33,
    'gpt-5.1-codex-mini': 0.33,
    'grok-code-fast-1': 0.25,
    'claude-sonnet-4': 1,
    'claude-sonnet-4.5': 1,
    'claude-sonnet-4.6': 1,
    'gemini-2.5-pro': 1,
    'gemini-3-pro': 1,
    'gemini-3.1-pro': 1,
    'gpt-5.1': 1,
    'gpt-5.2': 1,
    'gpt-5.1-codex': 1,
    'gpt-5.1-codex-max': 1,
    'gpt-5.2-codex': 1,
    'gpt-5.3-codex': 1,
    'claude-opus-4.5': 3,
    'claude-opus-4.6': 3,
};
