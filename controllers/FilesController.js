import { promises as fs } from 'fs';
import path from 'path';
import Bull from 'bull';
import mime from 'mime-types';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import getUserFromToken from '../utils/auth';

const ACCEPTED_TYPES = ['folder', 'file', 'image'];
const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';
const PAGE_SIZE = 20;
const THUMBNAIL_SIZES = ['500', '250', '100'];

const fileQueue = new Bull('fileQueue');

// Shapes a stored document for the API: _id becomes id, localPath stays private.
const formatFile = (doc) => ({
  id: doc._id,
  userId: doc.userId,
  name: doc.name,
  type: doc.type,
  isPublic: doc.isPublic,
  parentId: doc.parentId,
});

// Backs both publish endpoints, which differ only by the flag they set.
// `returnOriginal: false` is the driver v3 spelling of v4's `returnDocument: 'after'`.
const setPublished = async (req, res, isPublic) => {
  const user = await getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(404).json({ error: 'Not found' });

  const result = await dbClient.db.collection('files').findOneAndUpdate(
    { _id: new ObjectId(id), userId: user._id },
    { $set: { isPublic } },
    { returnOriginal: false },
  );
  if (!result.value) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(formatFile(result.value));
};

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

    if (type === 'image') {
      await fileQueue.add({
        userId: user._id.toString(),
        fileId: result.insertedId.toString(),
      });
    }

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

    const files = await dbClient.db.collection('files')
      .find({ userId: user._id, parentId: parentMatch })
      .skip(page * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .toArray();

    return res.status(200).json(files.map(formatFile));
  }

  static putPublish(req, res) {
    return setPublished(req, res, true);
  }

  static putUnpublish(req, res) {
    return setPublished(req, res, false);
  }

  static async getFile(req, res) {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(404).json({ error: 'Not found' });

    const file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(id) });
    if (!file) return res.status(404).json({ error: 'Not found' });

    // A public file is readable by anyone; otherwise only its owner may fetch it.
    if (!file.isPublic) {
      const user = await getUserFromToken(req);
      if (!user || !file.userId.equals(user._id)) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    // `size` lands in a filesystem path, so only the three known widths are
    // accepted -- anything else would let a request walk out of FOLDER_PATH.
    const { size } = req.query;
    let target = file.localPath;
    if (size !== undefined) {
      if (!THUMBNAIL_SIZES.includes(String(size))) {
        return res.status(404).json({ error: 'Not found' });
      }
      target = `${file.localPath}_${size}`;
    }

    try {
      const content = await fs.readFile(target);
      return res.status(200)
        .type(mime.lookup(file.name) || 'application/octet-stream')
        .send(content);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }
  }
}

export default FilesController;
