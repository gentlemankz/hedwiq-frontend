"use client";

/**
 * Hook for LiveKit agenda stream handling
 *
 * Handles subscribing to and processing agenda events from LiveKit.
 */

import { useCallback, useEffect, type MutableRefObject } from "react";
import type { Room } from "livekit-client";
import { AGENDA_TOPIC } from "@/types/agenda";
import type { TextStreamReader, ParticipantInfo, AgendaProgressEvent } from "./types";
import { DEBUG } from "./constants";
import { isValidAgendaProgressEvent } from "./validators";

interface UseAgendaLiveKitProps {
  room: Room | undefined;
  isMountedRef: MutableRefObject<boolean>;
  processAgendaEvent: (event: AgendaProgressEvent, senderIdentity?: string) => void;
}

/**
 * Hook that handles LiveKit stream subscription for agenda events
 */
export function useAgendaLiveKit({
  room,
  isMountedRef,
  processAgendaEvent,
}: UseAgendaLiveKitProps) {
  /**
   * Handle incoming agenda stream from the agent
   */
  const handleAgendaStream = useCallback(
    async (reader: TextStreamReader, participantInfo: ParticipantInfo) => {
      try {
        const rawJson = await reader.readAll();
        if (!isMountedRef.current) return;

        let data: unknown;
        try {
          data = JSON.parse(rawJson);
        } catch {
          if (DEBUG) {
            console.error("[AgendaContext] Failed to parse JSON:", rawJson);
          }
          return;
        }

        // Validate event structure before processing
        if (!isValidAgendaProgressEvent(data)) {
          if (DEBUG) {
            console.error("[AgendaContext] Invalid event structure:", data);
          }
          return;
        }

        processAgendaEvent(data, participantInfo.identity);
      } catch (err) {
        if (DEBUG) {
          console.error("[AgendaContext] Failed to process agenda event:", err);
        }
      }
    },
    [isMountedRef, processAgendaEvent]
  );

  // Register text stream handler for agenda events
  useEffect(() => {
    if (!room) return;

    // Unregister first in case of React StrictMode double-mount
    try {
      room.unregisterTextStreamHandler(AGENDA_TOPIC);
    } catch {
      // Handler wasn't registered yet, ignore
    }

    try {
      room.registerTextStreamHandler(AGENDA_TOPIC, handleAgendaStream);
      if (DEBUG) {
        console.log(`[AgendaContext] Registered handler for topic: ${AGENDA_TOPIC}`);
      }
    } catch (err) {
      if (DEBUG) {
        console.warn("[AgendaContext] Failed to register agenda handler:", err);
      }
    }

    return () => {
      try {
        room.unregisterTextStreamHandler(AGENDA_TOPIC);
      } catch {
        // Already unregistered, ignore
      }
    };
  }, [room, handleAgendaStream]);

  return { handleAgendaStream };
}
