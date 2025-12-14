"use client";

import * as React from "react";
import type {
  MessageDecoder,
  MessageEncoder,
  TrackReferenceOrPlaceholder,
  WidgetState,
} from "@livekit/components-core";
import {
  isEqualTrackRef,
  isTrackReference,
  isWeb,
} from "@livekit/components-core";
import { RoomEvent, Track } from "livekit-client";
import {
  CarouselLayout,
  ConnectionStateToast,
  FocusLayoutContainer,
  GridLayout,
  LayoutContextProvider,
  RoomAudioRenderer,
  Chat,
  useCreateLayoutContext,
  usePinnedTracks,
  useTracks,
} from "@livekit/components-react";
import { CustomControlBar } from "@/components/meeting/custom-control-bar";
import type { MessageFormatter } from "@livekit/components-react";
import { CustomParticipantTile } from "./custom-participant-tile";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Props for the CustomVideoConference component.
 */
export interface CustomVideoConferenceProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Formatter for chat messages. */
  chatMessageFormatter?: MessageFormatter;
  /** Encoder for chat messages. */
  chatMessageEncoder?: MessageEncoder;
  /** Decoder for chat messages. */
  chatMessageDecoder?: MessageDecoder;
  /** Custom settings component to show in modal. */
  SettingsComponent?: React.ComponentType;
}

/**
 * Custom VideoConference component that uses our CustomParticipantTile
 * with shadcn Avatar integration instead of the default LiveKit placeholder.
 *
 * This is a modified version of LiveKit's VideoConference prefab that:
 * - Replaces ParticipantTile with CustomParticipantTile
 * - Shows user profile images from participant metadata
 * - Falls back to initials when no image is available
 * - Properly themes for both light and dark modes
 *
 * @example
 * ```tsx
 * <LiveKitRoom>
 *   <CustomVideoConference />
 * </LiveKitRoom>
 * ```
 */
export function CustomVideoConference({
  chatMessageFormatter,
  chatMessageDecoder,
  chatMessageEncoder,
  SettingsComponent,
  ...props
}: CustomVideoConferenceProps) {
  const [widgetState, setWidgetState] = React.useState<WidgetState>({
    showChat: false,
    unreadMessages: 0,
    showSettings: false,
  });

  const lastAutoFocusedScreenShareTrack =
    React.useRef<TrackReferenceOrPlaceholder | null>(null);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false }
  );

  const widgetUpdate = (state: WidgetState) => {
    setWidgetState(state);
  };

  const layoutContext = useCreateLayoutContext();

  const screenShareTracks = tracks
    .filter(isTrackReference)
    .filter((track) => track.publication.source === Track.Source.ScreenShare);

  const focusTrack = usePinnedTracks(layoutContext)?.[0];
  const carouselTracks = tracks.filter(
    (track) => !isEqualTrackRef(track, focusTrack)
  );

  // Create a stable dependency key for screen share tracks
  const screenShareTrackKey = React.useMemo(
    () =>
      screenShareTracks
        .map((ref) => `${ref.publication.trackSid}_${ref.publication.isSubscribed}`)
        .join(","),
    [screenShareTracks]
  );

  // Auto-focus screen share when it starts
  React.useEffect(() => {
    if (
      screenShareTracks.some((track) => track.publication.isSubscribed) &&
      lastAutoFocusedScreenShareTrack.current === null
    ) {
      layoutContext.pin.dispatch?.({
        msg: "set_pin",
        trackReference: screenShareTracks[0],
      });
      lastAutoFocusedScreenShareTrack.current = screenShareTracks[0];
    } else if (
      lastAutoFocusedScreenShareTrack.current &&
      !screenShareTracks.some(
        (track) =>
          track.publication.trackSid ===
          lastAutoFocusedScreenShareTrack.current?.publication?.trackSid
      )
    ) {
      layoutContext.pin.dispatch?.({ msg: "clear_pin" });
      lastAutoFocusedScreenShareTrack.current = null;
    }

    // Update focus track if it becomes a real track reference
    if (focusTrack && !isTrackReference(focusTrack)) {
      const updatedFocusTrack = tracks.find(
        (tr) =>
          tr.participant.identity === focusTrack.participant.identity &&
          tr.source === focusTrack.source
      );
      if (updatedFocusTrack !== focusTrack && isTrackReference(updatedFocusTrack)) {
        layoutContext.pin.dispatch?.({
          msg: "set_pin",
          trackReference: updatedFocusTrack,
        });
      }
    }
  }, [screenShareTrackKey, screenShareTracks, focusTrack, tracks, layoutContext.pin]);

  return (
    <div className="lk-video-conference" {...props}>
      {isWeb() && (
        <LayoutContextProvider
          value={layoutContext}
          onWidgetChange={widgetUpdate}
        >
          <div className="lk-video-conference-inner">
            {!focusTrack ? (
              <div className="lk-grid-layout-wrapper">
                <GridLayout tracks={tracks}>
                  {/* Use our custom ParticipantTile with Avatar */}
                  <CustomParticipantTile />
                </GridLayout>
              </div>
            ) : (
              <div className="lk-focus-layout-wrapper">
                <FocusLayoutContainer>
                  <CarouselLayout tracks={carouselTracks}>
                    {/* Use our custom ParticipantTile with Avatar */}
                    <CustomParticipantTile />
                  </CarouselLayout>
                  {/* Use CustomParticipantTile for focused track to maintain avatar consistency */}
                  {focusTrack && (
                    <div className="lk-focused-layout">
                      <CustomParticipantTile trackRef={focusTrack} />
                    </div>
                  )}
                </FocusLayoutContainer>
              </div>
            )}
            {/* Control Bar */}
            <div className="lk-control-bar flex items-center justify-center p-4">
              <TooltipProvider delayDuration={0}>
                <CustomControlBar
                  controls={{
                    microphone: true,
                    camera: true,
                    screenShare: true,
                    chat: true,
                    leave: true,
                  }}
                  widgetState={widgetState}
                />
              </TooltipProvider>
            </div>
          </div>
          <Chat
            style={{ display: widgetState.showChat ? "grid" : "none" }}
            messageFormatter={chatMessageFormatter}
            messageEncoder={chatMessageEncoder}
            messageDecoder={chatMessageDecoder}
          />
          {SettingsComponent && (
            <div
              className="lk-settings-menu-modal"
              style={{ display: widgetState.showSettings ? "block" : "none" }}
            >
              <SettingsComponent />
            </div>
          )}
        </LayoutContextProvider>
      )}
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}
