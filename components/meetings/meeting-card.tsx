"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import {
  Calendar,
  CalendarCheck,
  CalendarX,
  Clock,
  Copy,
  MoreHorizontal,
  Pencil,
  Trash2,
  Video,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Meeting } from "@/types/meeting";
import type { CalendarEventPublic } from "@/types/calendar";

interface MeetingCardProps {
  meeting: Meeting;
  /** Calendar event info if synced */
  calendarEvent?: CalendarEventPublic | null;
  onEdit?: (meeting: Meeting) => void;
  onDeleted?: () => void;
}

export function MeetingCard({ meeting, calendarEvent, onEdit, onDeleted }: MeetingCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState(`/meetings/${meeting.roomId}`);

  // Build full URL on client side to avoid hydration mismatch
  useEffect(() => {
    setMeetingUrl(`${window.location.origin}/meetings/${meeting.roomId}`);
  }, [meeting.roomId]);

  // Clean up copy success timeout to prevent memory leak
  useEffect(() => {
    if (!copySuccess) return;

    const timer = setTimeout(() => setCopySuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [copySuccess]);

  // Format the scheduled time
  const formatScheduledTime = () => {
    if (!meeting.scheduledAt) {
      return meeting.type === "instant" ? "Started now" : "No time set";
    }

    const date = new Date(meeting.scheduledAt);

    if (isToday(date)) {
      return `Today at ${format(date, "h:mm a")}`;
    }
    if (isTomorrow(date)) {
      return `Tomorrow at ${format(date, "h:mm a")}`;
    }
    return format(date, "MMM d, yyyy 'at' h:mm a");
  };

  // Get status badge variant and text
  const getStatusBadge = () => {
    switch (meeting.status) {
      case "live":
        return { variant: "default" as const, text: "Live", className: "bg-green-500" };
      case "scheduled":
        if (meeting.scheduledAt && isPast(new Date(meeting.scheduledAt))) {
          return { variant: "secondary" as const, text: "Past", className: "" };
        }
        return { variant: "secondary" as const, text: "Upcoming", className: "" };
      case "ended":
        return { variant: "outline" as const, text: "Ended", className: "" };
      case "cancelled":
        return { variant: "destructive" as const, text: "Cancelled", className: "" };
      default:
        return { variant: "secondary" as const, text: meeting.status, className: "" };
    }
  };

  const handleJoin = () => {
    router.push(`/meetings/${meeting.roomId}`);
  };

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(meetingUrl);
      setCopySuccess(true);
      // Timeout cleanup is handled in useEffect
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  }, [meetingUrl]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/meetings/${meeting.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete meeting");
      }

      setShowDeleteDialog(false);
      onDeleted?.();
      router.refresh();
    } catch (error) {
      console.error("Failed to delete meeting:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const statusBadge = getStatusBadge();
  const canJoin = meeting.status === "scheduled" || meeting.status === "live";

  // Get calendar sync indicator
  const getCalendarIndicator = () => {
    if (!calendarEvent) return null;

    switch (calendarEvent.syncStatus) {
      case "synced":
        return {
          icon: CalendarCheck,
          className: "text-green-600",
          tooltip: "Synced to Google Calendar",
        };
      case "pending":
        return {
          icon: Calendar,
          className: "text-amber-500",
          tooltip: "Sync pending...",
        };
      case "failed":
        return {
          icon: AlertCircle,
          className: "text-red-500",
          tooltip: `Sync failed: ${calendarEvent.syncError || "Unknown error"}`,
        };
      case "deleted":
        return {
          icon: CalendarX,
          className: "text-muted-foreground",
          tooltip: "Calendar event deleted",
        };
      default:
        return null;
    }
  };

  const calendarIndicator = getCalendarIndicator();

  return (
    <>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{meeting.title}</CardTitle>
                <Badge
                  variant={statusBadge.variant}
                  className={cn("text-xs", statusBadge.className)}
                >
                  {statusBadge.text}
                </Badge>
              </div>
              <CardDescription className="flex items-center gap-2">
                <Calendar className="size-3.5" />
                <span>{formatScheduledTime()}</span>
                {meeting.durationMinutes && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <Clock className="size-3.5" />
                    <span>{meeting.durationMinutes} min</span>
                  </>
                )}
                {calendarIndicator && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <calendarIndicator.icon
                            className={cn("size-3.5 cursor-help", calendarIndicator.className)}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{calendarIndicator.tooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </>
                )}
              </CardDescription>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">More options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCopyLink}>
                  <Copy className="mr-2 size-4" />
                  {copySuccess ? "Copied!" : "Copy link"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open(meetingUrl, "_blank")}>
                  <ExternalLink className="mr-2 size-4" />
                  Open in new tab
                </DropdownMenuItem>
                {calendarEvent?.syncStatus === "synced" && calendarEvent.providerEventLink && (
                  <DropdownMenuItem
                    onClick={() => window.open(calendarEvent.providerEventLink!, "_blank")}
                  >
                    <CalendarCheck className="mr-2 size-4" />
                    View in Calendar
                  </DropdownMenuItem>
                )}
                {onEdit && meeting.status === "scheduled" && (
                  <DropdownMenuItem onClick={() => onEdit(meeting)}>
                    <Pencil className="mr-2 size-4" />
                    Edit
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="pt-2">
          {meeting.description && (
            <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
              {meeting.description}
            </p>
          )}

          <div className="flex items-center gap-2">
            {canJoin && (
              <Button size="sm" onClick={handleJoin} className="gap-1.5">
                <Video className="size-3.5" />
                Join
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyLink}
              className="gap-1.5"
            >
              <Copy className="size-3.5" />
              {copySuccess ? "Copied!" : "Copy Link"}
            </Button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Room: {meeting.roomId}
          </p>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{meeting.title}&quot;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
