"use client";

import { useRef, useEffect } from "react";
import { User as UserIcon } from "lucide-react";

interface VideoPreviewProps {
  videoEnabled: boolean;
  videoStream: MediaStream | null;
}

/**
 * Video preview component for the PreJoin screen.
 * Displays either the camera feed or a placeholder when camera is off.
 */
export function VideoPreview({ videoEnabled, videoStream }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach video stream to video element
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // Always update srcObject, even when null (to clear stale frames)
    videoElement.srcObject = videoStream;

    // Cleanup function to clear srcObject when component unmounts
    return () => {
      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  }, [videoStream]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
      {videoEnabled && videoStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="size-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center text-muted-foreground">
          <UserIcon className="mb-2 size-16 opacity-50" />
          <p className="text-sm">Camera is off</p>
        </div>
      )}
    </div>
  );
}
