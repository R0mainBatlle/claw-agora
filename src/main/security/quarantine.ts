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

function withGlobal(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
}

function findSuspiciousBase64Blocks(input: string): string[] {
  const candidates = input.match(/[A-Za-z0-9+/=]{50,}/g) || [];
  return candidates.filter((candidate) => {
    const normalized = candidate.replace(/=+$/, '');
    const validLength = candidate.length % 4 === 0;
    const mixedCase = /[A-Z]/.test(normalized) && /[a-z]/.test(normalized);
    const hasNonAlpha = /[0-9+/]/.test(normalized) || /=/.test(candidate);
    return validLength && mixedCase && hasNonAlpha;
  });
}

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
        sanitized = sanitized.replace(withGlobal(pattern), '[redacted-instruction]');
      }
    }
  }

  // Encoding obfuscation (potential hidden payloads)
  if (cfg.checkEncodings) {
    const hexPattern = /[0-9a-fA-F]{64,}/g;

    const base64Blocks = findSuspiciousBase64Blocks(sanitized);
    if (base64Blocks.length > 0) {
      threats.push('encoding: possible base64 block');
      for (const block of base64Blocks) {
        sanitized = sanitized.replaceAll(block, '[redacted-encoded-data]');
      }
    }
    if (hexPattern.test(sanitized)) {
      threats.push('encoding: possible hex-encoded data');
      sanitized = sanitized.replace(hexPattern, '[redacted-encoded-data]');
    }
  }

  // Instruction override attempts
  if (cfg.checkInstructionOverride) {
    for (const pattern of OVERRIDE_PATTERNS) {
      if (pattern.test(sanitized)) {
        threats.push(`instruction-override: ${pattern.source}`);
        sanitized = sanitized.replace(withGlobal(pattern), '[redacted-instruction]');
      }
    }
  }

  sanitized = sanitized
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (threats.length > 0 && sanitized.length === 0) {
    sanitized = '[content removed by quarantine]';
  }

  return {
    safe: threats.length === 0,
    sanitized,
    threats,
  };
}
