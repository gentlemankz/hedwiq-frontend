"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  Users,
  FileText,
  Lightbulb,
  StickyNote,
  ChevronRight,
} from "lucide-react";
import {
  formatMeetingDate,
  formatMeetingTime,
  formatDurationCompact,
} from "@/lib/utils";
import type { MeetingHistorySummary } from "@/types/meeting-history";

interface PastMeetingCardProps {
  meeting: MeetingHistorySummary;
}

/**
 * Card component for displaying a past meeting summary.
 */
export function PastMeetingCard({ meeting }: PastMeetingCardProps) {
  const router = useRouter();

  const handleViewDetails = () => {
    router.push(`/meetings/${meeting.roomId}/history`);
  };

  const hasData =
    meeting.transcriptionCount > 0 ||
    meeting.insightCount > 0 ||
    meeting.noteCount > 0;

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold line-clamp-1">
              {meeting.title}
            </CardTitle>
            <CardDescription className="flex items-center gap-2 text-sm">
              <Calendar className="size-3.5" />
              {formatMeetingDate(meeting.endedAt)}
              {meeting.endedAt && (
                <>
                  <span className="text-muted-foreground/50">|</span>
                  {formatMeetingTime(meeting.endedAt)}
                </>
              )}
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0">
            <Clock className="mr-1 size-3" />
            {formatDurationCompact(meeting.durationMinutes)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stats Row */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="size-4" />
            <span>{meeting.participantCount}</span>
          </div>
          {meeting.transcriptionCount > 0 && (
            <div className="flex items-center gap-1">
              <FileText className="size-4" />
              <span>{meeting.transcriptionCount}</span>
            </div>
          )}
          {meeting.insightCount > 0 && (
            <div className="flex items-center gap-1">
              <Lightbulb className="size-4" />
              <span>{meeting.insightCount}</span>
            </div>
          )}
          {meeting.noteCount > 0 && (
            <div className="flex items-center gap-1">
              <StickyNote className="size-4" />
              <span>{meeting.noteCount}</span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <Button
          variant={hasData ? "default" : "outline"}
          size="sm"
          className="w-full"
          onClick={handleViewDetails}
        >
          {hasData ? "View Meeting Details" : "View Meeting"}
          <ChevronRight className="ml-1 size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
