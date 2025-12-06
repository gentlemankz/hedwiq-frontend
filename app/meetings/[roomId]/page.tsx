import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MeetingRoom } from "./meeting-room";

interface MeetingPageProps {
  params: Promise<{ roomId: string }>;
}

export default async function MeetingPage({ params }: MeetingPageProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  const { roomId } = await params;

  return (
    <MeetingRoom
      roomId={roomId}
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }}
    />
  );
}
