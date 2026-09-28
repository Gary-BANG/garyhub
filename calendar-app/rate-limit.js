"use strict";

function rateLimit(max, windowMs) {
  const attempts = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const current = attempts.get(key);
    const entry = !current || current.expires <= now ? { count: 0, expires: now + windowMs } : current;
    entry.count++;
    attempts.set(key, entry);
    if (attempts.size > 10000) {
      for (const [ip, value] of attempts) if (value.expires <= now) attempts.delete(ip);
    }
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.expires - now) / 1000)));
      return res.status(429).json({ message: "操作过于频繁，请稍后重试" });
    }
    next();
  };
}

module.exports = { rateLimit };
