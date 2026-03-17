import type { Router, Request, Response } from 'express';
import { CopilotAuth, type TokenStorage } from './auth';

export interface CopilotRoutesOptions {
    /** Express Router instance to mount routes on */
    router: Router;
    /** Token storage implementation */
    storage: TokenStorage;
    /** Existing CopilotAuth instance (created if not provided) */
    auth?: CopilotAuth;
}

/**
 * Mounts two POST endpoints for the GitHub device flow:
 *
 *   POST /copilot/device-code  → starts the device flow, returns { user_code, verification_uri, device_code, interval }
 *   POST /copilot/device-poll  → polls for completion, body: { device_code }, returns { status, token? }
 *
 * Returns the CopilotAuth instance (reuse it to create a client later).
 */
export function mountCopilotRoutes(options: CopilotRoutesOptions): CopilotAuth {
    const auth = options.auth ?? new CopilotAuth(options.storage);
    const { router } = options;

    router.post('/copilot/device-code', async (_req: Request, res: Response) => {
        try {
            const result = await auth.startDeviceFlow();
            res.json(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            res.status(500).json({ error: message });
        }
    });

    router.post('/copilot/device-poll', async (req: Request, res: Response) => {
        try {
            const { device_code } = req.body;
            if (!device_code) {
                res.status(400).json({ error: 'device_code is required' });
                return;
            }
            const result = await auth.pollDeviceFlow(device_code);
            res.json(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            res.status(500).json({ error: message });
        }
    });

    return auth;
}
