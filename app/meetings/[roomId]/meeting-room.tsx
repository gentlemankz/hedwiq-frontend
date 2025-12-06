"use client";

import { useState, useCallback } from "react";
import {
  LiveKitRoom,
  VideoConference,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { PreJoinScreen } from "./pre-join-screen";

interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

interface MeetingRoomProps {
  roomId: string;
  user: User;
}

export function MeetingRoom({ roomId, user }: MeetingRoomProps) {
  const [token, setToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch(`/api/livekit/token?room=${encodeURIComponent(roomId)}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to get token");
      }

      const data = await response.json();
      setToken(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join meeting");
      setIsConnecting(false);
    }
  }, [roomId]);

  const handleDisconnect = useCallback(() => {
    setToken(null);
    setIsConnecting(false);
  }, []);

  const handleError = useCallback((err: Error) => {
    console.error("LiveKit error:", err);
    setError(err.message);
  }, []);

  // Show pre-join screen if not connected
  if (!token) {
    return (
      <PreJoinScreen
        roomId={roomId}
        user={user}
        onJoin={handleJoin}
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
        // Don't auto-enable camera/mic - let user control via ControlBar
        // This avoids permission errors on connect
        video={false}
        audio={false}
        onDisconnected={handleDisconnect}
        onError={handleError}
        onMediaDeviceFailure={(failure) => {
          console.error("Media device failure:", failure);
          // Don't show alert - VideoConference handles this gracefully
          // User can still enable devices via the control bar
        }}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
