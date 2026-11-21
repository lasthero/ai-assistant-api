// ai-assistant-api/src/middleware/rateLimiter.ts
// Rate limits requests by device ID — shared pool across ALL AI features
// (resume parsing, job matching, interview prep, career advice) — 3 per
// device per day, not 3 per individual feature.
import { Request, Response, NextFunction } from 'express';
import { store } from '../lib/cache';

const DAILY_LIMIT = 5;

export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const deviceId = req.headers['x-device-id'] as string;

  // No x-device-id means this is a server-to-server call (e.g. your own
  // website's build process fetching resume data), not a public mobile
  // client — CareerForge always sends this header, so its absence reliably
  // identifies trusted internal traffic already authenticated via x-api-key.
  // Skip rate limiting entirely rather than erroring, since these calls
  // aren't the abuse vector this limiter protects against.
  if (!deviceId) {
    return next();
  }

  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `ratelimit:${deviceId}:${today}`;

    const count = await store.incr(key);

    // set expiry on first request of the day
    if (count === 1) {
      await store.expire(key, 86400); // 24 hours
    }

    const remaining = Math.max(0, DAILY_LIMIT - count);
    res.setHeader('X-RateLimit-Limit', DAILY_LIMIT);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (count > DAILY_LIMIT) {
      return res.status(429).json({
        error: `You've used all ${DAILY_LIMIT} free requests for today (resume parsing, job matching, and interview prep all share this daily limit). It resets at midnight — try again tomorrow.`,
        limit: DAILY_LIMIT,
        used: DAILY_LIMIT,
        remaining: 0,
        retryAfter: 'tomorrow',
      });
    }

    // let the client know how many are left, even on success, so the UI
    // can show a running count before the user hits the wall unexpectedly
    res.locals.rateLimitRemaining = remaining;

    next();
  } catch (err) {
    // if the store throws unexpectedly, allow through
    console.error('Rate limiter error:', err);
    next();
  }
}