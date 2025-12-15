import "@testing-library/jest-dom/vitest";
import { vi, beforeEach } from "vitest";

// Mock environment variables
vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");

// Mock ResizeObserver for components using ScrollArea (radix-ui) and dnd-kit
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = ResizeObserverMock;

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
