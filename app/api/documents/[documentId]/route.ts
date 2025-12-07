import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await params;

  // Get roomId from query params
  const roomId = request.nextUrl.searchParams.get("roomId");

  if (!roomId) {
    return NextResponse.json(
      { error: "roomId query parameter is required" },
      { status: 400 }
    );
  }

  // Validate formats
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(roomId)) {
    return NextResponse.json(
      { error: "Invalid room ID format" },
      { status: 400 }
    );
  }

  if (!/^doc-[a-zA-Z0-9_-]+$/.test(documentId)) {
    return NextResponse.json(
      { error: "Invalid document ID format" },
      { status: 400 }
    );
  }

  const agentServiceUrl = process.env.AGENT_SERVICE_URL;

  if (!agentServiceUrl) {
    return NextResponse.json(
      { error: "Document service not available" },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(
      `${agentServiceUrl}/documents/${documentId}?roomId=${encodeURIComponent(roomId)}`,
      {
        headers: {
          "X-Internal-Token": process.env.INTERNAL_SERVICE_TOKEN || "",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }
      throw new Error(`Agent service returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Document info error:", error);
    return NextResponse.json(
      { error: "Failed to get document info" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await params;

  // Get roomId from query params
  const roomId = request.nextUrl.searchParams.get("roomId");

  if (!roomId) {
    return NextResponse.json(
      { error: "roomId query parameter is required" },
      { status: 400 }
    );
  }

  // Validate formats
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(roomId)) {
    return NextResponse.json(
      { error: "Invalid room ID format" },
      { status: 400 }
    );
  }

  if (!/^doc-[a-zA-Z0-9_-]+$/.test(documentId)) {
    return NextResponse.json(
      { error: "Invalid document ID format" },
      { status: 400 }
    );
  }

  const agentServiceUrl = process.env.AGENT_SERVICE_URL;

  if (!agentServiceUrl) {
    return NextResponse.json(
      { error: "Document service not available" },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(
      `${agentServiceUrl}/documents/${documentId}?roomId=${encodeURIComponent(roomId)}`,
      {
        method: "DELETE",
        headers: {
          "X-Internal-Token": process.env.INTERNAL_SERVICE_TOKEN || "",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }
      throw new Error(`Agent service returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Document delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
