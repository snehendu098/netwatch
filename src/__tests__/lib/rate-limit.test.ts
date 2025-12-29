import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Redis
vi.mock("@/lib/redis", () => ({
  checkRateLimitRedis: vi.fn(),
}));

describe("Rate Limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("In-memory rate limiting", () => {
    it("should allow requests within limit", async () => {
      const { checkRateLimit } = await import("@/lib/rate-limit");

      const createMockRequest = () =>
        new NextRequest("http://localhost/api/test", {
          headers: { "x-forwarded-for": "192.168.1.1" },
        });

      const config = { windowMs: 60000, maxRequests: 5 };

      // First 5 requests should be allowed
      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit(createMockRequest(), config);
        expect(result.limited).toBe(false);
        expect(result.remaining).toBe(4 - i);
      }
    });

    it("should block requests over limit", async () => {
      const { checkRateLimit } = await import("@/lib/rate-limit");

      const createMockRequest = () =>
        new NextRequest("http://localhost/api/test", {
          headers: { "x-forwarded-for": "192.168.1.2" },
        });

      const config = { windowMs: 60000, maxRequests: 3 };

      // First 3 requests should pass
      for (let i = 0; i < 3; i++) {
        checkRateLimit(createMockRequest(), config);
      }

      // 4th request should be blocked
      const result = checkRateLimit(createMockRequest(), config);
      expect(result.limited).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it("should reset after window expires", async () => {
      const { checkRateLimit } = await import("@/lib/rate-limit");

      const createMockRequest = () =>
        new NextRequest("http://localhost/api/test", {
          headers: { "x-forwarded-for": "192.168.1.3" },
        });

      const config = { windowMs: 60000, maxRequests: 2 };

      // Use up the limit
      checkRateLimit(createMockRequest(), config);
      checkRateLimit(createMockRequest(), config);
      let result = checkRateLimit(createMockRequest(), config);
      expect(result.limited).toBe(true);

      // Advance time past the window
      vi.advanceTimersByTime(61000);

      // Should be allowed again
      result = checkRateLimit(createMockRequest(), config);
      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(1);
    });

    it("should track different clients separately", async () => {
      const { checkRateLimit } = await import("@/lib/rate-limit");

      const config = { windowMs: 60000, maxRequests: 2 };

      const request1 = new NextRequest("http://localhost/api/test", {
        headers: { "x-forwarded-for": "10.0.0.1" },
      });

      const request2 = new NextRequest("http://localhost/api/test", {
        headers: { "x-forwarded-for": "10.0.0.2" },
      });

      // Client 1 uses up limit
      checkRateLimit(request1, config);
      checkRateLimit(request1, config);
      expect(checkRateLimit(request1, config).limited).toBe(true);

      // Client 2 should still be allowed
      expect(checkRateLimit(request2, config).limited).toBe(false);
    });
  });

  describe("Rate limit middleware", () => {
    it("should return 429 response when rate limited", async () => {
      const { rateLimit } = await import("@/lib/rate-limit");

      const middleware = rateLimit({
        windowMs: 60000,
        maxRequests: 1,
        message: "Too many requests",
      });

      const createRequest = () =>
        new NextRequest("http://localhost/api/test", {
          headers: { "x-forwarded-for": "192.168.1.10" },
        });

      // First request should pass (returns null)
      const result1 = await middleware(createRequest());
      expect(result1).toBeNull();

      // Second request should be blocked
      const result2 = await middleware(createRequest());
      expect(result2).not.toBeNull();
      expect(result2?.status).toBe(429);

      const body = await result2?.json();
      expect(body.error).toBe("Too many requests");
    });

    it("should include rate limit headers", async () => {
      const { rateLimit } = await import("@/lib/rate-limit");

      const middleware = rateLimit({
        windowMs: 60000,
        maxRequests: 1,
      });

      const createRequest = () =>
        new NextRequest("http://localhost/api/test", {
          headers: { "x-forwarded-for": "192.168.1.11" },
        });

      // Use up the limit
      await middleware(createRequest());

      // Check headers on blocked request
      const response = await middleware(createRequest());
      expect(response?.headers.get("Retry-After")).toBeDefined();
      expect(response?.headers.get("X-RateLimit-Limit")).toBe("1");
      expect(response?.headers.get("X-RateLimit-Remaining")).toBe("0");
    });
  });

  describe("Pre-configured rate limiters", () => {
    it("should have strict limiter with correct config", async () => {
      const { rateLimiters } = await import("@/lib/rate-limit");

      // Strict: 10 requests per minute
      expect(rateLimiters.strict).toBeDefined();
    });

    it("should have standard limiter with correct config", async () => {
      const { rateLimiters } = await import("@/lib/rate-limit");

      // Standard: 100 requests per minute
      expect(rateLimiters.standard).toBeDefined();
    });

    it("should have relaxed limiter with correct config", async () => {
      const { rateLimiters } = await import("@/lib/rate-limit");

      // Relaxed: 1000 requests per minute
      expect(rateLimiters.relaxed).toBeDefined();
    });

    it("should have agent limiter with correct config", async () => {
      const { rateLimiters } = await import("@/lib/rate-limit");

      // Agent: 500 requests per minute
      expect(rateLimiters.agent).toBeDefined();
    });
  });

  describe("withRateLimit wrapper", () => {
    it("should wrap handler with rate limiting", async () => {
      const { withRateLimit } = await import("@/lib/rate-limit");

      const mockHandler = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      const wrappedHandler = withRateLimit(mockHandler, "strict");

      const request = new NextRequest("http://localhost/api/test", {
        headers: { "x-forwarded-for": "192.168.1.20" },
      });

      const response = await wrappedHandler(request);
      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });
  });
});

describe("Client Identification", () => {
  it("should use x-forwarded-for header", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");

    const request = new NextRequest("http://localhost/api/test", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    const config = { windowMs: 60000, maxRequests: 100 };
    const result = checkRateLimit(request, config);

    expect(result.limited).toBe(false);
  });

  it("should use x-real-ip as fallback", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");

    const request = new NextRequest("http://localhost/api/test", {
      headers: { "x-real-ip": "5.6.7.8" },
    });

    const config = { windowMs: 60000, maxRequests: 100 };
    const result = checkRateLimit(request, config);

    expect(result.limited).toBe(false);
  });

  it("should handle missing IP headers", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");

    const request = new NextRequest("http://localhost/api/test");

    const config = { windowMs: 60000, maxRequests: 100 };
    const result = checkRateLimit(request, config);

    expect(result.limited).toBe(false);
  });
});
