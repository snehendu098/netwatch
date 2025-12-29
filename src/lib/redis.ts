import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!REDIS_URL) {
    return null;
  }

  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });

    redis.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
    });

    redis.on("connect", () => {
      console.log("[Redis] Connected successfully");
    });
  }

  return redis;
}

export async function closeRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

// Distributed rate limiting with Redis
export async function checkRateLimitRedis(
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<{ limited: boolean; remaining: number; resetTime: number }> {
  const client = getRedis();

  if (!client) {
    // Fallback: always allow if Redis is not available
    return { limited: false, remaining: maxRequests, resetTime: Date.now() + windowMs };
  }

  const now = Date.now();
  const windowKey = `ratelimit:${key}:${Math.floor(now / windowMs)}`;

  try {
    const multi = client.multi();
    multi.incr(windowKey);
    multi.pexpire(windowKey, windowMs);
    const results = await multi.exec();

    const count = results?.[0]?.[1] as number || 0;
    const remaining = Math.max(0, maxRequests - count);
    const limited = count > maxRequests;
    const resetTime = (Math.floor(now / windowMs) + 1) * windowMs;

    return { limited, remaining, resetTime };
  } catch (error) {
    console.error("[Redis] Rate limit check failed:", error);
    // Fallback: allow request on error
    return { limited: false, remaining: maxRequests, resetTime: now + windowMs };
  }
}

// Distributed session storage
export async function setSession(
  sessionId: string,
  data: Record<string, unknown>,
  ttlSeconds: number = 86400
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    await client.setex(`session:${sessionId}`, ttlSeconds, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("[Redis] Set session failed:", error);
    return false;
  }
}

export async function getSession(
  sessionId: string
): Promise<Record<string, unknown> | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const data = await client.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("[Redis] Get session failed:", error);
    return null;
  }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    await client.del(`session:${sessionId}`);
    return true;
  } catch (error) {
    console.error("[Redis] Delete session failed:", error);
    return false;
  }
}

// Cache utilities
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const data = await client.get(`cache:${key}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("[Redis] Cache get failed:", error);
    return null;
  }
}

export async function cacheSet(
  key: string,
  data: unknown,
  ttlSeconds: number = 300
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    await client.setex(`cache:${key}`, ttlSeconds, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("[Redis] Cache set failed:", error);
    return false;
  }
}

export async function cacheDelete(key: string): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    await client.del(`cache:${key}`);
    return true;
  } catch (error) {
    console.error("[Redis] Cache delete failed:", error);
    return false;
  }
}

// Pub/Sub for real-time events
export async function publish(channel: string, message: unknown): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    await client.publish(channel, JSON.stringify(message));
    return true;
  } catch (error) {
    console.error("[Redis] Publish failed:", error);
    return false;
  }
}

export { redis };
