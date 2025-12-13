"use client";

import * as React from "react";
import { LocalParticipant } from "livekit-client";
import type { Participant, Room } from "livekit-client";
import { encryptionStatusObservable } from "@livekit/components-core";
import {
  useEnsureParticipant,
  useEnsureRoom,
} from "@livekit/components-react";

/**
 * Options for the useIsEncrypted hook.
 */
export interface UseIsEncryptedOptions {
  room?: Room;
}

/**
 * Custom hook to observe encryption status of a participant.
 * Based on LiveKit's internal useIsEncrypted hook.
 *
 * @param participant - The participant to check encryption status for
 * @param options - Optional room reference
 * @returns Whether the participant's tracks are encrypted
 */
export function useIsEncrypted(
  participant?: Participant,
  options: UseIsEncryptedOptions = {}
): boolean {
  const p = useEnsureParticipant(participant);
  const room = useEnsureRoom(options.room);

  const [isEncrypted, setIsEncrypted] = React.useState<boolean>(() => {
    if (p.isLocal) {
      return (p as LocalParticipant).isE2EEEnabled;
    }
    return !!p?.isEncrypted;
  });

  React.useEffect(() => {
    const observable = encryptionStatusObservable(room, p);
    const subscription = observable.subscribe(setIsEncrypted);
    return () => subscription.unsubscribe();
  }, [room, p]);

  return isEncrypted;
}
