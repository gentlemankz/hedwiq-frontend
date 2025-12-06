"use client";

import { useState } from "react";
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

interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

function generateRoomId() {
  // Generate a random room ID like "abc-defg-hij"
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
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/sign-in";
        },
      },
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleNewMeeting = () => {
    const roomId = generateRoomId();
    router.push(`/meetings/${roomId}`);
  };

  const handleJoinMeeting = () => {
    if (joinRoomId.trim()) {
      router.push(`/meetings/${joinRoomId.trim()}`);
      setIsJoinDialogOpen(false);
      setJoinRoomId("");
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

            <Dialog open={isJoinDialogOpen} onOpenChange={setIsJoinDialogOpen}>
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
                      onChange={(e) => setJoinRoomId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleJoinMeeting();
                        }
                      }}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsJoinDialogOpen(false)}
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
