import Bull from 'bull';
import sha1 from 'sha1';
import dbClient from '../utils/db';
import getUserFromToken from '../utils/auth';

// Created lazily so merely importing this controller does not open Redis
// connections (mirrors the fileQueue handling in FilesController).
let userQueue = null;
const getUserQueue = () => {
  if (!userQueue) userQueue = new Bull('userQueue');
  return userQueue;
};

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) return res.status(400).json({ error: 'Missing email' });
    if (!password) return res.status(400).json({ error: 'Missing password' });

    const users = dbClient.db.collection('users');
    const existing = await users.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Already exist' });

    const result = await users.insertOne({ email, password: sha1(password) });

    await getUserQueue().add({ userId: result.insertedId.toString() });

    return res.status(201).json({ id: result.insertedId, email });
  }

  static async getMe(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    return res.status(200).json({ id: user._id, email: user.email });
  }
}

export default UsersController;
