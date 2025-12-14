"use client";

import { Video, Calendar } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MeetingTypeSelectorProps {
  onSelectInstant: () => void;
  onSelectScheduled: () => void;
}

export function MeetingTypeSelector({
  onSelectInstant,
  onSelectScheduled,
}: MeetingTypeSelectorProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card
        className={cn(
          "cursor-pointer transition-colors",
          "hover:border-primary hover:bg-primary/5"
        )}
        onClick={onSelectInstant}
      >
        <CardHeader className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Video className="size-6 text-primary" />
          </div>
          <CardTitle className="mt-4">Start Instant Meeting</CardTitle>
          <CardDescription>
            Begin a meeting immediately. Perfect for quick calls.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card
        className={cn(
          "cursor-pointer transition-colors",
          "hover:border-blue-500 hover:bg-blue-500/5"
        )}
        onClick={onSelectScheduled}
      >
        <CardHeader className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-500/10">
            <Calendar className="size-6 text-blue-500" />
          </div>
          <CardTitle className="mt-4">Schedule for Later</CardTitle>
          <CardDescription>
            Set a date and time. Share the link with attendees.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
