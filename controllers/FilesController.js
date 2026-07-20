import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db.mjs';
import getUserFromToken from '../utils/auth.mjs';

const ACCEPTED_TYPES = ['folder', 'file', 'image'];
const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';
const PAGE_SIZE = 20;

// Shapes a stored document for the API: _id becomes id, localPath stays private.
const formatFile = (doc) => ({
  id: doc._id,
  userId: doc.userId,
  name: doc.name,
  type: doc.type,
  isPublic: doc.isPublic,
  parentId: doc.parentId,
});

class FilesController {
  static async postUpload(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !ACCEPTED_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (!data && type !== 'folder') return res.status(400).json({ error: 'Missing data' });

    const files = dbClient.db.collection('files');
    const isRoot = parentId === 0 || parentId === '0';

    if (!isRoot) {
      if (!ObjectId.isValid(parentId)) return res.status(400).json({ error: 'Parent not found' });
      const parent = await files.findOne({ _id: new ObjectId(parentId) });
      if (!parent) return res.status(400).json({ error: 'Parent not found' });
      if (parent.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const doc = {
      userId: user._id,
      name,
      type,
      isPublic,
      parentId: isRoot ? 0 : new ObjectId(parentId),
    };

    if (type !== 'folder') {
      await fs.mkdir(FOLDER_PATH, { recursive: true });
      const localPath = path.resolve(FOLDER_PATH, uuidv4());
      await fs.writeFile(localPath, Buffer.from(data, 'base64'));
      doc.localPath = localPath;
    }

    const result = await files.insertOne(doc);

    return res.status(201).json(formatFile({ ...doc, _id: result.insertedId }));
  }

  static async getShow(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(404).json({ error: 'Not found' });

    const file = await dbClient.db.collection('files').findOne({
      _id: new ObjectId(id),
      userId: user._id,
    });
    if (!file) return res.status(404).json({ error: 'Not found' });

    return res.status(200).json(formatFile(file));
  }

  static async getIndex(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // The spec's own example disagrees with its text here; the text wins:
    // an absent parentId means the root, not "every file".
    const { parentId = 0 } = req.query;
    const page = Math.max(0, Number.parseInt(req.query.page, 10) || 0);

    // An unparseable parentId simply matches nothing, per the spec.
    let parentMatch;
    if (parentId === 0 || parentId === '0') parentMatch = 0;
    else if (ObjectId.isValid(parentId)) parentMatch = new ObjectId(parentId);
    else return res.status(200).json([]);

    const files = await dbClient.db.collection('files').aggregate([
      { $match: { userId: user._id, parentId: parentMatch } },
      { $skip: page * PAGE_SIZE },
      { $limit: PAGE_SIZE },
    ]).toArray();

    return res.status(200).json(files.map(formatFile));
  }
}

export default FilesController;
