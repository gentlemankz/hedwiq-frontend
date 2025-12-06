"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Video, VideoOff, Mic, MicOff } from "lucide-react";

interface MediaControlsProps {
  // Video state
  videoEnabled: boolean;
  videoDevices: MediaDeviceInfo[];
  selectedVideoDevice: string;
  isTogglingVideo: boolean;
  onToggleVideo: () => void;
  onVideoDeviceChange: (deviceId: string) => void;
  // Audio state
  audioEnabled: boolean;
  audioDevices: MediaDeviceInfo[];
  selectedAudioDevice: string;
  isTogglingAudio: boolean;
  onToggleAudio: () => void;
  onAudioDeviceChange: (deviceId: string) => void;
}

/**
 * Media controls component for toggling camera/microphone and selecting devices.
 */
export function MediaControls({
  videoEnabled,
  videoDevices,
  selectedVideoDevice,
  isTogglingVideo,
  onToggleVideo,
  onVideoDeviceChange,
  audioEnabled,
  audioDevices,
  selectedAudioDevice,
  isTogglingAudio,
  onToggleAudio,
  onAudioDeviceChange,
}: MediaControlsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-4">
      {/* Video Toggle + Device Select */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={videoEnabled ? "default" : "secondary"}
          size="lg"
          onClick={onToggleVideo}
          disabled={isTogglingVideo}
          className="gap-2"
        >
          {videoEnabled ? (
            <Video className="size-5" />
          ) : (
            <VideoOff className="size-5" />
          )}
          {isTogglingVideo ? "..." : "Camera"}
        </Button>
        {videoDevices.length > 1 && (
          <Select value={selectedVideoDevice} onValueChange={onVideoDeviceChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select camera" />
            </SelectTrigger>
            <SelectContent>
              {videoDevices.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Audio Toggle + Device Select */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={audioEnabled ? "default" : "secondary"}
          size="lg"
          onClick={onToggleAudio}
          disabled={isTogglingAudio}
          className="gap-2"
        >
          {audioEnabled ? (
            <Mic className="size-5" />
          ) : (
            <MicOff className="size-5" />
          )}
          {isTogglingAudio ? "..." : "Microphone"}
        </Button>
        {audioDevices.length > 1 && (
          <Select value={selectedAudioDevice} onValueChange={onAudioDeviceChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select microphone" />
            </SelectTrigger>
            <SelectContent>
              {audioDevices.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label || `Mic ${device.deviceId.slice(0, 8)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
