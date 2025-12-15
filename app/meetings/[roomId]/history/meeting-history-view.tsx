"use client";

import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Clock,
  Users,
  FileText,
  Lightbulb,
  StickyNote,
  FileIcon,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  getInitials,
  formatDurationCompact,
  formatMeetingTime,
} from "@/lib/utils";
import type {
  MeetingHistoryFull,
  TranscriptionSegmentRecord,
  InsightRecord,
  DocumentReferenceRecord,
  MeetingNotesRecord,
} from "@/types/meeting-history";
import type { InsightType } from "@/types/insight";

interface MeetingHistoryViewProps {
  meetingId: string;
  roomId: string; // Kept for potential future features (e.g., document links)
  initialTitle: string;
}

/**
 * Client-side view for meeting history.
 * Fetches and displays full meeting data.
 */
export function MeetingHistoryView({
  meetingId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  roomId,
  initialTitle,
}: MeetingHistoryViewProps) {
  const router = useRouter();
  const [history, setHistory] = useState<MeetingHistoryFull | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/meetings/${meetingId}/history`);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load meeting history");
      }

      const data: MeetingHistoryFull = await response.json();
      setHistory(data);
    } catch (err) {
      console.error("Failed to fetch meeting history:", err);
      setError(err instanceof Error ? err.message : "Failed to load meeting history");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  const handleBack = () => {
    router.push("/dashboard");
  };

  if (isLoading) {
    return <MeetingHistoryLoading title={initialTitle} onBack={handleBack} />;
  }

  if (error || !history) {
    return (
      <MeetingHistoryError
        title={initialTitle}
        error={error || "Meeting not found"}
        onBack={handleBack}
        onRetry={fetchHistory}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="size-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold truncate">
                {history.meeting.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {formatMeetingDateFull(history.meeting.endedAt || history.meeting.startedAt)}
              </p>
            </div>
            <Badge variant={history.meeting.status === "ended" ? "secondary" : "default"}>
              {history.meeting.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            icon={<Clock className="size-4" />}
            label="Duration"
            value={formatDurationCompact(history.stats.totalDurationMinutes)}
          />
          <StatsCard
            icon={<Users className="size-4" />}
            label="Participants"
            value={history.stats.participantCount.toString()}
          />
          <StatsCard
            icon={<FileText className="size-4" />}
            label="Transcription"
            value={`${history.stats.transcriptionSegmentCount} segments`}
          />
          <StatsCard
            icon={<Lightbulb className="size-4" />}
            label="Insights"
            value={history.stats.insightCount.toString()}
          />
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="transcription" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="transcription" className="gap-2">
              <FileText className="size-4" />
              <span className="hidden sm:inline">Transcript</span>
            </TabsTrigger>
            <TabsTrigger value="insights" className="gap-2">
              <Lightbulb className="size-4" />
              <span className="hidden sm:inline">Insights</span>
              {history.stats.insightCount > 0 && (
                <Badge variant="secondary" className="ml-1 hidden sm:inline-flex">
                  {history.stats.insightCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2">
              <FileIcon className="size-4" />
              <span className="hidden sm:inline">Documents</span>
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-2">
              <StickyNote className="size-4" />
              <span className="hidden sm:inline">Notes</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transcription" className="space-y-4">
            <TranscriptionTab transcription={history.transcription} />
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            <InsightsTab insights={history.insights} />
          </TabsContent>

          <TabsContent value="documents" className="space-y-4">
            <DocumentsTab documents={history.documentReferences} />
          </TabsContent>

          <TabsContent value="notes" className="space-y-4">
            <NotesTab notes={history.notes} />
          </TabsContent>
        </Tabs>

        {/* Participants */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Participants</CardTitle>
            <CardDescription>
              People who attended this meeting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {/* Host */}
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Avatar className="size-10">
                  <AvatarImage src={history.host.image || undefined} />
                  <AvatarFallback>{getInitials(history.host.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{history.host.name}</p>
                  <p className="text-xs text-muted-foreground">Host</p>
                </div>
              </div>

              {/* Other participants */}
              {history.sessions
                .filter((s) => s.userId !== history.host.id)
                .map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <Avatar className="size-10">
                      <AvatarFallback>{getInitials(session.userName)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{session.userName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDurationCompact(Math.floor((session.durationSeconds || 0) / 60))}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// Stats Card
// ============================================================================

interface StatsCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function StatsCard({ icon, label, value }: StatsCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="rounded-full bg-primary/10 p-3 text-primary">
            {icon}
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Transcription Tab
// ============================================================================

interface TranscriptionTabProps {
  transcription: TranscriptionSegmentRecord[];
}

function TranscriptionTab({ transcription }: TranscriptionTabProps) {
  if (transcription.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <FileText className="mx-auto size-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              No transcription available for this meeting
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Transcription</CardTitle>
        <CardDescription>
          Full transcript of the meeting conversation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {transcription.map((segment, index) => (
              <TranscriptionSegment
                key={segment.id}
                segment={segment}
                showSpeaker={
                  index === 0 ||
                  transcription[index - 1].speakerName !== segment.speakerName
                }
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

interface TranscriptionSegmentProps {
  segment: TranscriptionSegmentRecord;
  showSpeaker: boolean;
}

function TranscriptionSegment({ segment, showSpeaker }: TranscriptionSegmentProps) {
  return (
    <div className="group">
      {showSpeaker && (
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{segment.speakerName}</span>
          <span className="text-xs text-muted-foreground">
            {formatMeetingTime(segment.timestamp)}
          </span>
        </div>
      )}
      <p className="text-sm text-muted-foreground pl-0">{segment.text}</p>
    </div>
  );
}

// ============================================================================
// Insights Tab
// ============================================================================

interface InsightsTabProps {
  insights: InsightRecord[];
}

function InsightsTab({ insights }: InsightsTabProps) {
  if (insights.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <Lightbulb className="mx-auto size-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              No insights captured from this meeting
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group insights by type
  const groupedInsights = insights.reduce((acc, insight) => {
    const type = insight.type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(insight);
    return acc;
  }, {} as Record<InsightType, InsightRecord[]>);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Object.entries(groupedInsights).map(([type, items]) => (
        <Card key={type}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {getInsightIcon(type as InsightType)}
              <span className="capitalize">{type.replace("_", " ")}s</span>
              <Badge variant="secondary">{items.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {items.map((insight) => (
                <li
                  key={insight.id}
                  className="text-sm text-muted-foreground flex items-start gap-2"
                >
                  <span className="text-primary">•</span>
                  <span>{insight.content}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function getInsightIcon(type: InsightType) {
  const icons: Record<InsightType, React.ReactNode> = {
    action_item: <span className="text-blue-500">✓</span>,
    decision: <span className="text-green-500">⚡</span>,
    question: <span className="text-yellow-500">?</span>,
    concern: <span className="text-red-500">!</span>,
    followup: <span className="text-purple-500">→</span>,
    key_point: <span className="text-cyan-500">★</span>,
  };
  return icons[type] || <Lightbulb className="size-4" />;
}

// ============================================================================
// Documents Tab
// ============================================================================

interface DocumentsTabProps {
  documents: DocumentReferenceRecord[];
}

function DocumentsTab({ documents }: DocumentsTabProps) {
  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <FileIcon className="mx-auto size-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              No document references from this meeting
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group by document
  const groupedDocs = documents.reduce((acc, ref) => {
    const key = ref.documentId;
    if (!acc[key]) {
      acc[key] = {
        documentId: ref.documentId,
        documentTitle: ref.documentTitle,
        references: [],
      };
    }
    acc[key].references.push(ref);
    return acc;
  }, {} as Record<string, { documentId: string; documentTitle: string; references: DocumentReferenceRecord[] }>);

  return (
    <div className="space-y-4">
      {Object.values(groupedDocs).map((doc) => (
        <Card key={doc.documentId}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileIcon className="size-4" />
                {doc.documentTitle}
              </CardTitle>
              <Badge variant="secondary">
                {doc.references.length} reference{doc.references.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {doc.references.map((ref) => (
                <div
                  key={ref.id}
                  className="rounded-lg border bg-muted/50 p-3 space-y-1"
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Page {ref.pageNumber}</span>
                    {ref.sectionTitle && (
                      <>
                        <span>•</span>
                        <span>{ref.sectionTitle}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm">{ref.context}</p>
                  {ref.matchedText && (
                    <p className="text-xs text-muted-foreground italic">
                      &quot;{ref.matchedText}&quot;
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Notes Tab
// ============================================================================

interface NotesTabProps {
  notes: MeetingNotesRecord[];
}

function NotesTab({ notes }: NotesTabProps) {
  if (notes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <StickyNote className="mx-auto size-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              No notes saved from this meeting
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {notes.map((note) => (
        <Card key={note.userId}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Avatar className="size-6">
                <AvatarFallback className="text-xs">
                  {getInitials(note.userName)}
                </AvatarFallback>
              </Avatar>
              {note.userName}&apos;s Notes
            </CardTitle>
            <CardDescription>
              Last updated {formatMeetingTime(note.updatedAt)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {note.blocks.map((block) => {
                if (block.type === "text") {
                  return (
                    <div key={block.id} className="rounded-lg border p-3">
                      <p className="text-sm whitespace-pre-wrap">{block.content}</p>
                    </div>
                  );
                }

                // Transcript reference block
                const transcriptNote = note.transcriptNotes[block.transcriptNoteId];
                if (!transcriptNote) return null;

                return (
                  <div
                    key={block.id}
                    className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2"
                  >
                    {/* Original transcript */}
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">
                        {transcriptNote.reference.participantName}
                      </span>
                      : &quot;{transcriptNote.reference.transcriptText}&quot;
                    </div>
                    <Separator />
                    {/* Note content */}
                    <p className="text-sm">{transcriptNote.content}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Loading State
// ============================================================================

interface MeetingHistoryLoadingProps {
  title: string;
  onBack: () => void;
}

function MeetingHistoryLoading({ title, onBack }: MeetingHistoryLoadingProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="size-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">{title}</h1>
              <Skeleton className="h-4 w-32 mt-1" />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="size-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="size-5 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Loading meeting history...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// Error State
// ============================================================================

interface MeetingHistoryErrorProps {
  title: string;
  error: string;
  onBack: () => void;
  onRetry: () => void;
}

function MeetingHistoryError({
  title,
  error,
  onBack,
  onRetry,
}: MeetingHistoryErrorProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="size-5" />
            </Button>
            <h1 className="text-xl font-semibold">{title}</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <AlertCircle className="mx-auto size-12 text-destructive mb-4" />
              <p className="text-lg font-medium mb-2">Failed to load meeting history</p>
              <p className="text-muted-foreground mb-6">{error}</p>
              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={onBack}>
                  Back to Dashboard
                </Button>
                <Button onClick={onRetry}>
                  <RefreshCw className="mr-2 size-4" />
                  Try Again
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatMeetingDateFull(dateString: string | null): string {
  if (!dateString) return "Unknown date";
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
