import { EncounterEvent } from '../encounter/types';

export function formatEncounterMessage(event: EncounterEvent): string {
  const peer = event.peer;
  return [
    `[Aura BLE encounter] A nearby agent was detected.`,
    `Claw ID: ${peer.clawId}`,
    `RSSI: ${peer.rssi} dBm`,
    `Flags: ${peer.flags.humanPresent ? 'human present' : 'no human'}${peer.flags.acceptingEncounters ? ', accepting encounters' : ''}`,
    `Intent hash: ${peer.intentHash.toString(16)}`,
  ].join('\n');
}
