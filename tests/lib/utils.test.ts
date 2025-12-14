/**
 * Tests for Utility Functions
 *
 * Tests the utility functions in lib/utils.ts including:
 * - getInitials: Extract initials from a name
 * - getHashedAvatar: Get consistent avatar image for identifier
 * - getHashedColor: Get consistent color class for identifier
 */

import { describe, it, expect } from "vitest";
import { getInitials, getHashedAvatar, getHashedColor } from "@/lib/utils";

// ============================================================================
// getInitials Tests
// ============================================================================

describe("getInitials", () => {
  describe("valid inputs", () => {
    it("should return initials for two-word name", () => {
      expect(getInitials("John Doe")).toBe("JD");
    });

    it("should return initials for single-word name", () => {
      expect(getInitials("John")).toBe("J");
    });

    it("should return two initials max for multi-word name", () => {
      expect(getInitials("John Michael Doe")).toBe("JM");
    });

    it("should handle lowercase names", () => {
      expect(getInitials("john doe")).toBe("JD");
    });

    it("should handle mixed case names", () => {
      expect(getInitials("jOHN dOE")).toBe("JD");
    });

    it("should handle extra spaces", () => {
      expect(getInitials("  John   Doe  ")).toBe("JD");
    });
  });

  describe("edge cases", () => {
    it("should return empty string for empty input", () => {
      expect(getInitials("")).toBe("");
    });

    it("should return empty string for null input", () => {
      expect(getInitials(null as unknown as string)).toBe("");
    });

    it("should return empty string for undefined input", () => {
      expect(getInitials(undefined as unknown as string)).toBe("");
    });

    it("should return empty string for non-string input", () => {
      expect(getInitials(123 as unknown as string)).toBe("");
    });

    it("should handle whitespace-only input", () => {
      expect(getInitials("   ")).toBe("");
    });
  });
});

// ============================================================================
// getHashedAvatar Tests
// ============================================================================

describe("getHashedAvatar", () => {
  const validAvatarPaths = [
    "/blue_avatar.webp",
    "/green_avatar.webp",
    "/orange_avatar.webp",
    "/purple_avatar.webp",
    "/red_avatar.webp",
  ];

  describe("consistency", () => {
    it("should return the same avatar for the same identifier", () => {
      const identifier = "user-123";
      const first = getHashedAvatar(identifier);
      const second = getHashedAvatar(identifier);
      expect(first).toBe(second);
    });

    it("should return consistent results across many calls", () => {
      const identifier = "test@example.com";
      const results = Array.from({ length: 100 }, () =>
        getHashedAvatar(identifier)
      );
      expect(new Set(results).size).toBe(1);
    });
  });

  describe("valid outputs", () => {
    it("should return a valid avatar path", () => {
      expect(validAvatarPaths).toContain(getHashedAvatar("any-user"));
    });

    it("should distribute across different avatars for different identifiers", () => {
      const identifiers = [
        "user1",
        "user2",
        "user3",
        "user4",
        "user5",
        "alice",
        "bob",
        "charlie",
        "david",
        "eve",
      ];
      const avatars = new Set(identifiers.map(getHashedAvatar));
      // With 10 diverse identifiers, we should hit at least 2 different avatars
      expect(avatars.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe("edge cases", () => {
    it("should return first avatar for empty string", () => {
      expect(getHashedAvatar("")).toBe("/blue_avatar.webp");
    });

    it("should return first avatar for null input", () => {
      expect(getHashedAvatar(null as unknown as string)).toBe(
        "/blue_avatar.webp"
      );
    });

    it("should return first avatar for undefined input", () => {
      expect(getHashedAvatar(undefined as unknown as string)).toBe(
        "/blue_avatar.webp"
      );
    });

    it("should return first avatar for non-string input", () => {
      expect(getHashedAvatar(123 as unknown as string)).toBe(
        "/blue_avatar.webp"
      );
    });
  });
});

// ============================================================================
// getHashedColor Tests
// ============================================================================

describe("getHashedColor", () => {
  const validColors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-orange-500",
    "bg-purple-500",
    "bg-red-500",
  ];

  describe("consistency", () => {
    it("should return the same color for the same identifier", () => {
      const identifier = "user-123";
      const first = getHashedColor(identifier);
      const second = getHashedColor(identifier);
      expect(first).toBe(second);
    });

    it("should return consistent results across many calls", () => {
      const identifier = "test@example.com";
      const results = Array.from({ length: 100 }, () =>
        getHashedColor(identifier)
      );
      expect(new Set(results).size).toBe(1);
    });
  });

  describe("valid outputs", () => {
    it("should return a valid Tailwind color class", () => {
      expect(validColors).toContain(getHashedColor("any-user"));
    });

    it("should distribute across different colors for different identifiers", () => {
      const identifiers = [
        "user1",
        "user2",
        "user3",
        "user4",
        "user5",
        "alice",
        "bob",
        "charlie",
        "david",
        "eve",
      ];
      const colors = new Set(identifiers.map(getHashedColor));
      // With 10 diverse identifiers, we should hit at least 2 different colors
      expect(colors.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe("edge cases", () => {
    it("should return first color for empty string", () => {
      expect(getHashedColor("")).toBe("bg-blue-500");
    });

    it("should return first color for null input", () => {
      expect(getHashedColor(null as unknown as string)).toBe("bg-blue-500");
    });

    it("should return first color for undefined input", () => {
      expect(getHashedColor(undefined as unknown as string)).toBe(
        "bg-blue-500"
      );
    });

    it("should return first color for non-string input", () => {
      expect(getHashedColor(123 as unknown as string)).toBe("bg-blue-500");
    });
  });
});

// ============================================================================
// Avatar/Color Synchronization Tests
// ============================================================================

describe("avatar and color synchronization", () => {
  const colorToAvatar: Record<string, string> = {
    "bg-blue-500": "/blue_avatar.webp",
    "bg-green-500": "/green_avatar.webp",
    "bg-orange-500": "/orange_avatar.webp",
    "bg-purple-500": "/purple_avatar.webp",
    "bg-red-500": "/red_avatar.webp",
  };

  it("should return matching color and avatar for same identifier", () => {
    const testIdentifiers = [
      "user1",
      "test@email.com",
      "participant-abc",
      "12345",
      "Jane Smith",
    ];

    for (const identifier of testIdentifiers) {
      const color = getHashedColor(identifier);
      const avatar = getHashedAvatar(identifier);
      expect(colorToAvatar[color]).toBe(avatar);
    }
  });

  it("should match color and avatar for edge case inputs", () => {
    const color = getHashedColor("");
    const avatar = getHashedAvatar("");
    expect(colorToAvatar[color]).toBe(avatar);
  });
});
