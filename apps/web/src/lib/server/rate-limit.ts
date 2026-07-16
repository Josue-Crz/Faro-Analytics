const windows = new Map<string, { count: number; resetsAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = windows.get(key);
  if (!existing || existing.resetsAt <= now) {
    windows.set(key, { count: 1, resetsAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetsAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}
