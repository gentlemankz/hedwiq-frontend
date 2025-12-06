"use client";

import { useState } from "react";
import {
  VideoConference,
  ControlBar,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useRoomContext,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { TranscriptionSidebar } from "@/components/transcription";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface MeetingLayoutProps {
  showTranscription?: boolean;
}

export function MeetingLayout({
  showTranscription: initialShowTranscription = true,
}: MeetingLayoutProps) {
  const [showTranscription, setShowTranscription] = useState(
    initialShowTranscription
  );

  return (
    <div className="flex h-full">
      {/* Main video area */}
      <div className={cn("flex-1 transition-all", showTranscription && "mr-80")}>
        <VideoConference />
      </div>

      {/* Transcription sidebar */}
      {showTranscription && (
        <div className="fixed right-0 top-0 bottom-0 w-80 z-50">
          <TranscriptionSidebar onClose={() => setShowTranscription(false)} />
        </div>
      )}

      {/* Toggle button when sidebar is hidden */}
      {!showTranscription && (
        <Button
          variant="secondary"
          size="sm"
          className="fixed right-4 top-4 z-50 shadow-lg"
          onClick={() => setShowTranscription(true)}
        >
          <FileText className="mr-2 h-4 w-4" />
          Transcription
        </Button>
      )}
    </div>
  );
}

/**
 * Alternative custom layout with more control over the video grid
 * Use this if you need custom participant tile rendering
 */
export function CustomMeetingLayout() {
  const [showTranscription, setShowTranscription] = useState(true);
  const room = useRoomContext();

  // Get all camera and screen share tracks
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  return (
    <div className="flex h-full bg-background">
      {/* Main content area */}
      <div
        className={cn(
          "flex flex-1 flex-col transition-all",
          showTranscription && "mr-80"
        )}
      >
        {/* Video grid */}
        <div className="flex-1 p-4">
          <GridLayout tracks={tracks}>
            <ParticipantTile />
          </GridLayout>
        </div>

        {/* Control bar */}
        <ControlBar
          variation="minimal"
          controls={{
            camera: true,
            microphone: true,
            screenShare: true,
            leave: true,
            chat: false,
            settings: true,
          }}
        />

        {/* Audio renderer (handles audio playback for all participants) */}
        <RoomAudioRenderer />
      </div>

      {/* Transcription sidebar */}
      {showTranscription && (
        <div className="fixed right-0 top-0 bottom-0 w-80 z-50">
          <TranscriptionSidebar onClose={() => setShowTranscription(false)} />
        </div>
      )}

      {/* Toggle button when sidebar is hidden */}
      {!showTranscription && (
        <Button
          variant="secondary"
          size="sm"
          className="fixed right-4 top-4 z-50 shadow-lg"
          onClick={() => setShowTranscription(true)}
        >
          <FileText className="mr-2 h-4 w-4" />
          Show Transcription
        </Button>
      )}
    </div>
  );
}
