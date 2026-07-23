import dbClient from '../utils/db';
import redisClient from '../utils/redis';

// Endpoint tests hit handlers that touch Mongo and Redis; wait for both to be
// ready before exercising them so the first requests don't race the connections.
export const waitConnections = async () => {
  await dbClient.whenConnected();
  await new Promise((resolve) => {
    const check = () => (redisClient.isAlive() ? resolve() : setTimeout(check, 50));
    check();
  });
};

export const clearDb = async () => {
  await dbClient.db.collection('users').deleteMany({});
  await dbClient.db.collection('files').deleteMany({});
};

export const basicAuth = (email, password) => `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`;
