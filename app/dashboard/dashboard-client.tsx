"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Plus, Loader2, AlertCircle, FolderClosed } from "lucide-react";
import { validateRoomId, sanitizeRoomId } from "@/lib/validation";
import {
  MeetingTypeSelector,
  ScheduleMeetingDialog,
  EditMeetingDialog,
  MeetingList,
  ManageInviteesDialog,
} from "@/components/meetings";
import { FolderSelect } from "@/components/folders";
import { useSidebarContext } from "@/contexts/sidebar-context";
import type { Meeting } from "@/types/meeting";
import type { CalendarEventPublic } from "@/types/calendar";

interface DashboardClientProps {
  initialMeetings?: Meeting[];
}

export function DashboardClient({
  initialMeetings = [],
}: DashboardClientProps) {
  const router = useRouter();
  const { folders, foldersLoading, defaultFolderId } = useSidebarContext();
  const [joinRoomId, setJoinRoomId] = useState("");
  const [roomIdError, setRoomIdError] = useState<string | null>(null);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [isNewMeetingDialogOpen, setIsNewMeetingDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [meetingToEdit, setMeetingToEdit] = useState<Meeting | null>(null);
  const [isManageInviteesDialogOpen, setIsManageInviteesDialogOpen] =
    useState(false);
  const [meetingForInvitees, setMeetingForInvitees] = useState<Meeting | null>(
    null
  );
  const [isCreatingInstant, setIsCreatingInstant] = useState(false);
  const [instantMeetingError, setInstantMeetingError] = useState<string | null>(
    null
  );
  const [instantMeetingFolderId, setInstantMeetingFolderId] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>(initialMeetings);
  const [calendarEvents, setCalendarEvents] = useState<
    Record<string, CalendarEventPublic>
  >({});

  // Initialize instant meeting folder when default folder becomes available
  useEffect(() => {
    if (defaultFolderId && instantMeetingFolderId === null) {
      setInstantMeetingFolderId(defaultFolderId);
    }
  }, [defaultFolderId, instantMeetingFolderId]);

  // Mounted state for hydration safety with Radix UI Dialog
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const handleInstantMeeting = async () => {
    if (isCreatingInstant) return;

    setIsCreatingInstant(true);
    setInstantMeetingError(null);

    try {
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Instant Meeting",
          type: "instant",
          folderId: instantMeetingFolderId || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create meeting");
      }

      const data = await response.json();
      const meeting = data.meeting as Meeting;

      setIsNewMeetingDialogOpen(false);
      // Reset folder to default after creating meeting
      setInstantMeetingFolderId(defaultFolderId);
      router.push(`/meetings/${meeting.roomId}`);
    } catch (error) {
      console.error("Failed to create instant meeting:", error);
      setInstantMeetingError(
        error instanceof Error
          ? error.message
          : "Failed to create meeting. Please try again."
      );
    } finally {
      setIsCreatingInstant(false);
    }
  };

  const handleScheduleMeeting = () => {
    setIsNewMeetingDialogOpen(false);
    setIsScheduleDialogOpen(true);
  };

  const handleRoomIdChange = (value: string) => {
    setJoinRoomId(value);
    if (roomIdError) {
      setRoomIdError(null);
    }
  };

  const handleJoinMeeting = () => {
    const trimmedId = joinRoomId.trim();
    if (!trimmedId) {
      setRoomIdError("Room ID is required");
      return;
    }

    const validation = validateRoomId(trimmedId);
    if (!validation.isValid) {
      setRoomIdError(validation.error || "Invalid room ID");
      return;
    }

    const sanitizedId = sanitizeRoomId(trimmedId, false);
    router.push(`/meetings/${sanitizedId}`);
    setIsJoinDialogOpen(false);
    setJoinRoomId("");
    setRoomIdError(null);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsJoinDialogOpen(open);
    if (!open) {
      setJoinRoomId("");
      setRoomIdError(null);
    }
  };

  const handleMeetingDeleted = () => {
    fetchMeetings();
  };

  const handleEditMeeting = (meeting: Meeting) => {
    setMeetingToEdit(meeting);
    setIsEditDialogOpen(true);
  };

  const handleMeetingUpdated = () => {
    fetchMeetings();
  };

  const handleManageInvitees = (meeting: Meeting) => {
    setMeetingForInvitees(meeting);
    setIsManageInviteesDialogOpen(true);
  };

  const handleInviteesUpdated = () => {
    fetchMeetings();
  };

  const fetchMeetings = async () => {
    try {
      const response = await fetch("/api/meetings?status=upcoming&limit=10");
      if (response.ok) {
        const data = await response.json();
        setMeetings(data.meetings);

        if (data.meetings.length > 0) {
          const meetingIds = data.meetings
            .map((m: Meeting) => m.id)
            .join(",");
          const eventsResponse = await fetch(
            `/api/calendar/events?meetingIds=${meetingIds}`
          );
          if (eventsResponse.ok) {
            const eventsData = await eventsResponse.json();
            setCalendarEvents(eventsData.events || {});
          }
        } else {
          setCalendarEvents({});
        }
      }
    } catch (error) {
      console.error("Failed to fetch meetings:", error);
    }
  };

  // Fetch calendar events on initial load
  useEffect(() => {
    if (initialMeetings.length === 0) return;

    let isCancelled = false;
    const controller = new AbortController();

    const fetchCalendarEvents = async () => {
      try {
        const meetingIds = initialMeetings.map((m) => m.id).join(",");
        const response = await fetch(
          `/api/calendar/events?meetingIds=${meetingIds}`,
          { signal: controller.signal }
        );
        if (!isCancelled && response.ok) {
          const data = await response.json();
          if (data.events) {
            setCalendarEvents(data.events);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("Failed to fetch calendar events:", err);
      }
    };

    fetchCalendarEvents();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [initialMeetings]);

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Home</h1>
          <p className="text-muted-foreground">
            Start a new meeting or manage your upcoming sessions
          </p>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Start a new meeting or join an existing one
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            {isMounted ? (
              <>
                {/* New Meeting Button */}
                <Dialog
                  open={isNewMeetingDialogOpen}
                  onOpenChange={(open) => {
                    setIsNewMeetingDialogOpen(open);
                    if (!open) {
                      setInstantMeetingError(null);
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="size-4" />
                      New Meeting
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>New Meeting</DialogTitle>
                      <DialogDescription>
                        Choose how you want to start your meeting
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                      {instantMeetingError && (
                        <Alert variant="destructive" className="mb-4">
                          <AlertCircle className="size-4" />
                          <AlertDescription>
                            {instantMeetingError}
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Folder Selection */}
                      <div className="grid gap-2">
                        <Label htmlFor="instant-meeting-folder" className="flex items-center gap-2">
                          <FolderClosed className="size-4" />
                          Save to Folder
                        </Label>
                        <FolderSelect
                          id="instant-meeting-folder"
                          value={instantMeetingFolderId}
                          onChange={setInstantMeetingFolderId}
                          folders={folders}
                          loading={foldersLoading}
                          disabled={isCreatingInstant}
                          placeholder="Select folder"
                          aria-label="Meeting folder"
                        />
                      </div>

                      <MeetingTypeSelector
                        onSelectInstant={handleInstantMeeting}
                        onSelectScheduled={handleScheduleMeeting}
                      />
                    </div>
                    {isCreatingInstant && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">
                          Creating meeting...
                        </span>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>

                {/* Join Meeting Button */}
                <Dialog
                  open={isJoinDialogOpen}
                  onOpenChange={handleDialogOpenChange}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Users className="size-4" />
                      Join Meeting
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Join a Meeting</DialogTitle>
                      <DialogDescription>
                        Enter the meeting room ID to join an existing meeting.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="roomId">Room ID</Label>
                        <Input
                          id="roomId"
                          placeholder="e.g., abc-defg-hij"
                          value={joinRoomId}
                          onChange={(e) => handleRoomIdChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleJoinMeeting();
                            }
                          }}
                          aria-invalid={!!roomIdError}
                          aria-describedby={
                            roomIdError ? "roomId-error" : undefined
                          }
                        />
                        {roomIdError && (
                          <p
                            id="roomId-error"
                            className="text-sm text-destructive"
                          >
                            {roomIdError}
                          </p>
                        )}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => handleDialogOpenChange(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleJoinMeeting}
                        disabled={!joinRoomId.trim()}
                      >
                        Join
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            ) : (
              <>
                <Button className="gap-2" disabled>
                  <Plus className="size-4" />
                  New Meeting
                </Button>
                <Button variant="outline" className="gap-2" disabled>
                  <Users className="size-4" />
                  Join Meeting
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Meetings */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Meetings</CardTitle>
            <CardDescription>Your scheduled and live meetings</CardDescription>
          </CardHeader>
          <CardContent>
            <MeetingList
              meetings={meetings}
              calendarEvents={calendarEvents}
              onEdit={handleEditMeeting}
              onDeleted={handleMeetingDeleted}
              onManageInvitees={handleManageInvitees}
              emptyMessage="No upcoming meetings. Click 'New Meeting' to create one."
            />
          </CardContent>
        </Card>

        {/* Schedule Meeting Dialog */}
        {isMounted && (
          <ScheduleMeetingDialog
            open={isScheduleDialogOpen}
            onOpenChange={(open) => {
              setIsScheduleDialogOpen(open);
              if (!open) {
                fetchMeetings();
              }
            }}
          />
        )}

        {/* Edit Meeting Dialog */}
        {isMounted && meetingToEdit && (
          <EditMeetingDialog
            open={isEditDialogOpen}
            onOpenChange={(open) => {
              setIsEditDialogOpen(open);
              if (!open) {
                setMeetingToEdit(null);
              }
            }}
            meeting={meetingToEdit}
            onUpdated={handleMeetingUpdated}
          />
        )}

        {/* Manage Invitees Dialog */}
        {isMounted && meetingForInvitees && (
          <ManageInviteesDialog
            open={isManageInviteesDialogOpen}
            onOpenChange={(open) => {
              setIsManageInviteesDialogOpen(open);
              if (!open) {
                setMeetingForInvitees(null);
              }
            }}
            meeting={meetingForInvitees}
            onInviteesUpdated={handleInviteesUpdated}
          />
        )}
      </div>
    </div>
  );
}
