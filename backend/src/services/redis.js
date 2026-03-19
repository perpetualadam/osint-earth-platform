import Redis from "ioredis";

const redisOpts = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 5000),
};

export const redis = new Redis(redisOpts);
export const redisSub = new Redis(redisOpts);

redis.on("error", (err) => console.error("Redis error", err));
redisSub.on("error", (err) => console.error("Redis sub error", err));
