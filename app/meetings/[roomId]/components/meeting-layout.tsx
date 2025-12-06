"use client";

import { useState } from "react";
import { VideoConference } from "@livekit/components-react";
import {
  TranscriptionSidebar,
  TranscriptionErrorBoundary,
} from "@/components/transcription";
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
          <TranscriptionErrorBoundary>
            <TranscriptionSidebar onClose={() => setShowTranscription(false)} />
          </TranscriptionErrorBoundary>
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
          <FileText className="mr-2 size-4" />
          Transcription
        </Button>
      )}
    </div>
  );
}
