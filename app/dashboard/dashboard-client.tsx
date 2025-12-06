"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Video, Users } from "lucide-react";
import { validateRoomId, sanitizeRoomId } from "@/lib/validation";
import { getInitials } from "@/lib/utils";
import type { User } from "@/types/user";

/**
 * Generates a random room ID in the format "abc-defg-hij"
 * These generated IDs are always lowercase.
 */
function generateRoomId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const segments = [3, 4, 3];
  return segments
    .map((len) =>
      Array.from({ length: len }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length))
      ).join("")
    )
    .join("-");
}

export function DashboardClient({ user }: { user: User }) {
  const router = useRouter();
  const [joinRoomId, setJoinRoomId] = useState("");
  const [roomIdError, setRoomIdError] = useState<string | null>(null);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);

  // Mounted state for hydration safety with Radix UI Dialog
  // Using useSyncExternalStore to avoid lint warnings about setState in effect
  // This prevents hydration mismatch by returning false on server, true on client
  const isMounted = useSyncExternalStore(
    () => () => {}, // subscribe - no-op since we never update
    () => true,     // getSnapshot - client always returns true
    () => false     // getServerSnapshot - server returns false
  );

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/sign-in";
        },
      },
    });
  };

  const handleNewMeeting = () => {
    const roomId = generateRoomId();
    router.push(`/meetings/${roomId}`);
  };

  const handleRoomIdChange = (value: string) => {
    setJoinRoomId(value);
    // Clear error when user starts typing
    if (roomIdError) {
      setRoomIdError(null);
    }
  };

  const handleJoinMeeting = () => {
    const trimmedId = joinRoomId.trim();
    if (!trimmedId) {
      setRoomIdError("Room ID is required");
      return;
    }

    // Validate room ID format
    const validation = validateRoomId(trimmedId);
    if (!validation.isValid) {
      setRoomIdError(validation.error || "Invalid room ID");
      return;
    }

    // Sanitize but DON'T lowercase - preserve user's original case
    // LiveKit treats room names as arbitrary unique strings
    const sanitizedId = sanitizeRoomId(trimmedId, false);
    router.push(`/meetings/${sanitizedId}`);
    setIsJoinDialogOpen(false);
    setJoinRoomId("");
    setRoomIdError(null);
  };

  // Handle dialog open/close - clear state when closing
  const handleDialogOpenChange = (open: boolean) => {
    setIsJoinDialogOpen(open);
    if (!open) {
      // Clear form state when dialog closes
      setJoinRoomId("");
      setRoomIdError(null);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <Button variant="outline" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome back!</CardTitle>
            <CardDescription>
              You are signed in and ready to start your meetings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                <AvatarImage src={user.image || undefined} alt={user.name} />
                <AvatarFallback className="text-lg">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-lg font-medium">{user.name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Start a new meeting or join an existing one
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Button onClick={handleNewMeeting} className="gap-2">
              <Video className="size-4" />
              New Meeting
            </Button>

            {isMounted ? (
              <Dialog
                open={isJoinDialogOpen}
                onOpenChange={handleDialogOpenChange}
              >
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Users className="size-4" />
                    Join Meeting
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Join a Meeting</DialogTitle>
                    <DialogDescription>
                      Enter the meeting room ID to join an existing meeting.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="roomId">Room ID</Label>
                      <Input
                        id="roomId"
                        placeholder="e.g., abc-defg-hij"
                        value={joinRoomId}
                        onChange={(e) => handleRoomIdChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleJoinMeeting();
                          }
                        }}
                        aria-invalid={!!roomIdError}
                        aria-describedby={
                          roomIdError ? "roomId-error" : undefined
                        }
                      />
                      {roomIdError && (
                        <p id="roomId-error" className="text-sm text-destructive">
                          {roomIdError}
                        </p>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => handleDialogOpenChange(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleJoinMeeting}
                      disabled={!joinRoomId.trim()}
                    >
                      Join
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <Button variant="outline" className="gap-2" disabled>
                <Users className="size-4" />
                Join Meeting
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
