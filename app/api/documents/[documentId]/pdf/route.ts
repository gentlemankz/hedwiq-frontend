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

  // Get roomId from query params for access control
  const roomId = request.nextUrl.searchParams.get("roomId");

  if (!roomId) {
    return NextResponse.json(
      { error: "roomId query parameter is required" },
      { status: 400 }
    );
  }

  // Validate roomId format
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(roomId)) {
    return NextResponse.json(
      { error: "Invalid room ID format" },
      { status: 400 }
    );
  }

  // Validate documentId format
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
    // Fetch PDF from agent service with room validation
    const response = await fetch(
      `${agentServiceUrl}/documents/${documentId}/pdf?roomId=${encodeURIComponent(roomId)}`,
      {
        headers: {
          "X-Internal-Token": process.env.INTERNAL_SERVICE_TOKEN || "",
          "X-User-Id": session.user.id,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 403) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      if (response.status === 404) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }
      throw new Error(`Agent service returned ${response.status}`);
    }

    const pdfBuffer = await response.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${documentId}.pdf"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Document retrieval error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve document" },
      { status: 500 }
    );
  }
}
