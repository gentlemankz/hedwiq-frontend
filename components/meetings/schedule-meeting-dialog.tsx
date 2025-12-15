"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { format, addDays } from "date-fns";
import {
  Calendar as CalendarIcon,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
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
import { TIME_OPTIONS, draftItemsToApiInput } from "@/lib/utils/meeting-form";
import { DURATION_OPTIONS, MEETING_LIMITS } from "@/types/meeting";
import {
  getMeetingFieldErrors,
  hasMeetingFieldErrors,
} from "@/lib/validation/meeting";
import type { CalendarIntegrationPublic } from "@/types/calendar";
import type { DraftAgendaItem } from "@/types/agenda";
import { AgendaBuilder } from "@/app/meetings/[roomId]/components/agenda-builder";

interface ScheduleMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fetched calendar status (optional, will fetch if not provided) */
  calendarStatus?: {
    connected: boolean;
    integration: CalendarIntegrationPublic | null;
  } | null;
}

export function ScheduleMeetingDialog({
  open,
  onOpenChange,
  calendarStatus: initialCalendarStatus,
}: ScheduleMeetingDialogProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Ref for timeout cleanup to prevent memory leaks
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  // Calendar state
  const [calendarStatus, setCalendarStatus] = useState(initialCalendarStatus);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(!initialCalendarStatus);
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [calendarSyncResult, setCalendarSyncResult] = useState<{
    synced: boolean;
    eventLink?: string | null;
    error?: string;
  } | null>(null);

  // Success state - shows meeting created confirmation
  const [isSuccess, setIsSuccess] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);

  // Agenda state
  const [agendaItems, setAgendaItems] = useState<DraftAgendaItem[]>([]);
  const [agendaExpanded, setAgendaExpanded] = useState(false);

  // Validation state
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Fetch calendar status when dialog opens
  useEffect(() => {
    if (open && !initialCalendarStatus) {
      setIsLoadingCalendar(true);
      fetch("/api/calendar/status")
        .then((res) => res.json())
        .then((data) => {
          setCalendarStatus(data);
          // Auto-enable "Add to Calendar" if calendar is connected
          if (data.connected) {
            setAddToCalendar(true);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch calendar status:", err);
          setCalendarStatus({ connected: false, integration: null });
        })
        .finally(() => {
          setIsLoadingCalendar(false);
        });
    } else if (initialCalendarStatus?.connected) {
      setAddToCalendar(true);
    }
  }, [open, initialCalendarStatus]);

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

      // Prepare agenda items for API (convert DraftAgendaItem to AgendaItemInput)
      const agendaItemsInput =
        agendaItems.length > 0 ? draftItemsToApiInput(agendaItems) : undefined;

      // Create meeting via API
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          type: "scheduled",
          scheduledAt: scheduledAt.toISOString(),
          durationMinutes: duration,
          addToCalendar: addToCalendar && calendarStatus?.connected,
          agendaItems: agendaItemsInput,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create meeting");
      }

      const data = await response.json();

      // Check calendar sync result
      if (data.calendarSync) {
        setCalendarSyncResult(data.calendarSync);
        if (!data.calendarSync.synced && data.calendarSync.error) {
          // Show calendar sync warning but don't prevent closing
          console.warn("Calendar sync failed:", data.calendarSync.error);
        }
      }

      // Show success state briefly if calendar was synced with a link
      if (data.calendarSync?.synced && data.calendarSync?.eventLink) {
        setIsSuccess(true);
        // Auto-close after 2 seconds to show the calendar link
        // Store timeout ref for cleanup on unmount
        successTimeoutRef.current = setTimeout(() => {
          resetForm();
          onOpenChange(false);
          router.refresh();
        }, 2000);
      } else {
        // Close dialog and refresh immediately
        resetForm();
        onOpenChange(false);
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to schedule meeting:", error);
      setApiError(
        error instanceof Error ? error.message : "Failed to create meeting"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDate(addDays(new Date(), 1));
    setTime("10:00");
    setDuration(30);
    setAgendaItems([]);
    setAgendaExpanded(false);
    setTouched({});
    setApiError(null);
    setCalendarSyncResult(null);
    setIsSuccess(false);
    // Keep addToCalendar if calendar is connected
    if (!calendarStatus?.connected) {
      setAddToCalendar(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const isFormValid =
    title.trim().length >= MEETING_LIMITS.MIN_TITLE_LENGTH && date;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {/* Success State */}
        {isSuccess ? (
          <>
            <DialogHeader>
              <DialogTitle>Meeting Scheduled!</DialogTitle>
              <DialogDescription>
                Your meeting has been created successfully.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <CalendarIcon className="size-6 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {calendarSyncResult?.synced
                  ? "Event added to your Google Calendar"
                  : "Meeting created"}
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
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Schedule a Meeting</DialogTitle>
              <DialogDescription>
                Set up a meeting for a future date and time.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {/* API Error */}
              {apiError && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {apiError}
                </div>
              )}

          {/* Title */}
          <div className="grid gap-2">
            <Label htmlFor="meeting-title">
              Meeting Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="meeting-title"
              placeholder="e.g., Weekly Team Standup"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => handleBlur("title")}
              maxLength={MEETING_LIMITS.MAX_TITLE_LENGTH}
              aria-invalid={!!visibleErrors.title}
              aria-describedby={
                visibleErrors.title ? "title-error" : undefined
              }
            />
            {visibleErrors.title && (
              <p id="title-error" className="text-sm text-destructive">
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

          {/* Description (optional) */}
          <div className="grid gap-2">
            <Label htmlFor="meeting-description">Description (optional)</Label>
            <Textarea
              id="meeting-description"
              placeholder="Add meeting details or notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => handleBlur("description")}
              rows={2}
              maxLength={MEETING_LIMITS.MAX_DESCRIPTION_LENGTH}
              aria-invalid={!!visibleErrors.description}
              aria-describedby={
                visibleErrors.description ? "description-error" : undefined
              }
            />
            {visibleErrors.description && (
              <p id="description-error" className="text-sm text-destructive">
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
                  <p className="text-xs text-muted-foreground mb-3">
                    Add topics to help structure your meeting. The AI will
                    automatically track discussion progress during the call.
                  </p>
                  <AgendaBuilder
                    items={agendaItems}
                    onChange={setAgendaItems}
                    disabled={isSubmitting}
                  />
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Google Calendar Integration */}
          <div className="rounded-lg border p-4">
            {isLoadingCalendar ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Checking calendar connection...
              </div>
            ) : calendarStatus?.connected ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="add-to-calendar"
                    checked={addToCalendar}
                    onCheckedChange={(checked) => setAddToCalendar(!!checked)}
                  />
                  <div className="grid gap-1 leading-none">
                    <Label
                      htmlFor="add-to-calendar"
                      className="text-sm font-medium cursor-pointer"
                    >
                      Add to Google Calendar
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Creates an event in{" "}
                      {calendarStatus.integration?.calendarEmail || "your calendar"}
                    </p>
                  </div>
                </div>
                {calendarSyncResult?.synced && calendarSyncResult.eventLink && (
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
                {calendarSyncResult && !calendarSyncResult.synced && (
                  <p className="text-sm text-amber-600">
                    Calendar sync failed: {calendarSyncResult.error}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Google Calendar</p>
                  <p className="text-sm text-muted-foreground">
                    Connect to add events automatically
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/calendar/connect");
                      const data = await res.json();
                      if (data.authUrl) {
                        window.location.href = data.authUrl;
                      } else if (data.error) {
                        setApiError(data.error);
                      }
                    } catch (err) {
                      console.error("Failed to connect calendar:", err);
                      setApiError("Failed to connect calendar");
                    }
                  }}
                >
                  Connect
                </Button>
              </div>
            )}
          </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isFormValid || isSubmitting}
              >
                {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                Schedule Meeting
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
