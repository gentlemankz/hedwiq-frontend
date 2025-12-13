"use client";

import * as React from "react";
import { Track } from "livekit-client";
import type {
  ParticipantClickEvent,
  TrackReferenceOrPlaceholder,
} from "@livekit/components-core";
import { isTrackReference, isTrackReferencePinned } from "@livekit/components-core";
import {
  VideoTrack,
  AudioTrack,
  ParticipantName,
  TrackMutedIndicator,
  ConnectionQualityIndicator,
  FocusToggle,
  useMaybeLayoutContext,
  useParticipantTile,
  useEnsureTrackRef,
  useMaybeParticipantContext,
  useMaybeTrackRefContext,
  ParticipantContext,
  TrackRefContext,
} from "@livekit/components-react";
import { Lock, Monitor } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useIsEncrypted } from "./use-is-encrypted";

/**
 * Participant metadata structure stored in LiveKit token.
 * Must match the structure set in /api/livekit/token/route.ts
 */
interface ParticipantMetadata {
  email?: string;
  image?: string | null;
}

/**
 * Parse participant metadata from JSON string.
 * Returns null for image if parsing fails or image is not set.
 */
function parseParticipantMetadata(metadata?: string): ParticipantMetadata {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata) as ParticipantMetadata;
  } catch {
    return {};
  }
}

/**
 * Generate initials from a name string.
 * Takes first letter of first two words, uppercase.
 */
function getInitials(name?: string): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ============================================================================
// Context Providers (copied from LiveKit components for composition)
// ============================================================================

function ParticipantContextIfNeeded(
  props: React.PropsWithChildren<{
    participant?: import("livekit-client").Participant;
  }>
) {
  const hasContext = !!useMaybeParticipantContext();
  return props.participant && !hasContext ? (
    <ParticipantContext.Provider value={props.participant}>
      {props.children}
    </ParticipantContext.Provider>
  ) : (
    <>{props.children}</>
  );
}

function TrackRefContextIfNeeded(
  props: React.PropsWithChildren<{
    trackRef?: TrackReferenceOrPlaceholder;
  }>
) {
  const hasContext = !!useMaybeTrackRefContext();
  return props.trackRef && !hasContext ? (
    <TrackRefContext.Provider value={props.trackRef}>
      {props.children}
    </TrackRefContext.Provider>
  ) : (
    <>{props.children}</>
  );
}

// ============================================================================
// Custom Participant Tile Component
// ============================================================================

export interface CustomParticipantTileProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** The track reference to display. */
  trackRef?: TrackReferenceOrPlaceholder;
  /** Disable the speaking indicator border animation. */
  disableSpeakingIndicator?: boolean;
  /** Callback when participant tile is clicked. */
  onParticipantClick?: (event: ParticipantClickEvent) => void;
}

/**
 * Custom ParticipantTile component that replaces the default LiveKit placeholder
 * with a shadcn Avatar showing the user's profile image or initials.
 *
 * Features:
 * - Shows user's profile image from participant metadata
 * - Falls back to initials derived from participant name
 * - Proper theming for both light and dark modes
 * - Maintains all original LiveKit functionality (speaking indicator, mute indicators, etc.)
 */
export const CustomParticipantTile = React.forwardRef<
  HTMLDivElement,
  CustomParticipantTileProps
>(function CustomParticipantTile(
  {
    trackRef,
    children,
    onParticipantClick,
    disableSpeakingIndicator,
    className,
    ...htmlProps
  },
  ref
) {
  const trackReference = useEnsureTrackRef(trackRef);

  const { elementProps } = useParticipantTile<HTMLDivElement>({
    htmlProps,
    disableSpeakingIndicator,
    onParticipantClick,
    trackRef: trackReference,
  });

  const isEncrypted = useIsEncrypted(trackReference.participant);
  const layoutContext = useMaybeLayoutContext();

  // Parse participant metadata for avatar - memoized to avoid parsing on every render
  const { avatarUrl, participantName, initials } = React.useMemo(() => {
    const metadata = parseParticipantMetadata(
      trackReference.participant.metadata
    );
    const name =
      trackReference.participant.name || trackReference.participant.identity;
    return {
      avatarUrl: metadata.image,
      participantName: name,
      initials: getInitials(name),
    };
  }, [
    trackReference.participant.metadata,
    trackReference.participant.name,
    trackReference.participant.identity,
  ]);

  // Handle subscription changes for pinned tracks
  const handleSubscribe = React.useCallback(
    (subscribed: boolean) => {
      if (
        trackReference.source &&
        !subscribed &&
        layoutContext &&
        layoutContext.pin.dispatch &&
        isTrackReferencePinned(trackReference, layoutContext.pin.state)
      ) {
        layoutContext.pin.dispatch({ msg: "clear_pin" });
      }
    },
    [trackReference, layoutContext]
  );

  // Determine if video is available and not muted
  const isVideoTrack =
    isTrackReference(trackReference) &&
    (trackReference.publication?.kind === "video" ||
      trackReference.source === Track.Source.Camera ||
      trackReference.source === Track.Source.ScreenShare);

  const isVideoEnabled =
    isTrackReference(trackReference) &&
    trackReference.publication &&
    !trackReference.publication.isMuted;

  return (
    <div
      ref={ref}
      style={{ position: "relative" }}
      {...elementProps}
      className={cn("lk-participant-tile", className)}
    >
      <TrackRefContextIfNeeded trackRef={trackReference}>
        <ParticipantContextIfNeeded participant={trackReference.participant}>
          {children ?? (
            <>
              {/* Video Track */}
              {isVideoTrack && isTrackReference(trackReference) && (
                <VideoTrack
                  trackRef={trackReference}
                  onSubscriptionStatusChanged={handleSubscribe}
                />
              )}

              {/* Audio Track (for audio-only participants) */}
              {!isVideoTrack && isTrackReference(trackReference) && (
                <AudioTrack
                  trackRef={trackReference}
                  onSubscriptionStatusChanged={handleSubscribe}
                />
              )}

              {/* Custom Avatar Placeholder - shown when video is off */}
              <div
                className={cn(
                  "lk-participant-placeholder",
                  "absolute inset-0 flex items-center justify-center",
                  "transition-opacity duration-200",
                  isVideoEnabled ? "opacity-0 pointer-events-none" : "opacity-100"
                )}
              >
                <Avatar
                  className={cn(
                    "border-2 border-border/50",
                    // Responsive sizing based on container
                    "h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 lg:h-28 lg:w-28"
                  )}
                >
                  {avatarUrl && (
                    <AvatarImage
                      src={avatarUrl}
                      alt={participantName}
                      className="object-cover"
                    />
                  )}
                  <AvatarFallback
                    className={cn(
                      "text-lg sm:text-xl md:text-2xl lg:text-3xl font-medium",
                      "bg-primary text-primary-foreground"
                    )}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>

              {/* Participant Metadata Overlay */}
              <div className="lk-participant-metadata">
                <div className="lk-participant-metadata-item">
                  {trackReference.source === Track.Source.Camera ? (
                    <>
                      {isEncrypted && (
                        <Lock
                          className="h-3.5 w-3.5 mr-1"
                          aria-label="Encrypted"
                        />
                      )}
                      <TrackMutedIndicator
                        trackRef={{
                          participant: trackReference.participant,
                          source: Track.Source.Microphone,
                        }}
                        show="muted"
                      />
                      <ParticipantName />
                    </>
                  ) : (
                    <>
                      <Monitor className="h-3.5 w-3.5 mr-1" aria-label="Screen share" />
                      <ParticipantName>&apos;s screen</ParticipantName>
                    </>
                  )}
                </div>
                <ConnectionQualityIndicator className="lk-participant-metadata-item" />
              </div>
            </>
          )}
          <FocusToggle trackRef={trackReference} />
        </ParticipantContextIfNeeded>
      </TrackRefContextIfNeeded>
    </div>
  );
});

CustomParticipantTile.displayName = "CustomParticipantTile";
