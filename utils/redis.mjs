import { createClient } from 'redis';
import { promisify } from 'util';

// If Redis is unreachable, redis@2's offline queue holds commands forever, so
// an awaited get/set never settles and the whole request hangs. Bounding each
// command turns that into a fast rejection the route wrapper can answer with a
// 500 instead of a 30s timeout.
const REDIS_OP_TIMEOUT = 5000;

const withTimeout = (promise) => {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Redis operation timed out')), REDIS_OP_TIMEOUT);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

class RedisClient {
  constructor() {
    this.client = createClient();
    this.client.on('error', (err) => {
      console.error(`Redis client error: ${err.message}`);
    });
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    const getAsync = promisify(this.client.get).bind(this.client);
    return withTimeout(getAsync(key));
  }

  async set(key, value, duration) {
    const setexAsync = promisify(this.client.setex).bind(this.client);
    return withTimeout(setexAsync(key, duration, value));
  }

  async del(key) {
    const delAsync = promisify(this.client.del).bind(this.client);
    return withTimeout(delAsync(key));
  }
}

const redisClient = new RedisClient();
export default redisClient;
