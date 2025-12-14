"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, addDays } from "date-fns";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";
import { DURATION_OPTIONS, MEETING_LIMITS } from "@/types/meeting";
import {
  getMeetingFieldErrors,
  hasMeetingFieldErrors,
} from "@/lib/validation/meeting";

interface ScheduleMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Generate time options (30 min intervals)
// Use static string formatting to avoid Date object creation on module load
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = (i % 2) * 30;
  const value = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

  // Format as 12-hour time without creating Date objects
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? "AM" : "PM";
  const label = `${hour12}:${minute.toString().padStart(2, "0")} ${ampm}`;

  return { value, label };
});

export function ScheduleMeetingDialog({
  open,
  onOpenChange,
}: ScheduleMeetingDialogProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);

  // Validation state
  const [touched, setTouched] = useState<Record<string, boolean>>({});

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

    try {
      // Parse time and create scheduledAt
      const [hours, minutes] = time.split(":").map(Number);
      const scheduledAt = new Date(date);
      scheduledAt.setHours(hours, minutes, 0, 0);

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
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create meeting");
      }

      // Close dialog and refresh
      resetForm();
      onOpenChange(false);
      router.refresh();
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
    setTouched({});
    setApiError(null);
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
              placeholder="Add meeting details, agenda, or notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => handleBlur("description")}
              rows={3}
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
      </DialogContent>
    </Dialog>
  );
}
