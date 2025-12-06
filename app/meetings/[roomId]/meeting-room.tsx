"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { RoomOptions, VideoPresets } from "livekit-client";
import { PreJoinScreen, UserChoices } from "./pre-join-screen";
import { MeetingLayout } from "./components/meeting-layout";
import { InsightsProvider } from "@/contexts/insights-context";
import type { User } from "@/types/user";

interface MeetingRoomProps {
  roomId: string;
  user: User;
}

export function MeetingRoom({ roomId, user }: MeetingRoomProps) {
  const [token, setToken] = useState<string | null>(null);
  const [userChoices, setUserChoices] = useState<UserChoices | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use AbortController to cancel in-flight requests and prevent race conditions
  const abortControllerRef = useRef<AbortController | null>(null);

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
        // Use POST request to avoid sensitive data in URL
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

        // Only update state if this request wasn't aborted
        if (!abortController.signal.aborted) {
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

  const handleDisconnect = useCallback(() => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setToken(null);
    setUserChoices(null);
    setIsConnecting(false);
    setError(null);
  }, []);

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
        error={error}
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
        <InsightsProvider>
          <MeetingLayout showTranscription={true} />
        </InsightsProvider>
      </LiveKitRoom>
    </div>
  );
}
