import { NextRequest, NextResponse } from "next/server";

interface RateLimitConfig {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string;    // Custom error message
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting (use Redis in production for scaling)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

/**
 * Get client identifier for rate limiting
 */
function getClientIdentifier(request: NextRequest): string {
  // Try to get real IP from headers (for proxies/load balancers)
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0] || realIp || "unknown";

  // Include user ID if authenticated (from session cookie or header)
  const sessionCookie = request.cookies.get("next-auth.session-token")?.value;
  const userId = sessionCookie ? `user:${sessionCookie.substring(0, 16)}` : "";

  return `${ip}:${userId}`;
}

/**
 * Check if request should be rate limited
 */
export function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig
): { limited: boolean; remaining: number; resetTime: number } {
  const key = getClientIdentifier(request);
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  // Create new entry or reset if window expired
  if (!entry || entry.resetTime < now) {
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
    };
  }

  entry.count++;
  rateLimitStore.set(key, entry);

  const remaining = Math.max(0, config.maxRequests - entry.count);
  const limited = entry.count > config.maxRequests;

  return {
    limited,
    remaining,
    resetTime: entry.resetTime,
  };
}

/**
 * Rate limit middleware factory
 */
export function rateLimit(config: RateLimitConfig) {
  return async function rateLimitMiddleware(
    request: NextRequest
  ): Promise<NextResponse | null> {
    const result = checkRateLimit(request, config);

    if (result.limited) {
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);

      return NextResponse.json(
        {
          error: config.message || "Too many requests, please try again later",
          retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Limit": config.maxRequests.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": result.resetTime.toString(),
          },
        }
      );
    }

    return null; // Not rate limited, continue
  };
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  request: NextRequest,
  config: RateLimitConfig
): NextResponse {
  const result = checkRateLimit(request, config);

  response.headers.set("X-RateLimit-Limit", config.maxRequests.toString());
  response.headers.set("X-RateLimit-Remaining", result.remaining.toString());
  response.headers.set("X-RateLimit-Reset", result.resetTime.toString());

  return response;
}

// Pre-configured rate limiters for common use cases
export const rateLimiters = {
  // Strict: 10 requests per minute (for sensitive endpoints like login)
  strict: rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: "Too many attempts, please try again in a minute",
  }),

  // Standard: 100 requests per minute (for general API endpoints)
  standard: rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 100,
    message: "Rate limit exceeded, please slow down",
  }),

  // Relaxed: 1000 requests per minute (for read-heavy endpoints)
  relaxed: rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 1000,
    message: "Too many requests",
  }),

  // Agent: 500 requests per minute (for agent connections)
  agent: rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 500,
    message: "Agent rate limit exceeded",
  }),
};

/**
 * Higher-order function to wrap an API route with rate limiting
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  limiterType: keyof typeof rateLimiters = "standard"
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const limiter = rateLimiters[limiterType];
    const rateLimitResponse = await limiter(request);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    return handler(request);
  };
}
