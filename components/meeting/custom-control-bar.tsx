"use client";

import * as React from "react";
import { Track } from "livekit-client";
import type { WidgetState } from "@livekit/components-core";
import {
  useTrackToggle,
  useDisconnectButton,
  useLocalParticipantPermissions,
  usePersistentUserChoices,
  useChatToggle,
} from "@livekit/components-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface CustomControlBarControls {
  microphone?: boolean;
  camera?: boolean;
  screenShare?: boolean;
  chat?: boolean;
  leave?: boolean;
}

export interface CustomControlBarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  controls?: CustomControlBarControls;
  /** Widget state for chat toggle (required when chat: true) */
  widgetState?: WidgetState;
  saveUserChoices?: boolean;
  onDeviceError?: (error: { source: Track.Source; error: Error }) => void;
}

// ============================================================================
// Microphone Button
// ============================================================================

interface MicrophoneButtonProps {
  onChange?: (enabled: boolean, isUserInitiated: boolean) => void;
  onDeviceError?: (error: Error) => void;
}

function MicrophoneButton({ onChange, onDeviceError }: MicrophoneButtonProps) {
  const { enabled, pending, toggle } = useTrackToggle({
    source: Track.Source.Microphone,
    onChange,
    onDeviceError,
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={enabled ? "secondary" : "destructive"}
          size="icon"
          className={cn(
            "h-12 w-12 rounded-full transition-all",
            enabled && "hover:bg-secondary/80",
            pending && "opacity-70 cursor-wait"
          )}
          onClick={() => toggle()}
          disabled={pending}
          aria-label={enabled ? "Mute microphone" : "Unmute microphone"}
        >
          {enabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{enabled ? "Mute" : "Unmute"}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// Camera Button
// ============================================================================

interface CameraButtonProps {
  onChange?: (enabled: boolean, isUserInitiated: boolean) => void;
  onDeviceError?: (error: Error) => void;
}

function CameraButton({ onChange, onDeviceError }: CameraButtonProps) {
  const { enabled, pending, toggle } = useTrackToggle({
    source: Track.Source.Camera,
    onChange,
    onDeviceError,
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={enabled ? "secondary" : "destructive"}
          size="icon"
          className={cn(
            "h-12 w-12 rounded-full transition-all",
            enabled && "hover:bg-secondary/80",
            pending && "opacity-70 cursor-wait"
          )}
          onClick={() => toggle()}
          disabled={pending}
          aria-label={enabled ? "Stop video" : "Start video"}
        >
          {enabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{enabled ? "Stop Video" : "Start Video"}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// Screen Share Button
// ============================================================================

interface ScreenShareButtonProps {
  onDeviceError?: (error: Error) => void;
}

function ScreenShareButton({ onDeviceError }: ScreenShareButtonProps) {
  const { enabled, pending, toggle } = useTrackToggle({
    source: Track.Source.ScreenShare,
    captureOptions: { audio: true, selfBrowserSurface: "include" },
    onDeviceError,
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={enabled ? "default" : "secondary"}
          size="icon"
          className={cn(
            "h-12 w-12 rounded-full transition-all",
            enabled && "bg-primary text-primary-foreground",
            pending && "opacity-70 cursor-wait"
          )}
          onClick={() => toggle()}
          disabled={pending}
          aria-label={enabled ? "Stop screen sharing" : "Share screen"}
        >
          <Monitor className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{enabled ? "Stop Sharing" : "Share Screen"}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// Chat Toggle Button
// ============================================================================

interface ChatToggleButtonProps {
  widgetState: WidgetState;
}

const ChatToggleButton = React.memo(function ChatToggleButton({
  widgetState
}: ChatToggleButtonProps) {
  const { mergedProps } = useChatToggle({ props: {} });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={widgetState.showChat ? "default" : "secondary"}
          size="icon"
          className={cn(
            "h-12 w-12 rounded-full transition-all relative",
            widgetState.showChat && "bg-primary text-primary-foreground"
          )}
          onClick={mergedProps.onClick}
          aria-label={widgetState.showChat ? "Close chat" : "Open chat"}
        >
          <MessageSquare className="h-5 w-5" />
          {widgetState.unreadMessages > 0 && (
            <span
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium flex items-center justify-center"
              aria-label={`${widgetState.unreadMessages} unread messages`}
            >
              {widgetState.unreadMessages > 9 ? "9+" : widgetState.unreadMessages}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{widgetState.showChat ? "Close Chat" : "Open Chat"}</p>
      </TooltipContent>
    </Tooltip>
  );
});

// ============================================================================
// Leave Button with Confirmation Dialog
// ============================================================================

function LeaveButton() {
  const [showConfirmDialog, setShowConfirmDialog] = React.useState(false);
  const { buttonProps } = useDisconnectButton({});

  // Hidden button ref - used to trigger the actual disconnect with proper event
  const hiddenButtonRef = React.useRef<HTMLButtonElement>(null);

  const handleLeaveClick = React.useCallback(() => {
    setShowConfirmDialog(true);
  }, []);

  const handleConfirmLeave = React.useCallback(() => {
    setShowConfirmDialog(false);
    // Trigger the actual disconnect via the hidden button's click
    // This ensures proper event handling without unsafe type assertions
    hiddenButtonRef.current?.click();
  }, []);

  // Cleanup dialog state on unmount to prevent memory leaks
  React.useEffect(() => {
    return () => {
      setShowConfirmDialog(false);
    };
  }, []);

  return (
    <>
      {/* Hidden button that has the actual disconnect handler */}
      <button
        ref={hiddenButtonRef}
        onClick={buttonProps.onClick}
        disabled={buttonProps.disabled}
        style={{ display: "none" }}
        aria-hidden="true"
        tabIndex={-1}
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="destructive"
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={handleLeaveClick}
            disabled={buttonProps.disabled}
            aria-label="Leave meeting"
          >
            <PhoneOff className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Leave Meeting</p>
        </TooltipContent>
      </Tooltip>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave this meeting? You can rejoin later if the meeting is still active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* AlertDialogCancel automatically closes the dialog via onOpenChange */}
            <AlertDialogCancel>Stay in Meeting</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmLeave}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave Meeting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================================================
// Main Control Bar Component
// ============================================================================

export function CustomControlBar({
  controls,
  widgetState,
  saveUserChoices = true,
  onDeviceError,
  className,
  ...props
}: CustomControlBarProps) {
  const permissions = useLocalParticipantPermissions();

  const visibleControls: Required<CustomControlBarControls> = {
    microphone: controls?.microphone ?? permissions?.canPublish ?? false,
    camera: controls?.camera ?? permissions?.canPublish ?? false,
    screenShare: controls?.screenShare ?? permissions?.canPublish ?? false,
    chat: controls?.chat ?? false,
    leave: controls?.leave ?? true,
  };

  const { saveAudioInputEnabled, saveVideoInputEnabled } = usePersistentUserChoices({
    preventSave: !saveUserChoices,
  });

  const handleMicrophoneChange = React.useCallback(
    (enabled: boolean, isUserInitiated: boolean) => {
      if (isUserInitiated) saveAudioInputEnabled(enabled);
    },
    [saveAudioInputEnabled]
  );

  const handleCameraChange = React.useCallback(
    (enabled: boolean, isUserInitiated: boolean) => {
      if (isUserInitiated) saveVideoInputEnabled(enabled);
    },
    [saveVideoInputEnabled]
  );

  const hasVisibleControls = Object.values(visibleControls).some(Boolean);
  if (!hasVisibleControls) return null;

  // Show divider between media controls and action buttons (chat/leave)
  const hasMediaControls = visibleControls.microphone || visibleControls.camera || visibleControls.screenShare;
  const hasActionControls = visibleControls.chat || visibleControls.leave;
  const showDivider = hasMediaControls && hasActionControls;

  return (
    <div
      className={cn("flex items-center justify-center gap-2", className)}
      {...props}
    >
      {visibleControls.microphone && (
        <MicrophoneButton
          onChange={handleMicrophoneChange}
          onDeviceError={(error) => onDeviceError?.({ source: Track.Source.Microphone, error })}
        />
      )}

      {visibleControls.camera && (
        <CameraButton
          onChange={handleCameraChange}
          onDeviceError={(error) => onDeviceError?.({ source: Track.Source.Camera, error })}
        />
      )}

      {visibleControls.screenShare && (
        <ScreenShareButton
          onDeviceError={(error) => onDeviceError?.({ source: Track.Source.ScreenShare, error })}
        />
      )}

      {showDivider && <div className="mx-2 h-8 w-px bg-border" />}

      {visibleControls.chat && widgetState && (
        <ChatToggleButton widgetState={widgetState} />
      )}

      {visibleControls.leave && <LeaveButton />}
    </div>
  );
}
