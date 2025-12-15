"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { RoomOptions, VideoPresets } from "livekit-client";
import { PreJoinScreen, UserChoices, MeetingData } from "./pre-join-screen";
import { MeetingLayout } from "./components/meeting-layout";
import { InsightsProvider } from "@/contexts/insights-context";
import { DocumentsProvider } from "@/contexts/documents-context";
import { MeetingPersistenceProvider } from "@/contexts/meeting-persistence-context";
import { agendaItemsToDraft } from "@/lib/utils/meeting-form";
import type { User } from "@/types/user";
import type { AgendaItemInput, AgendaPublishResponse } from "@/types/agenda";

interface MeetingRoomProps {
  roomId: string;
  user: User;
}

export function MeetingRoom({ roomId, user }: MeetingRoomProps) {
  const [token, setToken] = useState<string | null>(null);
  const [userChoices, setUserChoices] = useState<UserChoices | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Meeting data loaded from API
  const [meetingData, setMeetingData] = useState<MeetingData | null>(null);
  const [isLoadingMeetingData, setIsLoadingMeetingData] = useState(true);

  // Use AbortController to cancel in-flight requests and prevent race conditions
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch meeting data on mount
  useEffect(() => {
    async function fetchMeetingData() {
      try {
        const response = await fetch(`/api/rooms/${roomId}/meeting`);
        if (response.ok) {
          const data = await response.json();

          // Convert agenda items to draft format using shared utility
          const initialAgendaItems = agendaItemsToDraft(data.agenda);

          setMeetingData({
            meeting: data.meeting,
            agenda: data.agenda,
            initialAgendaItems:
              initialAgendaItems.length > 0 ? initialAgendaItems : undefined,
          });
        }
      } catch (err) {
        console.error("Failed to fetch meeting data:", err);
        // Don't set error - meeting data is optional
      } finally {
        setIsLoadingMeetingData(false);
      }
    }

    fetchMeetingData();
  }, [roomId]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handlePreJoinSubmit = useCallback(
    async (choices: UserChoices) => {
      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsConnecting(true);
      setError(null);
      setUserChoices(choices);

      try {
        // Join Sequencing (Critical - see AGENDA_FEATURE_PLAN.md):
        // 1. Save agenda (if items exist)
        // 2. Publish agenda (lock it in)
        // 3. Request token (only after agenda is published)
        // 4. Connect to LiveKit
        // This order ensures the agent can fetch the agenda when it joins.

        // Track agenda version from server response (for cache invalidation)
        let agendaVersion: number | undefined;

        // Step 1 & 2: Save and publish agenda if items exist
        // Note: If user has no agenda items but room has an existing agenda,
        // we leave it intact. The user can still join without modifying
        // the existing agenda. This supports late joiners and users who
        // intentionally skip agenda creation.
        if (choices.agendaItems && choices.agendaItems.length > 0) {
          // Convert DraftAgendaItem[] to AgendaItemInput[]
          const agendaItems: AgendaItemInput[] = choices.agendaItems.map((item) => ({
            title: item.title,
            description: item.description,
            estimatedDuration: item.estimatedDuration,
            presenter: item.presenter,
          }));

          // Step 1: Save agenda (PUT /api/rooms/[roomId]/agenda)
          const saveResponse = await fetch(`/api/rooms/${roomId}/agenda`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              items: agendaItems,
              meetingName: choices.meetingName,
              scheduledAt: choices.scheduledAt?.toISOString(),
            }),
            signal: abortController.signal,
          });

          if (!saveResponse.ok) {
            const data = await saveResponse.json();
            throw new Error(data.error || "Failed to save agenda");
          }

          // Step 2: Publish agenda (POST /api/rooms/[roomId]/agenda/publish)
          const publishResponse = await fetch(`/api/rooms/${roomId}/agenda/publish`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            signal: abortController.signal,
          });

          if (!publishResponse.ok) {
            const data = await publishResponse.json();
            throw new Error(data.error || "Failed to publish agenda");
          }

          // Capture agenda version for cache invalidation
          const publishData: AgendaPublishResponse = await publishResponse.json();
          agendaVersion = publishData.agenda.version;
        }

        // Step 3: Request token (POST /api/livekit/token)
        const response = await fetch("/api/livekit/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            room: roomId,
            username: choices.username,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to get token");
        }

        const data = await response.json();

        // Step 4: Only update state if this request wasn't aborted
        // (LiveKit connection happens via state update triggering LiveKitRoom)
        if (!abortController.signal.aborted) {
          // Update choices with agenda version for cache invalidation
          setUserChoices({
            ...choices,
            agendaVersion,
          });
          setToken(data.token);
          setIsConnecting(false);
        }
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        setError(err instanceof Error ? err.message : "Failed to join meeting");
        setUserChoices(null);
        setIsConnecting(false);
      }
    },
    [roomId]
  );

  const handleDisconnect = useCallback(async () => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // End the meeting if the current user is the host and meeting is live
    // This updates the database status from "live" to "ended"
    if (
      meetingData?.meeting &&
      meetingData.meeting.hostId === user.id &&
      meetingData.meeting.status === "live"
    ) {
      try {
        await fetch(`/api/meetings/${meetingData.meeting.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "ended" }),
        });
      } catch (err) {
        // Log error but don't block disconnect flow
        console.error("Failed to end meeting:", err);
      }
    }

    setToken(null);
    setUserChoices(null);
    setIsConnecting(false);
    setError(null);
  }, [meetingData, user.id]);

  // Handle LiveKit errors - clear token to return to PreJoin screen
  const handleError = useCallback((err: Error) => {
    console.error("LiveKit error:", err);
    setError(err.message);
    // Clear token and choices to return to PreJoin screen so user can retry
    setToken(null);
    setUserChoices(null);
    setIsConnecting(false);
  }, []);

  // Configure room options based on user's device selections
  // Handle empty string deviceId by converting to undefined
  const roomOptions = useMemo((): RoomOptions => {
    // Helper to convert empty string to undefined
    const normalizeDeviceId = (id: string | undefined): string | undefined => {
      return id && id.length > 0 ? id : undefined;
    };

    return {
      videoCaptureDefaults: {
        deviceId: normalizeDeviceId(userChoices?.videoDeviceId),
        resolution: VideoPresets.h720,
      },
      audioCaptureDefaults: {
        deviceId: normalizeDeviceId(userChoices?.audioDeviceId),
      },
      adaptiveStream: true,
      dynacast: true,
    };
  }, [userChoices]);

  // Show pre-join screen if not connected
  if (!token || !userChoices) {
    return (
      <PreJoinScreen
        roomId={roomId}
        user={user}
        onSubmit={handlePreJoinSubmit}
        isConnecting={isConnecting}
        isLoadingMeetingData={isLoadingMeetingData}
        error={error}
        meetingData={meetingData}
      />
    );
  }

  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!livekitUrl) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-destructive">LiveKit URL not configured</p>
      </div>
    );
  }

  return (
    <div data-lk-theme="default" className="h-screen">
      <LiveKitRoom
        token={token}
        serverUrl={livekitUrl}
        connect={true}
        options={roomOptions}
        // Use the device settings from PreJoin
        video={userChoices.videoEnabled}
        audio={userChoices.audioEnabled}
        onDisconnected={handleDisconnect}
        onError={handleError}
        onMediaDeviceFailure={(failure) => {
          console.error("Media device failure:", failure);
        }}
      >
        <MeetingPersistenceProvider
          meetingId={meetingData?.meeting?.id ?? null}
          roomId={roomId}
          enabled={true}
        >
          <InsightsProvider>
            <DocumentsProvider initialDocuments={userChoices.uploadedDocuments}>
              <MeetingLayout
                showTranscription={true}
                agendaVersion={userChoices.agendaVersion}
                roomId={roomId}
                meetingName={userChoices.meetingName}
                meetingScheduledAt={userChoices.scheduledAt}
              />
            </DocumentsProvider>
          </InsightsProvider>
        </MeetingPersistenceProvider>
      </LiveKitRoom>
    </div>
  );
}
