import { EncounterEvent } from './types';
import { EncounterPolicyConfig } from '../store/settings';

export interface PolicyDecision {
  allow: boolean;
  reason?: string;
}

export class EncounterPolicy {
  private config: EncounterPolicyConfig;
  private lastNotified = new Map<string, number>(); // clawId -> timestamp
  private pendingDwell = new Map<string, EncounterEvent>(); // clawId -> first encounter-start
  private hourlyCount = 0;
  private hourlyResetAt = 0;

  constructor(config: EncounterPolicyConfig) {
    this.config = { ...config };
  }

  evaluate(event: EncounterEvent): PolicyDecision {
    if (!this.config.enabled) {
      return { allow: false, reason: 'policy-disabled' };
    }

    const clawId = event.peer.clawId;

    // Handle encounter-end: clean up pending dwell, never deliver
    if (event.type === 'encounter-end') {
      this.pendingDwell.delete(clawId);
      return { allow: false, reason: 'encounter-end' };
    }

    // encounter-start: start dwell tracking
    if (event.type === 'encounter-start') {
      if (this.config.minDwellMs <= 0) {
        // No dwell required — evaluate immediately
        return this.evaluateFilters(event);
      }
      this.pendingDwell.set(clawId, event);
      return { allow: false, reason: 'dwell-pending' };
    }

    // encounter-update: check if dwell period has elapsed
    if (event.type === 'encounter-update') {
      const pending = this.pendingDwell.get(clawId);
      if (!pending) {
        return { allow: false, reason: 'already-delivered-or-no-start' };
      }
      const elapsed = event.timestamp - pending.peer.firstSeen;
      if (elapsed < this.config.minDwellMs) {
        return { allow: false, reason: 'dwell-pending' };
      }
      // Dwell satisfied — remove from pending and evaluate
      this.pendingDwell.delete(clawId);
      return this.evaluateFilters(event);
    }

    return { allow: false, reason: 'unknown-event-type' };
  }

  private evaluateFilters(event: EncounterEvent): PolicyDecision {
    const peer = event.peer;
    const now = Date.now();

    // RSSI filter
    if (peer.rssi < this.config.minRssi) {
      return { allow: false, reason: 'rssi-too-low' };
    }

    // Human present filter
    if (this.config.requireHumanPresent && !peer.flags.humanPresent) {
      return { allow: false, reason: 'no-human-present' };
    }

    // Per-clawId cooldown
    const lastTime = this.lastNotified.get(peer.clawId);
    if (lastTime && now - lastTime < this.config.cooldownMs) {
      return { allow: false, reason: 'cooldown' };
    }

    // Hourly rate limit
    if (now > this.hourlyResetAt) {
      this.hourlyCount = 0;
      this.hourlyResetAt = now + 3600_000;
    }
    if (this.hourlyCount >= this.config.maxPerHour) {
      return { allow: false, reason: 'rate-limited' };
    }

    // All filters passed
    this.lastNotified.set(peer.clawId, now);
    this.hourlyCount++;
    return { allow: true };
  }

  updateConfig(partial: Partial<EncounterPolicyConfig>): void {
    Object.assign(this.config, partial);
  }

  getConfig(): EncounterPolicyConfig {
    return { ...this.config };
  }
}
