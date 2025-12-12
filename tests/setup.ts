import "@testing-library/jest-dom/vitest";
import { vi, beforeEach } from "vitest";

// Mock environment variables
vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
