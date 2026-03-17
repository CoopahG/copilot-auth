import { useState, useRef, useCallback, useEffect } from 'react';

export type DeviceFlowState =
    | { step: 'idle' }
    | { step: 'loading' }
    | {
          step: 'showing_code';
          userCode: string;
          verificationUri: string;
          deviceCode: string;
          interval: number;
      }
    | { step: 'polling'; userCode: string; verificationUri: string }
    | { step: 'connected' }
    | { step: 'error'; message: string };

export interface UseCopilotDeviceFlowOptions {
    /** Function to start the device flow — should POST to your /copilot/device-code endpoint */
    startDeviceFlow: () => Promise<{
        user_code: string;
        verification_uri: string;
        device_code: string;
        interval: number;
    }>;
    /** Function to poll for completion — should POST to your /copilot/device-poll endpoint */
    pollDeviceFlow: (deviceCode: string) => Promise<{ status: string; token?: string }>;
    /** Called when the device flow completes successfully */
    onConnected?: () => void;
    /** Whether the user is already connected (skips to 'connected' state) */
    connected?: boolean;
}

/**
 * Headless React hook for the GitHub Copilot device flow.
 * Bring your own UI — this hook manages the state machine only.
 *
 * ```tsx
 * const { state, start, confirmAuthorized, copyCode } = useCopilotDeviceFlow({
 *   startDeviceFlow: () => fetch('/api/copilot/device-code', { method: 'POST' }).then(r => r.json()),
 *   pollDeviceFlow: (dc) => fetch('/api/copilot/device-poll', {
 *     method: 'POST', body: JSON.stringify({ device_code: dc }),
 *     headers: { 'Content-Type': 'application/json' },
 *   }).then(r => r.json()),
 *   onConnected: () => console.log('Connected!'),
 * });
 * ```
 */
export function useCopilotDeviceFlow(options: UseCopilotDeviceFlowOptions) {
    const { startDeviceFlow, pollDeviceFlow, onConnected, connected } = options;

    const [state, setState] = useState<DeviceFlowState>(
        connected ? { step: 'connected' } : { step: 'idle' },
    );
    const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPolling = useCallback(() => {
        if (pollTimer.current) {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
        }
    }, []);

    useEffect(() => () => stopPolling(), [stopPolling]);

    useEffect(() => {
        if (connected && state.step === 'idle') {
            queueMicrotask(() => setState({ step: 'connected' }));
        }
    }, [connected, state.step]);

    const start = useCallback(async () => {
        setState({ step: 'loading' });
        try {
            const data = await startDeviceFlow();
            setState({
                step: 'showing_code',
                userCode: data.user_code,
                verificationUri: data.verification_uri,
                deviceCode: data.device_code,
                interval: data.interval,
            });
        } catch (err) {
            setState({
                step: 'error',
                message: err instanceof Error ? err.message : 'Failed to start device flow',
            });
        }
    }, [startDeviceFlow]);

    const confirmAuthorized = useCallback(() => {
        setState((s: DeviceFlowState) => {
            if (s.step !== 'showing_code') return s;

            const { deviceCode, interval, userCode, verificationUri } = s;
            stopPolling();
            pollTimer.current = setInterval(
                async () => {
                    try {
                        const result = await pollDeviceFlow(deviceCode);
                        if (result.status === 'success') {
                            stopPolling();
                            setState({ step: 'connected' });
                            onConnected?.();
                        } else if (
                            result.status === 'expired_token' ||
                            result.status === 'access_denied'
                        ) {
                            stopPolling();
                            setState({
                                step: 'error',
                                message:
                                    result.status === 'expired_token'
                                        ? 'Code expired — try again'
                                        : 'Access denied',
                            });
                        }
                    } catch {
                        stopPolling();
                        setState({ step: 'error', message: 'Polling failed' });
                    }
                },
                (interval || 5) * 1000,
            );

            return { step: 'polling', userCode, verificationUri };
        });
    }, [pollDeviceFlow, onConnected, stopPolling]);

    const copyCode = useCallback(() => {
        if (state.step === 'showing_code' || state.step === 'polling') {
            void navigator.clipboard.writeText(state.userCode);
        }
    }, [state]);

    return { state, start, confirmAuthorized, copyCode, stopPolling };
}
