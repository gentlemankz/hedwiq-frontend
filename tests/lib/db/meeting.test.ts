/**
 * Tests for lib/db/meeting.ts
 *
 * Focus: listMeetingsForUser should return meetings where the user is the host
 * or has visibility via invite/team membership.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import { listMeetingsForUser } from "@/lib/db/meeting";

const mockSelectDistinct = () => {
  const chain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn(),
  };
  (db.selectDistinct as Mock).mockReturnValue(chain);
  return chain;
};

describe("listMeetingsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns mapped meetings and builds query", async () => {
    const selectChain = mockSelectDistinct();
    selectChain.offset.mockResolvedValue([
      {
        meeting: {
          id: "mtg-123",
          roomId: "abc-defg-hij",
          hostId: "user-host",
          folderId: null,
          title: "Weekly Sync",
          description: null,
          type: "scheduled",
          status: "scheduled",
          scheduledAt: new Date("2026-01-01T10:00:00Z"),
          durationMinutes: 30,
          timezone: "UTC",
          startedAt: null,
          endedAt: null,
          settings: {},
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      },
    ]);

    const result = await listMeetingsForUser(
      { userId: "user-invitee", userEmail: "INVITEE@EXAMPLE.COM" },
      { status: "upcoming", limit: 10, offset: 0 }
    );

    expect(db.selectDistinct).toHaveBeenCalled();
    expect(selectChain.from).toHaveBeenCalled();
    // 3 left joins: invitee, teamMeeting, teamMember
    expect(selectChain.leftJoin).toHaveBeenCalledTimes(3);
    expect(selectChain.where).toHaveBeenCalled();
    expect(selectChain.orderBy).toHaveBeenCalled();
    expect(selectChain.limit).toHaveBeenCalledWith(10);
    expect(selectChain.offset).toHaveBeenCalledWith(0);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("mtg-123");
    expect(result[0].scheduledAt).toBe("2026-01-01T10:00:00.000Z");
  });
});

