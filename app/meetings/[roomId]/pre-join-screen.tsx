"use client";

import { useCallback, useState } from "react";
import { LocalUserChoices } from "@livekit/components-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft, FileText, ChevronDown, ChevronUp, ListTodo } from "lucide-react";
import Link from "next/link";
import { useMediaDevices } from "@/hooks/use-media-devices";
import { sanitizeUsername } from "@/lib/validation";
import type { User } from "@/types/user";
import type { UploadedDocument } from "@/types/document";
import type { DraftAgendaItem } from "@/types/agenda";
import { VideoPreview } from "./components/video-preview";
import { MediaControls } from "./components/media-controls";
import { UsernameForm } from "./components/username-form";
import { DocumentUpload } from "@/components/documents";
import { AgendaBuilder } from "./components/agenda-builder";

// ============================================================================
// Types
// ============================================================================

export interface UserChoices extends LocalUserChoices {
  userId: string;
  userImage?: string | null;
  /** Documents uploaded before joining */
  uploadedDocuments?: UploadedDocument[];
  /** Agenda items created before joining */
  agendaItems?: DraftAgendaItem[];
  /** Agenda version for cache invalidation (set by meeting-room.tsx after publish) */
  agendaVersion?: number;
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

  // Document upload state
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [isDocumentSectionExpanded, setIsDocumentSectionExpanded] = useState(false);

  // Agenda state
  const [agendaItems, setAgendaItems] = useState<DraftAgendaItem[]>([]);
  const [isAgendaSectionExpanded, setIsAgendaSectionExpanded] = useState(false);

  // Handle document upload complete
  const handleDocumentUploadComplete = useCallback((doc: UploadedDocument) => {
    setUploadedDocuments((prev) => [...prev, doc]);
  }, []);

  // Handle document removal
  const handleRemoveDocument = useCallback(
    async (docId: string) => {
      try {
        await fetch(`/api/documents/${docId}?roomId=${encodeURIComponent(roomId)}`, {
          method: "DELETE",
        });
        setUploadedDocuments((prev) => prev.filter((d) => d.id !== docId));
      } catch (error) {
        console.error("Failed to remove document:", error);
      }
    },
    [roomId]
  );

  // Handle agenda items change
  const handleAgendaChange = useCallback((items: DraftAgendaItem[]) => {
    setAgendaItems(items);
  }, []);

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
        uploadedDocuments,
        agendaItems: agendaItems.length > 0 ? agendaItems : undefined,
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
      uploadedDocuments,
      agendaItems,
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

          {/* Meeting Agenda Section (Collapsible) */}
          <div className="border rounded-lg">
            <button
              type="button"
              onClick={() => setIsAgendaSectionExpanded(!isAgendaSectionExpanded)}
              className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ListTodo className="size-5 text-muted-foreground" />
                <div>
                  <span className="font-medium">Meeting Agenda</span>
                  {agendaItems.length > 0 && (
                    <span className="ml-2 text-sm text-muted-foreground">
                      ({agendaItems.length} topic{agendaItems.length !== 1 ? "s" : ""})
                    </span>
                  )}
                </div>
              </div>
              {isAgendaSectionExpanded ? (
                <ChevronUp className="size-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-5 text-muted-foreground" />
              )}
            </button>

            {isAgendaSectionExpanded && (
              <div className="border-t p-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Create an agenda to help structure your meeting. The AI will automatically
                  track topic progress during the meeting.
                </p>
                <AgendaBuilder
                  items={agendaItems}
                  onChange={handleAgendaChange}
                  disabled={isConnecting}
                />
              </div>
            )}
          </div>

          {/* Document Upload Section (Collapsible) */}
          <div className="border rounded-lg">
            <button
              type="button"
              onClick={() => setIsDocumentSectionExpanded(!isDocumentSectionExpanded)}
              className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText className="size-5 text-muted-foreground" />
                <div>
                  <span className="font-medium">Reference Documents</span>
                  {uploadedDocuments.length > 0 && (
                    <span className="ml-2 text-sm text-muted-foreground">
                      ({uploadedDocuments.length} uploaded)
                    </span>
                  )}
                </div>
              </div>
              {isDocumentSectionExpanded ? (
                <ChevronUp className="size-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-5 text-muted-foreground" />
              )}
            </button>

            {isDocumentSectionExpanded && (
              <div className="border-t p-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Upload PDF documents to enable real-time reference detection during the meeting.
                  The AI will automatically link spoken content to relevant document sections.
                </p>
                <DocumentUpload
                  roomId={roomId}
                  uploadedDocuments={uploadedDocuments}
                  onUploadComplete={handleDocumentUploadComplete}
                  onRemoveDocument={handleRemoveDocument}
                />
              </div>
            )}
          </div>

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
