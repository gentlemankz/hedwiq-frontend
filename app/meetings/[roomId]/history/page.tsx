import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getMeetingByRoomId } from "@/lib/db/meeting";
import { MeetingHistoryView } from "./meeting-history-view";

interface MeetingHistoryPageProps {
  params: Promise<{ roomId: string }>;
}

/**
 * Page for viewing historical meeting data.
 * Shows transcription, insights, document references, and notes.
 */
export default async function MeetingHistoryPage({
  params,
}: MeetingHistoryPageProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  const { roomId } = await params;

  // Look up meeting by room ID
  const meeting = await getMeetingByRoomId(roomId);

  if (!meeting) {
    notFound();
  }

  return (
    <MeetingHistoryView
      meetingId={meeting.id}
      roomId={roomId}
      initialTitle={meeting.title}
    />
  );
}

export async function generateMetadata({
  params,
}: MeetingHistoryPageProps) {
  const { roomId } = await params;
  const meeting = await getMeetingByRoomId(roomId);

  return {
    title: meeting ? `${meeting.title} - History` : "Meeting History",
    description: "View transcription, insights, and notes from this meeting",
  };
}
