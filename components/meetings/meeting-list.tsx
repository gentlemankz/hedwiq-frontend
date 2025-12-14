"use client";

import { Calendar } from "lucide-react";
import { MeetingCard } from "./meeting-card";
import type { Meeting } from "@/types/meeting";
import type { CalendarEventPublic } from "@/types/calendar";

interface MeetingListProps {
  meetings: Meeting[];
  /** Map of meeting ID to calendar event info */
  calendarEvents?: Record<string, CalendarEventPublic>;
  onEdit?: (meeting: Meeting) => void;
  onDeleted?: () => void;
  emptyMessage?: string;
}

export function MeetingList({
  meetings,
  calendarEvents,
  onEdit,
  onDeleted,
  emptyMessage = "No meetings scheduled",
}: MeetingListProps) {
  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Calendar className="size-6 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {meetings.map((meeting) => (
        <MeetingCard
          key={meeting.id}
          meeting={meeting}
          calendarEvent={calendarEvents?.[meeting.id]}
          onEdit={onEdit}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  );
}
