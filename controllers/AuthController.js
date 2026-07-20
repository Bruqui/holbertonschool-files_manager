import { v4 as uuidv4 } from 'uuid';
import sha1 from 'sha1';
import dbClient from '../utils/db.mjs';
import redisClient from '../utils/redis.mjs';

const TOKEN_TTL = 24 * 3600;

class AuthController {
  static async getConnect(req, res) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Basic ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const separator = credentials.indexOf(':');
    if (separator === -1) return res.status(401).json({ error: 'Unauthorized' });

    const email = credentials.slice(0, separator);
    const password = credentials.slice(separator + 1);
    if (!email || !password) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({
      email,
      password: sha1(password),
    });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const token = uuidv4();
    await redisClient.set(`auth_${token}`, user._id.toString(), TOKEN_TTL);
    return res.status(200).json({ token });
  }

  static async getDisconnect(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await redisClient.del(`auth_${token}`);
    return res.status(204).end();
  }
}

export default AuthController;
