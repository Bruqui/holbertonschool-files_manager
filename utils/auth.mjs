import mongodb from 'mongodb';
import dbClient from './db';
import redisClient from './redis';

const { ObjectId } = mongodb;

/**
 * Resolves the user owning the X-Token header, or null when the token is
 * absent, expired or points at a document that no longer exists.
 */
export default async function getUserFromToken(req) {
  const token = req.headers['x-token'];
  if (!token) return null;

  const userId = await redisClient.get(`auth_${token}`);
  if (!userId || !ObjectId.isValid(userId)) return null;

  return dbClient.db.collection('users').findOne({ _id: new ObjectId(userId) });
}
