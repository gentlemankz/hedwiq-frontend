"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Video, Mic, AlertCircle } from "lucide-react";
import Link from "next/link";

interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

interface PreJoinScreenProps {
  roomId: string;
  user: User;
  onJoin: () => void;
  isConnecting: boolean;
  error: string | null;
}

export function PreJoinScreen({
  roomId,
  user,
  onJoin,
  isConnecting,
  error,
}: PreJoinScreenProps) {
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Join Meeting</CardTitle>
          <CardDescription>
            Room: <span className="font-mono font-medium">{roomId}</span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* User info */}
          <div className="flex items-center justify-center gap-3">
            <Avatar className="size-12">
              <AvatarImage src={user.image || undefined} alt={user.name} />
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>

          {/* Media info */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="mb-3 text-center text-sm text-muted-foreground">
              After joining, you can enable:
            </p>
            <div className="flex justify-center gap-6">
              <div className="flex items-center gap-2">
                <Video className="size-5 text-muted-foreground" />
                <span className="text-sm">Camera</span>
              </div>
              <div className="flex items-center gap-2">
                <Mic className="size-5 text-muted-foreground" />
                <span className="text-sm">Microphone</span>
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Use the control bar to toggle your devices
            </p>
          </div>

          {/* Error message */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button
            onClick={onJoin}
            disabled={isConnecting}
            className="w-full"
            size="lg"
          >
            {isConnecting ? (
              <>
                <Spinner className="mr-2 size-4" />
                Joining...
              </>
            ) : (
              "Join Meeting"
            )}
          </Button>

          <Button variant="ghost" asChild className="w-full">
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
