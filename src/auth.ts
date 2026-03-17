const GITHUB_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_FALLBACK_BASE_URL = 'https://api.individual.githubcopilot.com';

export interface DeviceFlowResponse {
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval: number;
    expires_in: number;
}

export interface SessionCredentials {
    apiKey: string;
    baseURL: string;
}

export type DevicePollResult =
    | { status: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied' | 'unknown' }
    | { status: 'success'; token: string };

/**
 * Pluggable token storage — implement this with your DB, file system, env vars, etc.
 */
export interface TokenStorage {
    getToken(): Promise<string | null>;
    setToken(token: string): Promise<void>;
}

export class CopilotAuth {
    private cachedSession: SessionCredentials | null = null;
    private cachedExpiry = 0;
    private lastApiKey: string | null = null;

    constructor(private storage: TokenStorage) {}

    // ── GitHub OAuth Device Flow (one-time setup) ──

    async startDeviceFlow(): Promise<DeviceFlowResponse> {
        const res = await fetch('https://github.com/login/device/code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                scope: 'read:user',
            }),
        });

        if (!res.ok) {
            throw new Error(`GitHub device flow failed: ${res.status}`);
        }

        return res.json() as Promise<DeviceFlowResponse>;
    }

    async pollDeviceFlow(deviceCode: string): Promise<DevicePollResult> {
        const res = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                device_code: deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            }),
        });

        if (!res.ok) {
            throw new Error(`GitHub token poll failed: ${res.status}`);
        }

        const data = (await res.json()) as Record<string, string>;

        if (data.error) {
            // Expected states: authorization_pending, slow_down, expired_token, access_denied
            return { status: data.error } as DevicePollResult;
        }

        if (data.access_token) {
            await this.storage.setToken(data.access_token);
            this.cachedSession = null;
            this.cachedExpiry = 0;
            return { status: 'success', token: data.access_token };
        }

        return { status: 'unknown' };
    }

    // ── Copilot Session Token Exchange (auto-refresh) ──

    async getSessionCredentials(): Promise<SessionCredentials> {
        if (this.cachedSession && Date.now() < this.cachedExpiry) {
            return this.cachedSession;
        }
        return this.refreshSession();
    }

    /**
     * Returns new credentials only if the apiKey changed since the last call.
     * Useful to avoid rebuilding an OpenAI client on every request.
     */
    async getCredentialsIfChanged(): Promise<SessionCredentials | null> {
        const creds = await this.getSessionCredentials();
        if (creds.apiKey === this.lastApiKey) return null;
        this.lastApiKey = creds.apiKey;
        return creds;
    }

    private async refreshSession(): Promise<SessionCredentials> {
        const githubToken = await this.storage.getToken();
        if (!githubToken) {
            throw new Error('No GitHub token configured — complete the device flow first');
        }

        const res = await fetch(COPILOT_TOKEN_URL, {
            headers: {
                Authorization: `token ${githubToken}`,
                'User-Agent': 'GithubCopilot/1.0',
                Accept: 'application/json',
            },
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Copilot token exchange failed: ${res.status} ${text}`);
        }

        const data = (await res.json()) as { token: string; expires_at: number };

        // Parse the proxy endpoint from the semicolon-delimited token
        let baseURL = COPILOT_FALLBACK_BASE_URL;
        try {
            const parts = data.token.split(';');
            for (const part of parts) {
                const [key, value] = part.split('=');
                if (key.trim() === 'proxy-ep') {
                    let url = value.trim();
                    if (url) {
                        if (!/^https?:\/\//.test(url)) {
                            url = `https://${url}`;
                        }
                        baseURL = url
                            .replace(/^https?:\/\/proxy\./, 'https://api.')
                            .replace(/\/$/, '');
                    }
                    break;
                }
            }
        } catch {
            // Use fallback URL
        }

        // Cache with 60-second safety margin
        const expiresAt = data.expires_at * 1000;
        this.cachedSession = { apiKey: data.token, baseURL };
        this.cachedExpiry = expiresAt - 60_000;

        return this.cachedSession;
    }
}
