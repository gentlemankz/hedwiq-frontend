import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { TemplatesPageClient } from "./templates-page-client";
import { listTeamsForUser } from "@/lib/db/team";

export default async function TemplatesPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  // Fetch user's teams for the "Save to Team" functionality
  const teams = await listTeamsForUser(session.user.id);

  return (
    <TemplatesPageClient
      userId={session.user.id}
      teams={teams.map((t) => ({ id: t.id, name: t.name }))}
    />
  );
}
