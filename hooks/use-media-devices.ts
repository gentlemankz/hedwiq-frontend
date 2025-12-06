"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface UseMediaDevicesOptions {
  /** Initial video device ID */
  initialVideoDeviceId?: string;
  /** Initial audio device ID */
  initialAudioDeviceId?: string;
}

interface UseMediaDevicesReturn {
  // Video state
  videoEnabled: boolean;
  videoStream: MediaStream | null;
  videoDevices: MediaDeviceInfo[];
  selectedVideoDevice: string;
  // Audio state
  audioEnabled: boolean;
  audioDevices: MediaDeviceInfo[];
  selectedAudioDevice: string;
  // Actions
  toggleVideo: () => Promise<void>;
  toggleAudio: () => Promise<void>;
  setSelectedVideoDevice: (deviceId: string) => Promise<void>;
  setSelectedAudioDevice: (deviceId: string) => void;
  // Status
  permissionError: string | null;
  isTogglingVideo: boolean;
  isTogglingAudio: boolean;
  // Cleanup
  stopAllStreams: () => void;
}

/**
 * Custom hook for managing media devices (camera and microphone)
 * with proper cleanup, race condition prevention, and debouncing.
 *
 * @param options - Configuration options for initial device IDs
 * @returns Object containing device state, actions, and status
 */
export function useMediaDevices(
  options: UseMediaDevicesOptions = {}
): UseMediaDevicesReturn {
  const { initialVideoDeviceId = "", initialAudioDeviceId = "" } = options;

  // Video state
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDeviceState] =
    useState(initialVideoDeviceId);

  // Audio state
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDeviceState] =
    useState(initialAudioDeviceId);

  // Status state
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isTogglingVideo, setIsTogglingVideo] = useState(false);
  const [isTogglingAudio, setIsTogglingAudio] = useState(false);

  // Refs for cleanup and race condition prevention
  const activeStreamsRef = useRef<Set<MediaStream>>(new Set());
  const isMountedRef = useRef(true);
  const currentVideoStreamRef = useRef<MediaStream | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    currentVideoStreamRef.current = videoStream;
    if (videoStream) {
      activeStreamsRef.current.add(videoStream);
    }
  }, [videoStream]);

  // Cleanup on unmount - stop ALL tracked streams
  useEffect(() => {
    isMountedRef.current = true;
    const activeStreams = activeStreamsRef.current;

    return () => {
      isMountedRef.current = false;
      activeStreams.forEach((stream) => {
        stream.getTracks().forEach((track) => track.stop());
      });
      activeStreams.clear();
    };
  }, []);

  // Enumerate devices (called after permission is granted or on device change)
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      const audioInputs = devices.filter((d) => d.kind === "audioinput");

      if (!isMountedRef.current) return;

      setVideoDevices(videoInputs);
      setAudioDevices(audioInputs);

      // Set default selections if not already set
      setSelectedVideoDeviceState((prev) =>
        prev || (videoInputs.length > 0 ? videoInputs[0].deviceId : "")
      );
      setSelectedAudioDeviceState((prev) =>
        prev || (audioInputs.length > 0 ? audioInputs[0].deviceId : "")
      );
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("Failed to enumerate devices:", err);
      }
    }
  }, []);

  // Initial device enumeration and devicechange listener
  useEffect(() => {
    // Try to enumerate devices on mount
    // This will work if permissions were previously granted
    const initDevices = async () => {
      try {
        // Check for existing permissions without prompting
        // Permissions API may not be available in all browsers
        if (navigator.permissions) {
          const [cameraPermission, micPermission] = await Promise.allSettled([
            navigator.permissions.query({ name: "camera" as PermissionName }),
            navigator.permissions.query({ name: "microphone" as PermissionName }),
          ]);

          const cameraGranted =
            cameraPermission.status === "fulfilled" &&
            cameraPermission.value.state === "granted";
          const micGranted =
            micPermission.status === "fulfilled" &&
            micPermission.value.state === "granted";

          if (cameraGranted || micGranted) {
            await enumerateDevices();
          }
        } else {
          // Fallback: try to enumerate anyway (may show limited info)
          await enumerateDevices();
        }
      } catch {
        // Permissions API not supported or query failed
        // Try enumeration anyway - will show device IDs but not labels
        await enumerateDevices();
      }
    };

    initDevices();

    // Listen for device changes (plugging/unplugging devices)
    const handleDeviceChange = () => {
      enumerateDevices();
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [enumerateDevices]);

  // Helper to handle media errors - centralized error handling
  const handleMediaError = useCallback(
    (err: unknown, mediaType: "Camera" | "Microphone") => {
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          setPermissionError(
            `${mediaType} access denied. Please allow ${mediaType.toLowerCase()} access in your browser settings.`
          );
        } else if (err.name === "NotFoundError") {
          setPermissionError(
            `No ${mediaType.toLowerCase()} found on this device.`
          );
        } else if (err.name === "NotReadableError") {
          setPermissionError(
            `${mediaType} is already in use by another application.`
          );
        } else {
          setPermissionError(`${mediaType} error: ${err.message}`);
        }
      }
    },
    []
  );

  // Stop a specific stream's tracks and remove from tracking
  const stopStream = useCallback((stream: MediaStream | null) => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      activeStreamsRef.current.delete(stream);
    }
  }, []);

  // Stop all active streams - used before joining room
  const stopAllStreams = useCallback(() => {
    if (currentVideoStreamRef.current) {
      stopStream(currentVideoStreamRef.current);
    }
    setVideoStream(null);
    setVideoEnabled(false);
    setAudioEnabled(false);
  }, [stopStream]);

  // Toggle video with debounce protection
  const toggleVideo = useCallback(async () => {
    if (isTogglingVideo) return;

    setPermissionError(null);
    setIsTogglingVideo(true);

    try {
      if (videoEnabled) {
        // Turn off video - stop current stream
        stopStream(currentVideoStreamRef.current);
        if (isMountedRef.current) {
          setVideoStream(null);
          setVideoEnabled(false);
        }
      } else {
        // Turn on video - request permission
        const constraints: MediaStreamConstraints = {
          video:
            selectedVideoDevice && selectedVideoDevice.length > 0
              ? { deviceId: { exact: selectedVideoDevice } }
              : true,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (!isMountedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        activeStreamsRef.current.add(stream);
        setVideoStream(stream);
        setVideoEnabled(true);
        await enumerateDevices();
      }
    } catch (err) {
      handleMediaError(err, "Camera");
    } finally {
      if (isMountedRef.current) {
        setIsTogglingVideo(false);
      }
    }
  }, [
    videoEnabled,
    selectedVideoDevice,
    isTogglingVideo,
    enumerateDevices,
    handleMediaError,
    stopStream,
  ]);

  // Toggle audio with debounce protection
  const toggleAudio = useCallback(async () => {
    if (isTogglingAudio) return;

    setPermissionError(null);
    setIsTogglingAudio(true);

    try {
      if (audioEnabled) {
        if (isMountedRef.current) {
          setAudioEnabled(false);
        }
      } else {
        // Request microphone permission
        const constraints: MediaStreamConstraints = {
          audio:
            selectedAudioDevice && selectedAudioDevice.length > 0
              ? { deviceId: { exact: selectedAudioDevice } }
              : true,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        // We don't need to keep the audio stream for preview, just check permission
        stream.getTracks().forEach((track) => track.stop());

        if (!isMountedRef.current) return;

        setAudioEnabled(true);
        await enumerateDevices();
      }
    } catch (err) {
      handleMediaError(err, "Microphone");
    } finally {
      if (isMountedRef.current) {
        setIsTogglingAudio(false);
      }
    }
  }, [
    audioEnabled,
    selectedAudioDevice,
    isTogglingAudio,
    enumerateDevices,
    handleMediaError,
  ]);

  // Handle video device change with Safari flicker prevention
  const setSelectedVideoDevice = useCallback(
    async (deviceId: string) => {
      // Bail out early if selecting the same device - prevents Safari NotReadableError
      if (deviceId === selectedVideoDevice) return;

      setSelectedVideoDeviceState(deviceId);

      // Only switch stream if video is currently enabled
      if (videoEnabled && currentVideoStreamRef.current) {
        const oldStream = currentVideoStreamRef.current;
        stopStream(oldStream);
        setVideoStream(null);

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: deviceId } },
          });

          if (!isMountedRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          activeStreamsRef.current.add(stream);
          setVideoStream(stream);
        } catch (err) {
          if (isMountedRef.current) {
            setVideoEnabled(false);
            handleMediaError(err, "Camera");
          }
        }
      }
    },
    [videoEnabled, selectedVideoDevice, stopStream, handleMediaError]
  );

  // Handle audio device change
  const setSelectedAudioDevice = useCallback((deviceId: string) => {
    setSelectedAudioDeviceState(deviceId);
  }, []);

  return {
    // Video state
    videoEnabled,
    videoStream,
    videoDevices,
    selectedVideoDevice,
    // Audio state
    audioEnabled,
    audioDevices,
    selectedAudioDevice,
    // Actions
    toggleVideo,
    toggleAudio,
    setSelectedVideoDevice,
    setSelectedAudioDevice,
    // Status
    permissionError,
    isTogglingVideo,
    isTogglingAudio,
    // Cleanup
    stopAllStreams,
  };
}
