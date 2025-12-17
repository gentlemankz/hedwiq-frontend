import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { reorderFolders } from "@/lib/db/folder";
import { validateReorderFoldersRequest } from "@/lib/validation/folder";

/**
 * POST /api/folders/reorder
 *
 * Reorder folders by providing an array of folder IDs in the desired order.
 * Body:
 * - folderIds: string[] (required)
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let body: {
    folderIds?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request
  const validation = validateReorderFoldersRequest(body);
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    await reorderFolders(session.user.id, body.folderIds as string[]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reorder folders error:", error);

    // Handle specific error for invalid folder IDs
    if (error instanceof Error && error.message.includes("does not belong")) {
      return NextResponse.json(
        { error: "One or more folder IDs are invalid" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to reorder folders" },
      { status: 500 }
    );
  }
}
