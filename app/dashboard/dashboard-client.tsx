"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Users, Plus, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { validateRoomId, sanitizeRoomId } from "@/lib/validation";
import { getInitials } from "@/lib/utils";
import {
  MeetingTypeSelector,
  ScheduleMeetingDialog,
  MeetingList,
} from "@/components/meetings";
import { CalendarStatusCard } from "@/components/calendar";
import type { User } from "@/types/user";
import type { Meeting } from "@/types/meeting";
import type { CalendarStatusResponse } from "@/types/calendar";

interface DashboardClientProps {
  user: User;
  initialMeetings?: Meeting[];
  initialCalendarStatus?: CalendarStatusResponse;
}

export function DashboardClient({
  user,
  initialMeetings = [],
  initialCalendarStatus,
}: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [joinRoomId, setJoinRoomId] = useState("");
  const [roomIdError, setRoomIdError] = useState<string | null>(null);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [isNewMeetingDialogOpen, setIsNewMeetingDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isCreatingInstant, setIsCreatingInstant] = useState(false);
  const [instantMeetingError, setInstantMeetingError] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>(initialMeetings);

  // Calendar OAuth feedback from URL params
  const [calendarMessage, setCalendarMessage] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Handle calendar OAuth callback params
  useEffect(() => {
    const calendarConnected = searchParams.get("calendar_connected");
    const calendarError = searchParams.get("calendar_error");

    if (calendarConnected === "true") {
      setCalendarMessage({
        type: "success",
        message: "Google Calendar connected successfully!",
      });
      // Clean up URL params
      router.replace("/dashboard", { scroll: false });
    } else if (calendarError) {
      setCalendarMessage({
        type: "error",
        message: calendarError,
      });
      // Clean up URL params
      router.replace("/dashboard", { scroll: false });
    }
  }, [searchParams, router]);

  // Auto-dismiss calendar message after 5 seconds
  useEffect(() => {
    if (!calendarMessage) {
      return;
    }

    // Store the current message for comparison in cleanup
    const currentMessage = calendarMessage;
    const timer = setTimeout(() => {
      // Only clear if the message hasn't changed
      setCalendarMessage((prev) =>
        prev === currentMessage ? null : prev
      );
    }, 5000);

    return () => clearTimeout(timer);
  }, [calendarMessage]);

  // Mounted state for hydration safety with Radix UI Dialog
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/sign-in";
        },
      },
    });
  };

  const handleInstantMeeting = async () => {
    // Prevent double-clicks
    if (isCreatingInstant) return;

    setIsCreatingInstant(true);
    setInstantMeetingError(null);

    try {
      // Create meeting via API
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Instant Meeting",
          type: "instant",
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create meeting");
      }

      const data = await response.json();
      const meeting = data.meeting as Meeting;

      // Navigate to the meeting room
      setIsNewMeetingDialogOpen(false);
      router.push(`/meetings/${meeting.roomId}`);
    } catch (error) {
      console.error("Failed to create instant meeting:", error);
      // Show error to user instead of creating orphan room
      setInstantMeetingError(
        error instanceof Error ? error.message : "Failed to create meeting. Please try again."
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
    // Refresh meetings list
    fetchMeetings();
  };

  const fetchMeetings = async () => {
    try {
      const response = await fetch("/api/meetings?status=upcoming&limit=10");
      if (response.ok) {
        const data = await response.json();
        setMeetings(data.meetings);
      }
    } catch (error) {
      console.error("Failed to fetch meetings:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <Button variant="outline" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>

        {/* Calendar OAuth Feedback */}
        {calendarMessage && (
          <Alert
            variant={calendarMessage.type === "error" ? "destructive" : "default"}
            className={
              calendarMessage.type === "success"
                ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                : undefined
            }
          >
            {calendarMessage.type === "success" ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <AlertCircle className="size-4" />
            )}
            <AlertDescription>{calendarMessage.message}</AlertDescription>
          </Alert>
        )}

        {/* Welcome Card */}
        <Card>
          <CardHeader>
            <CardTitle>Welcome back!</CardTitle>
            <CardDescription>
              You are signed in and ready to start your meetings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                <AvatarImage src={user.image || undefined} alt={user.name} />
                <AvatarFallback className="text-lg">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-lg font-medium">{user.name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Start a new meeting or join an existing one
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4">
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
                    <div className="py-4">
                      {instantMeetingError && (
                        <Alert variant="destructive" className="mb-4">
                          <AlertCircle className="size-4" />
                          <AlertDescription>{instantMeetingError}</AlertDescription>
                        </Alert>
                      )}
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

        {/* Calendar Integration */}
        <CalendarStatusCard
          initialConnected={initialCalendarStatus?.connected}
          initialIntegration={initialCalendarStatus?.integration}
        />

        {/* Upcoming Meetings */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Meetings</CardTitle>
            <CardDescription>
              Your scheduled and live meetings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MeetingList
              meetings={meetings}
              onDeleted={handleMeetingDeleted}
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
                // Refresh meetings when dialog closes
                fetchMeetings();
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
