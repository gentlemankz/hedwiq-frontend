import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get room name from query params
    const { searchParams } = new URL(request.url);
    const roomName = searchParams.get("room");

    if (!roomName) {
      return NextResponse.json(
        { error: "Room name is required" },
        { status: 400 }
      );
    }

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "LiveKit API credentials not configured" },
        { status: 500 }
      );
    }

    // Create access token with user identity from session
    const at = new AccessToken(apiKey, apiSecret, {
      identity: session.user.id,
      name: session.user.name,
      metadata: JSON.stringify({
        email: session.user.email,
        image: session.user.image,
      }),
    });

    // Grant permissions
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      canUpdateOwnMetadata: true,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      identity: session.user.id,
      name: session.user.name,
    });
  } catch (error) {
    console.error("Error generating LiveKit token:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
