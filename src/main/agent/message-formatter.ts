import { EncounterEvent } from '../encounter/types';

export function formatEncounterMessage(event: EncounterEvent): string {
  const peer = event.peer;
  const distance =
    peer.rssi >= -50 ? '~1-2m' : peer.rssi >= -65 ? '~3-5m' : '~5-10m';

  return [
    `[Aura BLE encounter] A nearby agent was detected.`,
    `Claw ID: ${peer.clawId}`,
    `Estimated distance: ${distance} (RSSI: ${peer.rssi} dBm)`,
    `Flags: ${peer.flags.humanPresent ? 'human present' : 'no human'}${peer.flags.acceptingEncounters ? ', accepting encounters' : ''}`,
    `Intent hash: ${peer.intentHash.toString(16)}`,
  ].join('\n');
}
