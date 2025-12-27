import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <main className="flex flex-col items-center justify-center gap-8 px-4 text-center">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Luframe
          </h1>
          <p className="text-xl text-muted-foreground">
            AI-Powered Meeting Intelligence
          </p>
        </div>

        <p className="max-w-md text-muted-foreground">
          Transform every meeting into a knowledge engine with real-time
          transcription, intelligent insights, and automated notes.
        </p>

        <div className="flex gap-4">
          <Button asChild size="lg">
            <Link href="/sign-in">Get Started</Link>
          </Button>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="space-y-2">
            <div className="text-2xl">Live Transcription</div>
            <p className="text-sm text-muted-foreground">
              Real-time speech-to-text with speaker differentiation
            </p>
          </div>
          <div className="space-y-2">
            <div className="text-2xl">Smart Insights</div>
            <p className="text-sm text-muted-foreground">
              Automatic detection of ideas, action items, and decisions
            </p>
          </div>
          <div className="space-y-2">
            <div className="text-2xl">Auto Notes</div>
            <p className="text-sm text-muted-foreground">
              Structured meeting notes generated in real-time
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
