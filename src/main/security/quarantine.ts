/**
 * Content quarantine for agent-generated text crossing trust boundaries.
 * Scans for prompt injection, encoding obfuscation, and instruction overrides.
 */

export interface QuarantineResult {
  safe: boolean;
  sanitized: string;
  threats: string[];
}

export interface QuarantineConfig {
  maxLength: number;
  checkPromptInjection: boolean;
  checkEncodings: boolean;
  checkInstructionOverride: boolean;
}

const DEFAULT_CONFIG: QuarantineConfig = {
  maxLength: 1024,
  checkPromptInjection: true,
  checkEncodings: true,
  checkInstructionOverride: true,
};

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+/i,
  /system\s*:\s*/i,
  /\bDAN\b.*\bmode\b/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /\bact\s+as\b.*\bno\s+restrictions\b/i,
  /\bpretend\s+(you('re|are)\s+)?/i,
  /\brole\s*play\s+as\b/i,
  /\bjailbreak/i,
];

const OVERRIDE_PATTERNS: RegExp[] = [
  /forget\s+(everything|all|your)\s/i,
  /new\s+instructions?\s*:/i,
  /override\s+(your|the)\s/i,
  /disregard\s+(your|all|the)\s/i,
  /from\s+now\s+on\s+you\s/i,
];

export function inspectContent(raw: string, config?: Partial<QuarantineConfig>): QuarantineResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const threats: string[] = [];
  let sanitized = raw;

  // Length check
  if (sanitized.length > cfg.maxLength) {
    sanitized = sanitized.substring(0, cfg.maxLength);
    threats.push(`truncated: exceeded ${cfg.maxLength} chars`);
  }

  // Prompt injection patterns
  if (cfg.checkPromptInjection) {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        threats.push(`prompt-injection: ${pattern.source}`);
      }
    }
  }

  // Encoding obfuscation (potential hidden payloads)
  if (cfg.checkEncodings) {
    if (/[A-Za-z0-9+/]{50,}={0,2}/.test(sanitized)) {
      threats.push('encoding: possible base64 block');
    }
    if (/[0-9a-fA-F]{64,}/.test(sanitized)) {
      threats.push('encoding: possible hex-encoded data');
    }
  }

  // Instruction override attempts
  if (cfg.checkInstructionOverride) {
    for (const pattern of OVERRIDE_PATTERNS) {
      if (pattern.test(sanitized)) {
        threats.push(`instruction-override: ${pattern.source}`);
      }
    }
  }

  return {
    safe: threats.length === 0,
    sanitized,
    threats,
  };
}
