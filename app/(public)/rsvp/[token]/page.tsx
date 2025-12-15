"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RSVPStatus } from "@/types/invitee";

// ============================================================================
// Types
// ============================================================================

interface InviteeInfo {
  email: string;
  name: string | null;
  status: RSVPStatus;
  respondedAt: string | null;
}

interface MeetingInfo {
  id: string;
  title: string;
  roomId: string;
  scheduledAt: string | null;
  durationMinutes: number;
}

// ============================================================================
// Component
// ============================================================================

export default function RSVPPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitee, setInvitee] = useState<InviteeInfo | null>(null);
  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Check for status in URL (from email link)
  const urlStatus = searchParams.get("status") as RSVPStatus | null;

  // Fetch invitation data
  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    async function fetchInvitation() {
      try {
        const res = await fetch(`/api/rsvp/${token}`, {
          signal: abortController.signal,
        });
        const data = await res.json();

        if (!isMounted) return;

        if (!res.ok) {
          setError(data.error || "Failed to load invitation");
          return;
        }

        setInvitee(data.invitee);
        setMeeting(data.meeting);

        // If status is in URL and hasn't been submitted yet, auto-submit
        // Only auto-submit if still mounted to prevent race condition
        if (urlStatus && data.invitee.status === "pending" && isMounted) {
          // Submit RSVP without waiting in the effect
          submitRsvpWithToken(urlStatus, token);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (!isMounted) return;
        console.error("Fetch invitation error:", err);
        setError("Failed to load invitation");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchInvitation();

    return () => {
      isMounted = false;
      abortController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Helper for auto-submit from URL - doesn't block the effect
  const submitRsvpWithToken = async (status: RSVPStatus, rsvpToken: string) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/rsvp/${rsvpToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to update RSVP");
        return;
      }

      setInvitee(data.invitee);
      setSubmitted(true);
    } catch (err) {
      console.error("Submit RSVP error:", err);
      setError("Failed to update RSVP");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitRsvp = async (status: RSVPStatus) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/rsvp/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to update RSVP");
        return;
      }

      setInvitee(data.invitee);
      setSubmitted(true);
    } catch (err) {
      console.error("Submit RSVP error:", err);
      setError("Failed to update RSVP");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (error && !invitee) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">
              Invitation Not Found
            </CardTitle>
            <CardDescription>
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This invitation link may have expired or been removed.
              Please contact the meeting organizer for a new invitation.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!meeting || !invitee) {
    return null;
  }

  const meetingDate = meeting.scheduledAt
    ? new Date(meeting.scheduledAt)
    : null;
  const endTime = meetingDate
    ? new Date(meetingDate.getTime() + meeting.durationMinutes * 60 * 1000)
    : null;

  const meetingLink = `${window.location.origin}/meetings/${meeting.roomId}`;

  const statusConfig: Record<
    RSVPStatus,
    { label: string; icon: typeof CheckCircle2; color: string }
  > = {
    pending: {
      label: "Awaiting Response",
      icon: HelpCircle,
      color: "text-muted-foreground",
    },
    accepted: {
      label: "Accepted",
      icon: CheckCircle2,
      color: "text-green-600",
    },
    declined: {
      label: "Declined",
      icon: XCircle,
      color: "text-red-600",
    },
    tentative: {
      label: "Maybe",
      icon: HelpCircle,
      color: "text-amber-600",
    },
  };

  const currentStatus = statusConfig[invitee.status];
  const StatusIcon = currentStatus.icon;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{meeting.title}</CardTitle>
          <CardDescription>
            {invitee.name
              ? `Hi ${invitee.name}, you&apos;re invited!`
              : "You're invited to this meeting"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Meeting Details */}
          <div className="rounded-lg bg-muted p-4 space-y-3">
            {meetingDate && (
              <>
                <div className="flex items-center gap-3">
                  <Calendar className="size-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">
                      {format(meetingDate, "EEEE, MMMM d, yyyy")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Clock className="size-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">
                      {format(meetingDate, "h:mm a")}
                      {endTime && ` - ${format(endTime, "h:mm a")}`}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {meeting.durationMinutes} minutes
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Current Status */}
          <div className="flex items-center justify-center gap-2 py-2">
            <StatusIcon className={cn("size-5", currentStatus.color)} />
            <span className={cn("font-medium", currentStatus.color)}>
              {submitted ? "Response recorded: " : "Your response: "}
              {currentStatus.label}
            </span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* RSVP Buttons (only show if pending or allowing change) */}
          {invitee.status === "pending" && !submitted && (
            <div className="space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                Will you attend?
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button
                  onClick={() => submitRsvp("accepted")}
                  disabled={isSubmitting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 size-4" />
                  )}
                  Yes, I&apos;ll attend
                </Button>
                <Button
                  onClick={() => submitRsvp("tentative")}
                  disabled={isSubmitting}
                  variant="outline"
                  className="border-amber-600 text-amber-600 hover:bg-amber-50"
                >
                  <HelpCircle className="mr-2 size-4" />
                  Maybe
                </Button>
                <Button
                  onClick={() => submitRsvp("declined")}
                  disabled={isSubmitting}
                  variant="outline"
                  className="border-red-600 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="mr-2 size-4" />
                  Can&apos;t attend
                </Button>
              </div>
            </div>
          )}

          {/* Change Response */}
          {invitee.status !== "pending" && (
            <div className="space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                Changed your mind?
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {invitee.status !== "accepted" && (
                  <Button
                    onClick={() => submitRsvp("accepted")}
                    disabled={isSubmitting}
                    size="sm"
                    variant="outline"
                    className="border-green-600 text-green-600"
                  >
                    Accept
                  </Button>
                )}
                {invitee.status !== "tentative" && (
                  <Button
                    onClick={() => submitRsvp("tentative")}
                    disabled={isSubmitting}
                    size="sm"
                    variant="outline"
                    className="border-amber-600 text-amber-600"
                  >
                    Maybe
                  </Button>
                )}
                {invitee.status !== "declined" && (
                  <Button
                    onClick={() => submitRsvp("declined")}
                    disabled={isSubmitting}
                    size="sm"
                    variant="outline"
                    className="border-red-600 text-red-600"
                  >
                    Decline
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          {/* Join Meeting Button (only show if accepted) */}
          {invitee.status === "accepted" && (
            <Button asChild className="w-full">
              <a href={meetingLink}>
                Join Meeting
                <ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          )}

          {/* Meeting Link */}
          <p className="text-center text-xs text-muted-foreground">
            Meeting link:{" "}
            <a
              href={meetingLink}
              className="text-primary hover:underline break-all"
            >
              {meetingLink}
            </a>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
