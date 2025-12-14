"use client";

import { Calendar } from "lucide-react";
import { MeetingCard } from "./meeting-card";
import type { Meeting } from "@/types/meeting";

interface MeetingListProps {
  meetings: Meeting[];
  onEdit?: (meeting: Meeting) => void;
  onDeleted?: () => void;
  emptyMessage?: string;
}

export function MeetingList({
  meetings,
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
          onEdit={onEdit}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  );
}
