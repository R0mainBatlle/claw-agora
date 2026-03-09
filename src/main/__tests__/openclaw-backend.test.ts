import { describe, expect, it, vi } from 'vitest';
import { OpenClawBackend } from '../agent/openclaw-backend';
import { ENCOUNTER_DELIVERY_PROMPT } from '../agent/prompts';
import type { EncounterEvent } from '../encounter/types';

function makeEncounterEvent(): EncounterEvent {
  return {
    type: 'encounter-update',
    timestamp: 1_700_000_000_000,
    peer: {
      peripheralId: 'peripheral-1',
      clawId: 'a1b2c3d4',
      intentHash: 0x12345678,
      flags: {
        acceptingEncounters: true,
        whisperCapable: true,
        humanPresent: true,
      },
      rssi: -58,
      firstSeen: 1_699_999_995_000,
      lastSeen: 1_700_000_000_000,
    },
  };
}

describe('OpenClawBackend', () => {
  it('sends encounter deliveries with the dedicated Aura encounter prompt', async () => {
    const sendRpc = vi.fn().mockResolvedValue({});
    const backend = new OpenClawBackend();
    (backend as any).bridge = {
      connected: true,
      sendRpc,
    };

    backend.deliverEncounter(makeEncounterEvent(), '[Aura BLE encounter] A nearby agent was detected.');

    await Promise.resolve();

    expect(sendRpc).toHaveBeenCalledWith('agent', {
      message: '[Aura BLE encounter] A nearby agent was detected.',
      agentId: 'main',
      idempotencyKey: 'aura-encounter-a1b2c3d4-1700000000000',
      sessionKey: 'aura-encounter',
      extraSystemPrompt: ENCOUNTER_DELIVERY_PROMPT,
    });
  });

  it('does not send encounters when the bridge is disconnected', () => {
    const sendRpc = vi.fn();
    const backend = new OpenClawBackend();
    (backend as any).bridge = {
      connected: false,
      sendRpc,
    };

    backend.deliverEncounter(makeEncounterEvent(), 'ignored');

    expect(sendRpc).not.toHaveBeenCalled();
  });
});
