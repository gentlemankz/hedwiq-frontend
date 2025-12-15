"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Calendar as CalendarIcon,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ListTodo,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  TIME_OPTIONS,
  agendaItemsToDraft,
  draftItemsToApiInput,
  getTimeFromDate,
} from "@/lib/utils/meeting-form";
import { DURATION_OPTIONS, MEETING_LIMITS } from "@/types/meeting";
import {
  getMeetingFieldErrors,
  hasMeetingFieldErrors,
} from "@/lib/validation/meeting";
import type { Meeting } from "@/types/meeting";
import type { DraftAgendaItem } from "@/types/agenda";
import { AgendaBuilder } from "@/app/meetings/[roomId]/components/agenda-builder";

interface EditMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: Meeting;
  onUpdated?: () => void;
}

export function EditMeetingDialog({
  open,
  onOpenChange,
  meeting,
  onUpdated,
}: EditMeetingDialogProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Loading state for fetching meeting details
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Ref for timeout cleanup
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Success state
  const [isSuccess, setIsSuccess] = useState(false);
  const [calendarSyncResult, setCalendarSyncResult] = useState<{
    synced: boolean;
    eventLink?: string | null;
    error?: string;
  } | null>(null);

  // Form state - initialized from meeting
  const [title, setTitle] = useState(meeting.title);
  const [description, setDescription] = useState(meeting.description || "");
  const [date, setDate] = useState<Date | undefined>(
    meeting.scheduledAt ? new Date(meeting.scheduledAt) : undefined
  );
  const [time, setTime] = useState(
    meeting.scheduledAt ? getTimeFromDate(new Date(meeting.scheduledAt)) : "10:00"
  );
  const [duration, setDuration] = useState(meeting.durationMinutes || 30);

  // Agenda state
  const [agendaItems, setAgendaItems] = useState<DraftAgendaItem[]>([]);
  const [agendaExpanded, setAgendaExpanded] = useState(false);
  const [agendaStatus, setAgendaStatus] = useState<string | undefined>();

  // Validation state
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  // Fetch meeting details including agenda when dialog opens
  // Uses AbortController for proper request cancellation on unmount/close
  useEffect(() => {
    if (!open) return;

    const abortController = new AbortController();

    const fetchMeetingDetails = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(`/api/meetings/${meeting.id}`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load meeting details");
        }

        const data = await response.json();

        // Check if request was aborted before updating state
        if (abortController.signal.aborted) return;

        // Update form with fresh data
        if (data.meeting) {
          setTitle(data.meeting.title);
          setDescription(data.meeting.description || "");
          setDuration(data.meeting.durationMinutes || 30);
          if (data.meeting.scheduledAt) {
            const scheduledDate = new Date(data.meeting.scheduledAt);
            setDate(scheduledDate);
            setTime(getTimeFromDate(scheduledDate));
          }
        }

        // Load agenda items
        if (data.agenda) {
          setAgendaItems(agendaItemsToDraft(data.agenda));
          setAgendaStatus(data.agenda.status);
          if (data.agenda.items && data.agenda.items.length > 0) {
            setAgendaExpanded(true);
          }
        }
      } catch (error) {
        // Ignore abort errors - they're expected when dialog closes
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        if (!abortController.signal.aborted) {
          console.error("Failed to fetch meeting details:", error);
          setLoadError(
            error instanceof Error ? error.message : "Failed to load meeting"
          );
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    fetchMeetingDetails();

    return () => {
      abortController.abort();
    };
  }, [open, meeting.id]);

  // Get field errors
  const fieldErrors = getMeetingFieldErrors({
    title,
    description,
  });

  // Only show errors for touched fields
  const visibleErrors = {
    title: touched.title ? fieldErrors.title : undefined,
    description: touched.description ? fieldErrors.description : undefined,
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async () => {
    // Touch all fields to show errors
    setTouched({ title: true, description: true });

    // Check for errors
    if (hasMeetingFieldErrors(fieldErrors)) {
      return;
    }

    if (!title.trim() || !date) {
      return;
    }

    setIsSubmitting(true);
    setApiError(null);
    setCalendarSyncResult(null);

    try {
      // Parse time and create scheduledAt
      const [hours, minutes] = time.split(":").map(Number);
      const scheduledAt = new Date(date);
      scheduledAt.setHours(hours, minutes, 0, 0);

      // Prepare agenda items for API using shared utility
      const agendaItemsInput = draftItemsToApiInput(agendaItems);

      // Update meeting via API
      const response = await fetch(`/api/meetings/${meeting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          scheduledAt: scheduledAt.toISOString(),
          durationMinutes: duration,
          agendaItems: agendaItemsInput,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update meeting");
      }

      const data = await response.json();

      // Check calendar sync result
      if (data.calendarSync) {
        setCalendarSyncResult(data.calendarSync);
      }

      // Show success state briefly
      setIsSuccess(true);
      successTimeoutRef.current = setTimeout(() => {
        onOpenChange(false);
        onUpdated?.();
        router.refresh();
      }, 1500);
    } catch (error) {
      console.error("Failed to update meeting:", error);
      setApiError(
        error instanceof Error ? error.message : "Failed to update meeting"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset states when closing
      setApiError(null);
      setCalendarSyncResult(null);
      setIsSuccess(false);
      setTouched({});
    }
    onOpenChange(newOpen);
  };

  const isFormValid =
    title.trim().length >= MEETING_LIMITS.MIN_TITLE_LENGTH && date;

  // Check if agenda can be edited (only draft agendas)
  const canEditAgenda = !agendaStatus || agendaStatus === "draft";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {/* Success State */}
        {isSuccess ? (
          <>
            <DialogHeader>
              <DialogTitle>Meeting Updated!</DialogTitle>
              <DialogDescription>
                Your changes have been saved successfully.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <CalendarIcon className="size-6 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {calendarSyncResult?.synced
                  ? "Calendar event updated"
                  : "Meeting updated"}
              </p>
              {calendarSyncResult?.synced && calendarSyncResult?.eventLink && (
                <a
                  href={calendarSyncResult.eventLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  View in Google Calendar
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </>
        ) : isLoading ? (
          // Loading State
          <>
            <DialogHeader>
              <DialogTitle>Edit Meeting</DialogTitle>
              <DialogDescription>Loading meeting details...</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Skeleton className="h-10 w-full" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </>
        ) : loadError ? (
          // Error State
          <>
            <DialogHeader>
              <DialogTitle>Edit Meeting</DialogTitle>
            </DialogHeader>
            <Alert variant="destructive" className="my-4">
              <AlertCircle className="size-4" />
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          // Edit Form
          <>
            <DialogHeader>
              <DialogTitle>Edit Meeting</DialogTitle>
              <DialogDescription>
                Update the meeting details below.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {/* API Error */}
              {apiError && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{apiError}</AlertDescription>
                </Alert>
              )}

              {/* Title */}
              <div className="grid gap-2">
                <Label htmlFor="edit-meeting-title">
                  Meeting Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-meeting-title"
                  placeholder="e.g., Weekly Team Standup"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => handleBlur("title")}
                  maxLength={MEETING_LIMITS.MAX_TITLE_LENGTH}
                  aria-invalid={!!visibleErrors.title}
                  aria-describedby={
                    visibleErrors.title ? "edit-title-error" : undefined
                  }
                />
                {visibleErrors.title && (
                  <p id="edit-title-error" className="text-sm text-destructive">
                    {visibleErrors.title}
                  </p>
                )}
              </div>

              {/* Date & Time */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>
                    Date <span className="text-destructive">*</span>
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 size-4" />
                        {date ? format(date, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        disabled={(d) => d < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid gap-2">
                  <Label>Time</Label>
                  <Select value={time} onValueChange={setTime}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Duration */}
              <div className="grid gap-2">
                <Label>Duration</Label>
                <Select
                  value={duration.toString()}
                  onValueChange={(v) => setDuration(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value.toString()}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="grid gap-2">
                <Label htmlFor="edit-meeting-description">
                  Description (optional)
                </Label>
                <Textarea
                  id="edit-meeting-description"
                  placeholder="Add meeting details or notes..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => handleBlur("description")}
                  rows={2}
                  maxLength={MEETING_LIMITS.MAX_DESCRIPTION_LENGTH}
                  aria-invalid={!!visibleErrors.description}
                  aria-describedby={
                    visibleErrors.description
                      ? "edit-description-error"
                      : undefined
                  }
                />
                {visibleErrors.description && (
                  <p
                    id="edit-description-error"
                    className="text-sm text-destructive"
                  >
                    {visibleErrors.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {description.length}/{MEETING_LIMITS.MAX_DESCRIPTION_LENGTH}{" "}
                  characters
                </p>
              </div>

              {/* Meeting Agenda */}
              <Collapsible open={agendaExpanded} onOpenChange={setAgendaExpanded}>
                <div className="rounded-lg border">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <ListTodo className="size-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          Meeting Agenda
                          {agendaItems.length > 0 && (
                            <span className="ml-2 text-muted-foreground font-normal">
                              ({agendaItems.length} topic
                              {agendaItems.length !== 1 ? "s" : ""})
                            </span>
                          )}
                        </span>
                        {!canEditAgenda && (
                          <span className="ml-2 text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                            Published
                          </span>
                        )}
                      </div>
                      {agendaExpanded ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t px-4 pb-4 pt-2">
                      {!canEditAgenda && (
                        <Alert className="mb-3">
                          <AlertCircle className="size-4" />
                          <AlertDescription>
                            This agenda has been published and cannot be edited.
                          </AlertDescription>
                        </Alert>
                      )}
                      <p className="text-xs text-muted-foreground mb-3">
                        {canEditAgenda
                          ? "Update the agenda topics for your meeting."
                          : "View the agenda topics for this meeting."}
                      </p>
                      <AgendaBuilder
                        items={agendaItems}
                        onChange={setAgendaItems}
                        disabled={isSubmitting || !canEditAgenda}
                      />
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isFormValid || isSubmitting}
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
