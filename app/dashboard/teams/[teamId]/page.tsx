import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getTeamById, getTeamMembers } from "@/lib/db/team";
import { TeamDetailView } from "./team-detail-view";

interface TeamDetailPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function TeamDetailPage({ params }: TeamDetailPageProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  const { teamId } = await params;

  // Fetch team details
  const team = await getTeamById(teamId, session.user.id);

  if (!team) {
    notFound();
  }

  // Fetch team members
  const members = await getTeamMembers(teamId, session.user.id);

  return (
    <TeamDetailView
      team={team}
      members={members}
      userId={session.user.id}
    />
  );
}
