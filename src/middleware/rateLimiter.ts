// ai-assistant-api/src/middleware/rateLimiter.ts
// Rate limits requests by device ID — 3 requests per device per day
import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../lib/cache';

const DAILY_LIMIT = 3;

export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const deviceId = req.headers['x-device-id'] as string;

  if (!deviceId) {
    return res.status(400).json({ error: 'x-device-id header required' });
  }

  try {
    const redis = await getRedisClient();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `ratelimit:${deviceId}:${today}`;

    const count = await redis.incr(key);

    // set expiry on first request of the day
    if (count === 1) {
      await redis.expire(key, 86400); // 24 hours
    }

    res.setHeader('X-RateLimit-Limit', DAILY_LIMIT);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, DAILY_LIMIT - count));

    if (count > DAILY_LIMIT) {
      return res.status(429).json({
        error: `Daily limit of ${DAILY_LIMIT} analyses reached. Try again tomorrow.`,
        retryAfter: 'tomorrow',
      });
    }

    next();
  } catch (err) {
    // if Redis fails, allow through
    console.error('Rate limiter error:', err);
    next();
  }
}