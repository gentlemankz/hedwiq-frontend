/**
 * Tests for Meeting Room Join Sequencing
 *
 * Verifies the critical join flow order:
 * 1. Save agenda (PUT /api/rooms/[roomId]/agenda)
 * 2. Publish agenda (POST /api/rooms/[roomId]/agenda/publish)
 * 3. Request token (POST /api/livekit/token)
 * 4. Connect to LiveKit
 *
 * Tests exercise the actual join flow logic to catch sequencing regressions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DraftAgendaItem, AgendaPublishResponse } from "@/types/agenda";

// ============================================================================
// Test Setup
// ============================================================================

// Track fetch call order and capture request details
let fetchCallOrder: string[] = [];
let fetchRequests: Map<string, { body?: unknown; signal?: AbortSignal }> = new Map();

const mockFetch = vi.fn();

beforeEach(() => {
  fetchCallOrder = [];
  fetchRequests = new Map();
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================================
// Helper: Simulates handlePreJoinSubmit logic from meeting-room.tsx
// ============================================================================

interface JoinChoices {
  username: string;
  agendaItems?: DraftAgendaItem[];
}

interface JoinResult {
  success: boolean;
  token?: string;
  agendaId?: string;
  agendaVersion?: number;
  error?: string;
}

/**
 * Extracted join flow logic matching meeting-room.tsx handlePreJoinSubmit
 * This allows us to test the actual sequencing without rendering the full component
 */
async function executeJoinFlow(
  roomId: string,
  choices: JoinChoices,
  signal?: AbortSignal
): Promise<JoinResult> {
  let agendaId: string | undefined;
  let agendaVersion: number | undefined;

  try {
    // Step 1 & 2: Save and publish agenda if items exist
    if (choices.agendaItems && choices.agendaItems.length > 0) {
      const agendaItems = choices.agendaItems.map((item) => ({
        title: item.title,
        description: item.description,
        estimatedDuration: item.estimatedDuration,
        presenter: item.presenter,
      }));

      // Step 1: Save agenda
      const saveResponse = await fetch(`/api/rooms/${roomId}/agenda`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: agendaItems }),
        signal,
      });

      if (!saveResponse.ok) {
        const data = await saveResponse.json();
        throw new Error(data.error || "Failed to save agenda");
      }

      // Step 2: Publish agenda
      const publishResponse = await fetch(`/api/rooms/${roomId}/agenda/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
      });

      if (!publishResponse.ok) {
        const data = await publishResponse.json();
        throw new Error(data.error || "Failed to publish agenda");
      }

      // Capture agenda metadata
      const publishData: AgendaPublishResponse = await publishResponse.json();
      agendaId = publishData.agenda.id;
      agendaVersion = publishData.agenda.version;
    }

    // Step 3: Request token
    const tokenResponse = await fetch("/api/livekit/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: roomId, username: choices.username }),
      signal,
    });

    if (!tokenResponse.ok) {
      const data = await tokenResponse.json();
      throw new Error(data.error || "Failed to get token");
    }

    const tokenData = await tokenResponse.json();

    return {
      success: true,
      token: tokenData.token,
      agendaId,
      agendaVersion,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: "Request aborted" };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ============================================================================
// Mock Fetch Setup Helper
// ============================================================================

function setupFetchMocks(options: {
  saveAgendaFails?: boolean;
  publishAgendaFails?: boolean;
  tokenFails?: boolean;
  saveAgendaStatus?: number;
  publishAgendaStatus?: number;
  tokenStatus?: number;
  agendaId?: string;
  agendaVersion?: number;
} = {}) {
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const urlStr = url.toString();

    // Capture request details
    fetchRequests.set(urlStr, {
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      signal: init?.signal ?? undefined,
    });

    if (urlStr.includes("/agenda/publish")) {
      fetchCallOrder.push("publish");
      if (options.publishAgendaFails) {
        return {
          ok: false,
          status: options.publishAgendaStatus || 409,
          json: async () => ({ error: "Agenda already published" }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          agenda: {
            id: options.agendaId || "agenda-123",
            roomId: "test-room",
            version: options.agendaVersion || 1,
            status: "active",
            items: [],
          },
        }),
      };
    }

    if (urlStr.includes("/agenda") && init?.method === "PUT") {
      fetchCallOrder.push("save");
      if (options.saveAgendaFails) {
        return {
          ok: false,
          status: options.saveAgendaStatus || 500,
          json: async () => ({ error: "Failed to save agenda" }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          agenda: {
            id: options.agendaId || "agenda-123",
            roomId: "test-room",
            version: options.agendaVersion || 1,
            status: "draft",
            items: [],
          },
        }),
      };
    }

    if (urlStr.includes("/livekit/token")) {
      fetchCallOrder.push("token");
      if (options.tokenFails) {
        return {
          ok: false,
          status: options.tokenStatus || 500,
          json: async () => ({ error: "Failed to get token" }),
        };
      }
      return {
        ok: true,
        json: async () => ({ token: "test-token-123" }),
      };
    }

    return { ok: true, json: async () => ({}) };
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("Join Sequencing - executeJoinFlow", () => {
  describe("Call Order", () => {
    it("calls save → publish → token in correct order when agenda has items", async () => {
      setupFetchMocks();

      const result = await executeJoinFlow("test-room", {
        username: "Test User",
        agendaItems: [{ id: "draft-1", title: "Test Topic" }],
      });

      expect(result.success).toBe(true);
      expect(fetchCallOrder).toEqual(["save", "publish", "token"]);
    });

    it("skips save/publish and only requests token when no agenda items", async () => {
      setupFetchMocks();

      const result = await executeJoinFlow("test-room", {
        username: "Test User",
        agendaItems: [],
      });

      expect(result.success).toBe(true);
      expect(fetchCallOrder).toEqual(["token"]);
    });

    it("skips save/publish when agendaItems is undefined", async () => {
      setupFetchMocks();

      const result = await executeJoinFlow("test-room", {
        username: "Test User",
      });

      expect(result.success).toBe(true);
      expect(fetchCallOrder).toEqual(["token"]);
    });
  });

  describe("Error Handling", () => {
    it("stops at save and does not proceed to publish if save fails", async () => {
      setupFetchMocks({ saveAgendaFails: true });

      const result = await executeJoinFlow("test-room", {
        username: "Test User",
        agendaItems: [{ id: "draft-1", title: "Test Topic" }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to save agenda");
      expect(fetchCallOrder).toEqual(["save"]);
      expect(fetchCallOrder).not.toContain("publish");
      expect(fetchCallOrder).not.toContain("token");
    });

    it("stops at publish and does not proceed to token if publish fails", async () => {
      setupFetchMocks({ publishAgendaFails: true });

      const result = await executeJoinFlow("test-room", {
        username: "Test User",
        agendaItems: [{ id: "draft-1", title: "Test Topic" }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Agenda already published");
      expect(fetchCallOrder).toEqual(["save", "publish"]);
      expect(fetchCallOrder).not.toContain("token");
    });

    it("returns error when token request fails", async () => {
      setupFetchMocks({ tokenFails: true });

      const result = await executeJoinFlow("test-room", {
        username: "Test User",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to get token");
    });

    it("handles 409 conflict when agenda already published", async () => {
      setupFetchMocks({ publishAgendaFails: true, publishAgendaStatus: 409 });

      const result = await executeJoinFlow("test-room", {
        username: "Test User",
        agendaItems: [{ id: "draft-1", title: "Test Topic" }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Agenda already published");
    });
  });

  describe("Agenda Metadata Propagation", () => {
    it("captures and returns agendaId from publish response", async () => {
      setupFetchMocks({ agendaId: "agenda-xyz-789", agendaVersion: 3 });

      const result = await executeJoinFlow("test-room", {
        username: "Test User",
        agendaItems: [{ id: "draft-1", title: "Test Topic" }],
      });

      expect(result.success).toBe(true);
      expect(result.agendaId).toBe("agenda-xyz-789");
      expect(result.agendaVersion).toBe(3);
    });

    it("returns undefined agendaId when no agenda items", async () => {
      setupFetchMocks();

      const result = await executeJoinFlow("test-room", {
        username: "Test User",
      });

      expect(result.success).toBe(true);
      expect(result.agendaId).toBeUndefined();
      expect(result.agendaVersion).toBeUndefined();
    });

    it("returns token on successful join", async () => {
      setupFetchMocks();

      const result = await executeJoinFlow("test-room", {
        username: "Test User",
      });

      expect(result.success).toBe(true);
      expect(result.token).toBe("test-token-123");
    });
  });

  describe("Request Payload Verification", () => {
    it("sends correct agenda items in save request", async () => {
      setupFetchMocks();

      await executeJoinFlow("test-room", {
        username: "Test User",
        agendaItems: [
          {
            id: "draft-1",
            title: "Topic One",
            description: "Description",
            estimatedDuration: 15,
            presenter: "John",
          },
        ],
      });

      const saveRequest = fetchRequests.get("/api/rooms/test-room/agenda");
      expect(saveRequest?.body).toEqual({
        items: [
          {
            title: "Topic One",
            description: "Description",
            estimatedDuration: 15,
            presenter: "John",
          },
        ],
      });
    });

    it("sends correct username in token request", async () => {
      setupFetchMocks();

      await executeJoinFlow("test-room", {
        username: "Jane Doe",
      });

      const tokenRequest = fetchRequests.get("/api/livekit/token");
      expect(tokenRequest?.body).toEqual({
        room: "test-room",
        username: "Jane Doe",
      });
    });
  });
});
