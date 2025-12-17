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
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Calendar,
  Clock,
  Users,
  FileText,
  Lightbulb,
  StickyNote,
  ChevronRight,
  MoreHorizontal,
  FolderInput,
} from "lucide-react";
import {
  formatMeetingDate,
  formatMeetingTime,
  formatDurationCompact,
} from "@/lib/utils";
import type { MeetingHistorySummary } from "@/types/meeting-history";

interface PastMeetingCardProps {
  meeting: MeetingHistorySummary;
  /** Whether the card is in selection mode */
  selectionMode?: boolean;
  /** Whether the card is selected */
  isSelected?: boolean;
  /** Callback when selection changes */
  onSelectionChange?: (selected: boolean) => void;
  /** Callback to open move dialog */
  onMoveToFolder?: (meeting: MeetingHistorySummary) => void;
}

/**
 * Card component for displaying a past meeting summary.
 */
export function PastMeetingCard({
  meeting,
  selectionMode = false,
  isSelected = false,
  onSelectionChange,
  onMoveToFolder,
}: PastMeetingCardProps) {
  const router = useRouter();

  const handleViewDetails = () => {
    router.push(`/meetings/${meeting.roomId}/history`);
  };

  // Toggle selection when clicking card in selection mode
  const handleSelectionToggle = () => {
    onSelectionChange?.(!isSelected);
  };

  // Handle keyboard events for accessibility in selection mode
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (selectionMode && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      handleSelectionToggle();
    }
  };

  const hasData =
    meeting.transcriptionCount > 0 ||
    meeting.insightCount > 0 ||
    meeting.noteCount > 0;

  return (
    <Card
      className={`group hover:shadow-md transition-shadow ${
        selectionMode ? "cursor-pointer" : ""
      } ${isSelected ? "ring-2 ring-primary" : ""}`}
      onClick={selectionMode ? handleSelectionToggle : undefined}
      onKeyDown={selectionMode ? handleKeyDown : undefined}
      tabIndex={selectionMode ? 0 : undefined}
      role={selectionMode ? "checkbox" : undefined}
      aria-checked={selectionMode ? isSelected : undefined}
      aria-label={selectionMode ? `Select meeting: ${meeting.title}` : undefined}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          {/* Selection checkbox */}
          {selectionMode && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelectionChange?.(!!checked)}
              onClick={(e) => e.stopPropagation()}
              className="mt-1"
              aria-label={`Select ${meeting.title}`}
            />
          )}
          <div className="flex-1 min-w-0 space-y-1">
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
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary">
              <Clock className="mr-1 size-3" />
              {formatDurationCompact(meeting.durationMinutes)}
            </Badge>
            {/* Actions dropdown */}
            {!selectionMode && onMoveToFolder && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Meeting actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveToFolder(meeting);
                    }}
                  >
                    <FolderInput className="mr-2 size-4" />
                    Move to Folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
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
        {!selectionMode && (
          <Button
            variant={hasData ? "default" : "outline"}
            size="sm"
            className="w-full"
            onClick={handleViewDetails}
          >
            {hasData ? "View Meeting Details" : "View Meeting"}
            <ChevronRight className="ml-1 size-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
