import { promises as fs } from 'fs';
import Bull from 'bull';
import imageThumbnail from 'image-thumbnail';
import { ObjectId } from 'mongodb';
import dbClient from './utils/db';

const fileQueue = new Bull('fileQueue');
const userQueue = new Bull('userQueue');
const THUMBNAIL_WIDTHS = [500, 250, 100];

const processJob = async (job) => {
  const { fileId, userId } = job.data;

  if (!fileId) throw new Error('Missing fileId');
  if (!userId) throw new Error('Missing userId');
  if (!ObjectId.isValid(fileId) || !ObjectId.isValid(userId)) {
    throw new Error('File not found');
  }

  const file = await dbClient.db.collection('files').findOne({
    _id: new ObjectId(fileId),
    userId: new ObjectId(userId),
  });
  if (!file) throw new Error('File not found');

  await Promise.all(THUMBNAIL_WIDTHS.map(async (width) => {
    const thumbnail = await imageThumbnail(file.localPath, { width });
    await fs.writeFile(`${file.localPath}_${width}`, thumbnail);
  }));
};

const processUserJob = async (job) => {
  const { userId } = job.data;

  if (!userId) throw new Error('Missing userId');
  if (!ObjectId.isValid(userId)) throw new Error('User not found');

  const user = await dbClient.db.collection('users').findOne({ _id: new ObjectId(userId) });
  if (!user) throw new Error('User not found');

  console.log(`Welcome ${user.email}!`);
};

// Wait for Mongo before consuming jobs so a job never hits a null db.
dbClient.whenConnected().then(() => {
  fileQueue.process(processJob);
  userQueue.process(processUserJob);
  console.log('File worker started, waiting for jobs');
});
