"use client";

import { useCallback, useState, useMemo, useEffect, startTransition } from "react";
import { LocalUserChoices } from "@livekit/components-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, FileText, ChevronDown, ChevronUp, ListTodo, Calendar, Info } from "lucide-react";
import Link from "next/link";
import { useMediaDevices } from "@/hooks/use-media-devices";
import { sanitizeUsername } from "@/lib/validation";
import type { User } from "@/types/user";
import type { UploadedDocument } from "@/types/document";
import type { DraftAgendaItem, AgendaWithItems } from "@/types/agenda";
import type { Meeting } from "@/types/meeting";
import { VideoPreview } from "./components/video-preview";
import { MediaControls } from "./components/media-controls";
import { UsernameForm } from "./components/username-form";
import { DocumentUpload } from "@/components/documents";
import { AgendaBuilder } from "./components/agenda-builder";

/** Maximum length for meeting name */
const MAX_MEETING_NAME_LENGTH = 100;

/**
 * Formats a Date for datetime-local input (YYYY-MM-DDTHH:mm).
 * Returns empty string if date is invalid.
 */
function formatDateForInput(date: Date | null): string {
  if (!date || isNaN(date.getTime())) return "";
  // Use local time components to avoid timezone issues
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Parses a datetime-local input value to Date.
 * Returns null if invalid.
 */
function parseDateFromInput(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

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
  /** Meeting name/title */
  meetingName?: string;
  /** Scheduled meeting time */
  scheduledAt?: Date;
}

/**
 * Pre-loaded meeting data from API.
 * Used to pre-populate the pre-join form for scheduled meetings.
 */
export interface MeetingData {
  /** Meeting object if a scheduled meeting exists */
  meeting: Meeting | null;
  /** Agenda with items if it exists */
  agenda: AgendaWithItems | null;
  /** Pre-converted agenda items in draft format */
  initialAgendaItems?: DraftAgendaItem[];
}

interface PreJoinScreenProps {
  roomId: string;
  user: User;
  onSubmit: (choices: UserChoices) => void;
  isConnecting: boolean;
  isLoadingMeetingData?: boolean;
  error: string | null;
  /** Pre-loaded meeting data for scheduled meetings */
  meetingData?: MeetingData | null;
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
  isLoadingMeetingData = false,
  error,
  meetingData,
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

  // Meeting info state - initialize from meeting data if available
  const [meetingName, setMeetingName] = useState("");
  // Initialize with current date, but store as stable reference
  const [scheduledAt, setScheduledAt] = useState<Date | null>(() => new Date());

  // Track if we've initialized from meeting data
  const [initializedFromMeetingData, setInitializedFromMeetingData] = useState(false);

  // Memoize formatted date for input to prevent unnecessary re-renders
  const formattedScheduledAt = useMemo(
    () => formatDateForInput(scheduledAt),
    [scheduledAt]
  );

  // Handle date input change with validation
  const handleScheduledAtChange = useCallback((value: string) => {
    const parsed = parseDateFromInput(value);
    setScheduledAt(parsed);
  }, []);

  // Handle meeting name change with length validation
  const handleMeetingNameChange = useCallback((value: string) => {
    if (value.length <= MAX_MEETING_NAME_LENGTH) {
      setMeetingName(value);
    }
  }, []);

  // Document upload state
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [isDocumentSectionExpanded, setIsDocumentSectionExpanded] = useState(false);

  // Agenda state
  const [agendaItems, setAgendaItems] = useState<DraftAgendaItem[]>([]);
  const [isAgendaSectionExpanded, setIsAgendaSectionExpanded] = useState(false);

  // Initialize form from meeting data when it loads
  // Using startTransition to mark these updates as non-urgent (recommended pattern for async prop initialization)
  useEffect(() => {
    if (!initializedFromMeetingData && meetingData) {
      startTransition(() => {
        // Set meeting name from scheduled meeting
        if (meetingData.meeting?.title) {
          setMeetingName(meetingData.meeting.title);
        } else if (meetingData.agenda?.meetingName) {
          setMeetingName(meetingData.agenda.meetingName);
        }

        // Set scheduled time from meeting
        if (meetingData.meeting?.scheduledAt) {
          setScheduledAt(new Date(meetingData.meeting.scheduledAt));
        } else if (meetingData.agenda?.scheduledAt) {
          setScheduledAt(new Date(meetingData.agenda.scheduledAt));
        }

        // Set agenda items if they exist
        if (meetingData.initialAgendaItems && meetingData.initialAgendaItems.length > 0) {
          setAgendaItems(meetingData.initialAgendaItems);
          // Auto-expand agenda section if items exist
          setIsAgendaSectionExpanded(true);
        }

        setInitializedFromMeetingData(true);
      });
    }
  }, [meetingData, initializedFromMeetingData]);

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
        meetingName: meetingName.trim() || undefined,
        scheduledAt: scheduledAt ?? undefined,
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
      meetingName,
      scheduledAt,
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

          {/* Meeting Info Section */}
          <div className="space-y-4 border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Calendar className="size-5 text-muted-foreground" />
                <span className="font-medium">Meeting Details</span>
              </div>
              {meetingData?.meeting && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  Scheduled Meeting
                </span>
              )}
            </div>

            {isLoadingMeetingData ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="meeting-name">Meeting Name</Label>
                  <Input
                    id="meeting-name"
                    placeholder="e.g., Marketing Team Standup"
                    value={meetingName}
                    onChange={(e) => handleMeetingNameChange(e.target.value)}
                    disabled={isConnecting || !!meetingData?.meeting}
                    maxLength={MAX_MEETING_NAME_LENGTH}
                  />
                  {meetingName.length > 0 && !meetingData?.meeting && (
                    <p className="text-xs text-muted-foreground text-right">
                      {meetingName.length}/{MAX_MEETING_NAME_LENGTH}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scheduled-time">Scheduled Time</Label>
                  <Input
                    id="scheduled-time"
                    type="datetime-local"
                    value={formattedScheduledAt}
                    onChange={(e) => handleScheduledAtChange(e.target.value)}
                    disabled={isConnecting || !!meetingData?.meeting}
                  />
                </div>
              </div>
            )}
          </div>

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
                  {meetingData?.agenda && meetingData.agenda.status !== "draft" && (
                    <span className="ml-2 text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                      Published
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
                {isLoadingMeetingData ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (
                  <>
                    {meetingData?.meeting && (
                      <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950 p-3 text-xs text-blue-700 dark:text-blue-300 mb-4">
                        <Info className="size-4 shrink-0 mt-0.5" />
                        <p>
                          This agenda was created during meeting scheduling.
                          {meetingData.agenda?.status !== "draft"
                            ? " It has already been published and cannot be modified."
                            : " You can edit it before joining."}
                        </p>
                      </div>
                    )}
                    {!meetingData?.meeting && (
                      <p className="text-sm text-muted-foreground mb-4">
                        Create an agenda to help structure your meeting. The AI will automatically
                        track topic progress during the meeting.
                      </p>
                    )}
                    <AgendaBuilder
                      items={agendaItems}
                      onChange={handleAgendaChange}
                      disabled={isConnecting || (meetingData?.agenda?.status !== "draft" && meetingData?.agenda?.status !== undefined)}
                    />
                  </>
                )}
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
