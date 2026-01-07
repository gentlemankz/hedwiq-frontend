"use client";

import { memo, useMemo } from "react";
import Image from "next/image";
import { format, isValid } from "date-fns";
import { cn } from "@/lib/utils";

/** Default meeting cover image path */
const DEFAULT_COVER_IMAGE = "/image1.png";

interface MeetingInfoHeaderProps {
  /** Meeting name/title */
  meetingName?: string;
  /** Scheduled meeting time (Date object or ISO string) */
  scheduledAt?: Date | string;
  /** Meeting goal/purpose (from template or custom) */
  meetingGoal?: string;
  /** Optional className for styling */
  className?: string;
}

/**
 * Parses and validates a date value.
 * Returns null if the date is invalid.
 */
function parseDate(value: Date | string | undefined): Date | null {
  if (!value) return null;

  const date = typeof value === "string" ? new Date(value) : value;
  return isValid(date) ? date : null;
}

/**
 * Meeting info header component.
 * Displays meeting image, name, and date/time in the transcript panel.
 *
 * Features:
 * - Memoized date formatting for performance
 * - Graceful handling of invalid/missing dates
 * - Image fallback handling
 */
export const MeetingInfoHeader = memo(function MeetingInfoHeader({
  meetingName,
  scheduledAt,
  meetingGoal,
  className,
}: MeetingInfoHeaderProps) {
  // Parse and memoize date to avoid recalculating on every render
  const parsedDate = useMemo(() => parseDate(scheduledAt), [scheduledAt]);

  // Memoize formatted date strings
  const { formattedDate, formattedTime } = useMemo(() => {
    if (!parsedDate) {
      return { formattedDate: null, formattedTime: null };
    }
    return {
      formattedDate: format(parsedDate, "dd.MM.yyyy"),
      formattedTime: format(parsedDate, "HH:mm"),
    };
  }, [parsedDate]);

  // Default meeting name if not provided
  const displayName = meetingName?.trim() || "Meeting";

  return (
    <div className={cn(className)}>
      {/* Meeting Image */}
      <div className="relative w-full aspect-[21/9] overflow-hidden bg-muted">
        <Image
          src={DEFAULT_COVER_IMAGE}
          alt="Meeting cover"
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 400px"
        />
      </div>

      {/* Meeting Info */}
      <div className="px-4 py-3">
        <h2
          className="text-base font-medium text-foreground truncate"
          title={displayName}
        >
          {displayName}
        </h2>
        {formattedDate && formattedTime && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {formattedDate} &bull; {formattedTime}
          </p>
        )}
        {meetingGoal && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            <span className="font-medium text-foreground">Goal:</span> {meetingGoal}
          </p>
        )}
      </div>

      {/* Separator */}
      <div className="border-b" />
    </div>
  );
});
