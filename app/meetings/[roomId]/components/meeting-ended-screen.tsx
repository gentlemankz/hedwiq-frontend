"use client";

import { DisconnectReason } from "livekit-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Home,
  RefreshCw,
} from "lucide-react";
import {
  getDisconnectScreenContent,
  type DisconnectScreenContent,
} from "@/lib/meeting";

// ============================================================================
// Types
// ============================================================================

interface MeetingEndedScreenProps {
  /** The reason why the meeting ended / user was disconnected */
  reason: DisconnectReason;
  /** Optional meeting name to display */
  meetingName?: string;
  /** Callback to navigate to dashboard */
  onGoToDashboard: () => void;
  /** Optional callback to allow rejoining (only for certain scenarios like duplicate identity) */
  onRejoin?: () => void;
}

// ============================================================================
// Icon Mapping
// ============================================================================

const ICON_MAP: Record<DisconnectScreenContent["icon"], React.ReactNode> = {
  success: <CheckCircle2 className="h-16 w-16 text-green-500" />,
  error: <XCircle className="h-16 w-16 text-destructive" />,
  warning: <AlertTriangle className="h-16 w-16 text-amber-500" />,
  info: <AlertTriangle className="h-16 w-16 text-muted-foreground" />,
};

// ============================================================================
// Component
// ============================================================================

/**
 * Screen displayed when a meeting has ended or the user has been disconnected.
 * Shows appropriate messaging based on the disconnect reason and provides
 * navigation options.
 */
export function MeetingEndedScreen({
  reason,
  meetingName,
  onGoToDashboard,
  onRejoin,
}: MeetingEndedScreenProps) {
  const content = getDisconnectScreenContent(reason, meetingName);
  const icon = ICON_MAP[content.icon];

  // Only show meeting name for non-removal scenarios
  const showMeetingName =
    meetingName && reason !== DisconnectReason.PARTICIPANT_REMOVED;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-4">
          <div className="flex justify-center mb-4">{icon}</div>
          <CardTitle className="text-2xl">{content.title}</CardTitle>
          {showMeetingName && (
            <p className="text-sm text-muted-foreground font-medium mt-1">
              {meetingName}
            </p>
          )}
        </CardHeader>

        <CardContent>
          <CardDescription className="text-base">
            {content.description}
          </CardDescription>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-2">
          <Button onClick={onGoToDashboard} className="w-full" size="lg">
            <Home className="mr-2 h-4 w-4" />
            Go to Dashboard
          </Button>

          {content.showRejoin && onRejoin && (
            <Button
              onClick={onRejoin}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Rejoin Meeting
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
