import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import {
  getTeamById,
  getTeamMembers,
  getAncestorTeams,
  getEffectivePermissions,
} from "@/lib/db/team";
import { TeamDetailView } from "./team-detail-view";
import { TEAM_LIMITS } from "@/types/team";

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

  // Get effective permissions first (optimized: single call for role, depth, ancestors IDs)
  // This also serves as access check before fetching team details
  const permissions = await getEffectivePermissions(teamId, session.user.id);

  // Check if user has access (effective role is not null)
  if (!permissions.effectiveRole) {
    notFound();
  }

  // Fetch team details, members, and ancestor teams in parallel
  // Use pre-fetched ancestorIds from permissions to avoid duplicate queries
  const [team, members, ancestors] = await Promise.all([
    getTeamById(teamId),
    getTeamMembers(teamId, session.user.id),
    getAncestorTeams(teamId, permissions.ancestorIds),
  ]);

  if (!team) {
    notFound();
  }

  // Calculate if sub-teams can be created
  const canCreateMoreSubteams = permissions.depth < TEAM_LIMITS.MAX_SUB_TEAM_DEPTH;

  return (
    <TeamDetailView
      team={team}
      members={members}
      userId={session.user.id}
      ancestors={ancestors}
      effectiveRole={permissions.effectiveRole}
      isInheritedRole={permissions.isInherited}
      currentDepth={permissions.depth}
      maxDepth={TEAM_LIMITS.MAX_SUB_TEAM_DEPTH}
      canCreateMoreSubteams={canCreateMoreSubteams}
    />
  );
}
