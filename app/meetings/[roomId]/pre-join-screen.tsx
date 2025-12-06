"use client";

import { useCallback } from "react";
import { LocalUserChoices } from "@livekit/components-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useMediaDevices } from "@/hooks/use-media-devices";
import { sanitizeUsername } from "@/lib/validation";
import type { User } from "@/types/user";
import { VideoPreview } from "./components/video-preview";
import { MediaControls } from "./components/media-controls";
import { UsernameForm } from "./components/username-form";

// ============================================================================
// Types
// ============================================================================

export interface UserChoices extends LocalUserChoices {
  userId: string;
  userImage?: string | null;
}

interface PreJoinScreenProps {
  roomId: string;
  user: User;
  onSubmit: (choices: UserChoices) => void;
  isConnecting: boolean;
  error: string | null;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Pre-join screen for configuring media devices before joining a meeting.
 * Split into subcomponents for better maintainability:
 * - VideoPreview: Camera feed preview
 * - MediaControls: Camera/mic toggle buttons and device selectors
 * - UsernameForm: Display name input and join button
 */
export function PreJoinScreen({
  roomId,
  user,
  onSubmit,
  isConnecting,
  error,
}: PreJoinScreenProps) {
  // Use custom hook for media device management
  const {
    videoEnabled,
    videoStream,
    videoDevices,
    selectedVideoDevice,
    audioEnabled,
    audioDevices,
    selectedAudioDevice,
    toggleVideo,
    toggleAudio,
    setSelectedVideoDevice,
    setSelectedAudioDevice,
    permissionError,
    isTogglingVideo,
    isTogglingAudio,
    stopAllStreams,
  } = useMediaDevices();

  // Handle form submission - combines username with device settings
  const handleUsernameSubmit = useCallback(
    (username: string) => {
      // Stop preview stream before joining
      stopAllStreams();

      onSubmit({
        username: sanitizeUsername(username),
        videoEnabled,
        audioEnabled,
        videoDeviceId: selectedVideoDevice,
        audioDeviceId: selectedAudioDevice,
        userId: user.id,
        userImage: user.image,
      });
    },
    [
      videoEnabled,
      audioEnabled,
      selectedVideoDevice,
      selectedAudioDevice,
      user.id,
      user.image,
      stopAllStreams,
      onSubmit,
    ]
  );

  // Combine error messages - show only one at a time
  const displayError = error || permissionError;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      {/* Header with room info and back button */}
      <div className="mb-6 flex w-full max-w-2xl items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="mr-2 size-4" />
            Back to Dashboard
          </Link>
        </Button>
        <div className="text-sm text-muted-foreground">
          Room: <span className="font-mono font-medium">{roomId}</span>
        </div>
      </div>

      {/* Error messages */}
      {displayError && (
        <Alert variant="destructive" className="mb-4 w-full max-w-2xl">
          <AlertCircle className="size-4" />
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      )}

      {/* Main PreJoin Card */}
      <div className="w-full max-w-2xl rounded-lg border bg-card p-6 shadow-sm">
        <div className="space-y-6">
          {/* Video Preview */}
          <VideoPreview videoEnabled={videoEnabled} videoStream={videoStream} />

          {/* Media Controls */}
          <MediaControls
            videoEnabled={videoEnabled}
            videoDevices={videoDevices}
            selectedVideoDevice={selectedVideoDevice}
            isTogglingVideo={isTogglingVideo}
            onToggleVideo={toggleVideo}
            onVideoDeviceChange={setSelectedVideoDevice}
            audioEnabled={audioEnabled}
            audioDevices={audioDevices}
            selectedAudioDevice={selectedAudioDevice}
            isTogglingAudio={isTogglingAudio}
            onToggleAudio={toggleAudio}
            onAudioDeviceChange={setSelectedAudioDevice}
          />

          {/* Username Input and Join Button */}
          <UsernameForm
            initialUsername={user.name}
            isConnecting={isConnecting}
            isValid={true}
            onSubmit={handleUsernameSubmit}
          />
        </div>
      </div>

      {/* User info hint */}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Joining as <span className="font-medium">{user.email}</span>
      </p>
    </div>
  );
}
