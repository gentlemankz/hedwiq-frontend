import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardClient } from "./dashboard-client";
import { listMeetingsByHost } from "@/lib/db/meeting";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  // Fetch upcoming meetings
  const upcomingMeetings = await listMeetingsByHost(session.user.id, {
    status: "upcoming",
    limit: 10,
  });

  return <DashboardClient initialMeetings={upcomingMeetings} />;
}
