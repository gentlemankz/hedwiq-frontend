"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRoomContext, useParticipants } from "@livekit/components-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText, ChevronDown, X } from "lucide-react";

interface TranscriptionEntry {
  id: string;
  participantIdentity: string;
  participantName: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
}

interface TranscriptionSidebarProps {
  className?: string;
  onClose?: () => void;
}

export function TranscriptionSidebar({
  className,
  onClose,
}: TranscriptionSidebarProps) {
  const room = useRoomContext();
  const participants = useParticipants();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [entries, setEntries] = useState<TranscriptionEntry[]>([]);

  // Memoize participant map for name lookups
  const participantMap = useMemo(() => {
    return new Map(
      participants.map((p) => [p.identity, p.name || p.identity])
    );
  }, [participants]);

  // Register text stream handler directly on the room
  useEffect(() => {
    if (!room) return;

    console.log("=== Registering lk.transcription handler ===");

    const handleTextStream = async (
      reader: {
        info: {
          id: string;
          timestamp?: number;
          attributes?: Record<string, string>;
        };
        readAll: () => Promise<string>;
        [Symbol.asyncIterator]: () => AsyncIterator<string>;
      },
      participantInfo: { identity: string }
    ) => {
      const attrs = reader.info.attributes || {};
      const segmentId = attrs["lk.segment_id"] || reader.info.id;
      const isFinal = attrs["lk.transcription_final"] === "true";
      const speakerIdentity = attrs["speaker_identity"] || participantInfo.identity;
      const speakerName = attrs["speaker_name"] || speakerIdentity;

      console.log("=== TEXT STREAM RECEIVED ===", {
        segmentId,
        isFinal,
        speakerIdentity,
        speakerName,
        participantIdentity: participantInfo.identity,
        streamId: reader.info.id,
      });

      // Read all text from the stream
      const text = await reader.readAll();

      console.log("=== TEXT CONTENT ===", { segmentId, text, isFinal });

      if (!text.trim()) return;

      const entry: TranscriptionEntry = {
        id: segmentId,
        participantIdentity: speakerIdentity,
        participantName: speakerName,
        text,
        timestamp: reader.info.timestamp || Date.now(),
        isFinal,
      };

      setEntries((prev) => {
        // Find existing entry with same segment ID
        const existingIndex = prev.findIndex((e) => e.id === segmentId);

        if (existingIndex !== -1) {
          // Update existing entry
          const existing = prev[existingIndex];
          // Only update if: new text is longer, or replacing interim with final
          if (isFinal || text.length > existing.text.length) {
            const updated = [...prev];
            updated[existingIndex] = entry;
            console.log("=== UPDATED ENTRY ===", { segmentId, text });
            return updated;
          }
          return prev;
        } else {
          // Add new entry
          console.log("=== NEW ENTRY ADDED ===", { segmentId, text, totalEntries: prev.length + 1 });
          return [...prev, entry].sort((a, b) => a.timestamp - b.timestamp);
        }
      });
    };

    // Register the handler
    room.registerTextStreamHandler("lk.transcription", handleTextStream);
    console.log("=== Handler registered for lk.transcription ===");

    return () => {
      console.log("=== Unregistering lk.transcription handler ===");
      room.unregisterTextStreamHandler("lk.transcription");
    };
  }, [room]);

  // Auto-scroll to bottom when new transcriptions arrive
  useEffect(() => {
    if (autoScroll && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [entries, autoScroll]);

  // Handle scroll events to detect manual scrolling
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  // Scroll to bottom button handler
  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        setAutoScroll(true);
      }
    }
  }, []);

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Get a consistent color for each participant
  const getParticipantColor = (identity: string) => {
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-orange-500",
      "bg-pink-500",
      "bg-cyan-500",
      "bg-yellow-500",
      "bg-red-500",
    ];
    let hash = 0;
    for (let i = 0; i < identity.length; i++) {
      hash = identity.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Get final entries as individual messages (no grouping - each sentence is separate)
  const finalEntries = useMemo(() => {
    return entries.filter(e => e.isFinal);
  }, [entries]);

  // Get the current interim transcription (if any)
  const interimEntry = useMemo(() => {
    return entries.find(e => !e.isFinal);
  }, [entries]);

  return (
    <div
      className={cn(
        "flex h-full flex-col border-l bg-background",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">Transcription</h2>
          {finalEntries.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({finalEntries.length} messages)
            </span>
          )}
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Transcription content */}
      <div className="relative flex-1" ref={scrollAreaRef}>
        <ScrollArea
          className="h-full"
          onScrollCapture={handleScroll}
        >
          <div className="space-y-4 p-4">
            {finalEntries.length === 0 && !interimEntry ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <FileText className="mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">No transcriptions yet</p>
                <p className="text-xs">
                  Transcriptions will appear here as people speak
                </p>
              </div>
            ) : (
              <>
                {finalEntries.map((entry) => (
                  <div key={entry.id} className="flex gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback
                        className={cn(
                          "text-xs text-white",
                          getParticipantColor(entry.participantIdentity)
                        )}
                      >
                        {getInitials(entry.participantName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {entry.participantName}
                      </p>
                      <p className="text-sm text-foreground">
                        {entry.text}
                      </p>
                    </div>
                  </div>
                ))}
                {/* Show interim transcription with typing indicator */}
                {interimEntry && (
                  <div className="flex gap-3 opacity-60">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback
                        className={cn(
                          "text-xs text-white",
                          getParticipantColor(interimEntry.participantIdentity)
                        )}
                      >
                        {getInitials(interimEntry.participantName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {interimEntry.participantName}
                        <span className="ml-2 text-xs text-muted-foreground italic">typing...</span>
                      </p>
                      <p className="text-sm text-foreground italic">
                        {interimEntry.text}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Scroll to bottom button */}
        {!autoScroll && entries.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 shadow-lg"
            onClick={scrollToBottom}
          >
            <ChevronDown className="mr-1 h-4 w-4" />
            New messages
          </Button>
        )}
      </div>
    </div>
  );
}
