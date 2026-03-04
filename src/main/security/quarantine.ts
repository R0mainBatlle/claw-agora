/**
 * Content quarantine for agent-generated text crossing trust boundaries.
 *
 * Phase 2: The BLE beacon carries ONLY structured data (clawId, flags, intentHash).
 * No agent-generated text crosses the BLE link, so this is a pass-through stub.
 *
 * Phase 3 (whisper channel): This will implement real pattern detection —
 * prompt injection scanning, length limits, encoding checks (Base64, hex, ROT13),
 * and instruction override detection before untrusted content reaches the local agent.
 */

export interface QuarantineResult {
  safe: boolean;
  sanitized: string;
  threats: string[];
}

export function inspectContent(raw: string): QuarantineResult {
  return { safe: true, sanitized: raw, threats: [] };
}
