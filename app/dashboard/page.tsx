import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardClient } from "./dashboard-client";
import { listMeetingsByHost } from "@/lib/db/meeting";
import {
  getCalendarIntegration,
  toPublicCalendarIntegration,
} from "@/lib/db/calendar";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  // Fetch upcoming meetings and calendar status in parallel
  const [upcomingMeetings, calendarIntegration] = await Promise.all([
    listMeetingsByHost(session.user.id, {
      status: "upcoming",
      limit: 10,
    }),
    getCalendarIntegration(session.user.id),
  ]);

  // Convert calendar integration to public format (no tokens)
  const calendarStatus =
    calendarIntegration && calendarIntegration.status !== "disconnected"
      ? {
          connected: calendarIntegration.status === "connected",
          integration: toPublicCalendarIntegration(calendarIntegration),
        }
      : { connected: false, integration: null };

  return (
    <DashboardClient
      user={session.user}
      initialMeetings={upcomingMeetings}
      initialCalendarStatus={calendarStatus}
    />
  );
}
