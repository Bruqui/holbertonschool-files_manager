import chai from 'chai';
import chaiHttp from 'chai-http';
import dbClient from '../utils/db';
import app from '../server';
import { waitConnections, clearDb, basicAuth } from './helpers';

chai.use(chaiHttp);
const { expect } = chai;

const EMAIL = 'files@test.com';
const PASSWORD = 'filesPass9';
const HELLO_B64 = Buffer.from('Hello Webstack!\n').toString('base64');

let token;

const connect = async () => {
  await chai.request(app).post('/users').send({ email: EMAIL, password: PASSWORD });
  const res = await chai.request(app).get('/connect').set('Authorization', basicAuth(EMAIL, PASSWORD));
  return res.body.token;
};

describe('POST /files', () => {
  before(async () => {
    await waitConnections();
    await clearDb();
    token = await connect();
  });

  after(clearDb);

  it('rejects an unauthenticated request with 401', async () => {
    const res = await chai.request(app).post('/files').send({ name: 'x', type: 'folder' });
    expect(res).to.have.status(401);
  });

  it('creates a folder with status 201', async () => {
    const res = await chai.request(app).post('/files').set('X-Token', token)
      .send({ name: 'images', type: 'folder' });
    expect(res).to.have.status(201);
    expect(res.body).to.include({
      name: 'images', type: 'folder', isPublic: false, parentId: 0,
    });
    expect(res.body).to.have.property('id');
  });

  it('creates a file and stores it on disk with status 201', async () => {
    const res = await chai.request(app).post('/files').set('X-Token', token)
      .send({ name: 'note.txt', type: 'file', data: HELLO_B64 });
    expect(res).to.have.status(201);
    expect(res.body.type).to.equal('file');
    const stored = await dbClient.db.collection('files').findOne({ name: 'note.txt' });
    expect(stored).to.have.property('localPath');
  });

  it('rejects a missing name with 400 Missing name', async () => {
    const res = await chai.request(app).post('/files').set('X-Token', token).send({ type: 'folder' });
    expect(res).to.have.status(400);
    expect(res.body).to.deep.equal({ error: 'Missing name' });
  });

  it('rejects a missing/invalid type with 400 Missing type', async () => {
    const res = await chai.request(app).post('/files').set('X-Token', token).send({ name: 'x', type: 'video' });
    expect(res).to.have.status(400);
    expect(res.body).to.deep.equal({ error: 'Missing type' });
  });

  it('rejects missing data for a file with 400 Missing data', async () => {
    const res = await chai.request(app).post('/files').set('X-Token', token).send({ name: 'x', type: 'file' });
    expect(res).to.have.status(400);
    expect(res.body).to.deep.equal({ error: 'Missing data' });
  });

  it('rejects an unknown parentId with 400 Parent not found', async () => {
    const res = await chai.request(app).post('/files').set('X-Token', token)
      .send({ name: 'x', type: 'folder', parentId: '5f1e879ec7ba06511e683b99' });
    expect(res).to.have.status(400);
    expect(res.body).to.deep.equal({ error: 'Parent not found' });
  });
});

describe('GET /files/:id and GET /files', () => {
  let folderId;

  before(async () => {
    await waitConnections();
    await clearDb();
    token = await connect();
    const folder = await chai.request(app).post('/files').set('X-Token', token)
      .send({ name: 'root-folder', type: 'folder' });
    folderId = folder.body.id;
    // 25 files inside the folder to exercise pagination
    const creations = [];
    for (let i = 0; i < 25; i += 1) {
      creations.push(chai.request(app).post('/files').set('X-Token', token)
        .send({ name: `f${i}.txt`, type: 'file', data: HELLO_B64, parentId: folderId }));
    }
    await Promise.all(creations);
  });

  after(clearDb);

  it('GET /files/:id returns the document', async () => {
    const res = await chai.request(app).get(`/files/${folderId}`).set('X-Token', token);
    expect(res).to.have.status(200);
    expect(res.body.id).to.equal(folderId);
    expect(res.body.name).to.equal('root-folder');
  });

  it('GET /files/:id returns 404 for an unknown id', async () => {
    const res = await chai.request(app).get('/files/5f1e879ec7ba06511e683b99').set('X-Token', token);
    expect(res).to.have.status(404);
    expect(res.body).to.deep.equal({ error: 'Not found' });
  });

  it('GET /files/:id returns 401 without a token', async () => {
    const res = await chai.request(app).get(`/files/${folderId}`);
    expect(res).to.have.status(401);
  });

  it('GET /files defaults to the root (one folder here)', async () => {
    const res = await chai.request(app).get('/files').set('X-Token', token);
    expect(res).to.have.status(200);
    expect(res.body).to.be.an('array').with.lengthOf(1);
    expect(res.body[0].name).to.equal('root-folder');
  });

  it('GET /files paginates the folder: 20 on page 0', async () => {
    const res = await chai.request(app).get(`/files?parentId=${folderId}`).set('X-Token', token);
    expect(res).to.have.status(200);
    expect(res.body).to.be.an('array').with.lengthOf(20);
  });

  it('GET /files paginates the folder: 5 on page 1', async () => {
    const res = await chai.request(app).get(`/files?parentId=${folderId}&page=1`).set('X-Token', token);
    expect(res).to.have.status(200);
    expect(res.body).to.be.an('array').with.lengthOf(5);
  });

  it('GET /files returns an empty list for an unrelated parentId', async () => {
    const res = await chai.request(app).get('/files?parentId=5f1e879ec7ba06511e683b99').set('X-Token', token);
    expect(res).to.have.status(200);
    expect(res.body).to.deep.equal([]);
  });
});

describe('PUT /files/:id/publish and /unpublish', () => {
  let fileId;

  before(async () => {
    await waitConnections();
    await clearDb();
    token = await connect();
    const file = await chai.request(app).post('/files').set('X-Token', token)
      .send({ name: 'toggle.txt', type: 'file', data: HELLO_B64 });
    fileId = file.body.id;
  });

  after(clearDb);

  it('publish sets isPublic to true with status 200', async () => {
    const res = await chai.request(app).put(`/files/${fileId}/publish`).set('X-Token', token);
    expect(res).to.have.status(200);
    expect(res.body.isPublic).to.equal(true);
  });

  it('unpublish sets isPublic to false with status 200', async () => {
    const res = await chai.request(app).put(`/files/${fileId}/unpublish`).set('X-Token', token);
    expect(res).to.have.status(200);
    expect(res.body.isPublic).to.equal(false);
  });

  it('publish returns 404 for an unknown id', async () => {
    const res = await chai.request(app).put('/files/5f1e879ec7ba06511e683b99/publish').set('X-Token', token);
    expect(res).to.have.status(404);
  });

  it('publish returns 401 without a token', async () => {
    const res = await chai.request(app).put(`/files/${fileId}/publish`);
    expect(res).to.have.status(401);
  });
});

describe('GET /files/:id/data', () => {
  let fileId;
  let folderId;

  before(async () => {
    await waitConnections();
    await clearDb();
    token = await connect();
    const file = await chai.request(app).post('/files').set('X-Token', token)
      .send({ name: 'content.txt', type: 'file', data: HELLO_B64 });
    fileId = file.body.id;
    const folder = await chai.request(app).post('/files').set('X-Token', token)
      .send({ name: 'a-folder', type: 'folder' });
    folderId = folder.body.id;
  });

  after(clearDb);

  it('returns the file content for the owner', async () => {
    const res = await chai.request(app).get(`/files/${fileId}/data`).set('X-Token', token);
    expect(res).to.have.status(200);
    expect(res.text).to.equal('Hello Webstack!\n');
  });

  it('returns 404 for a private file without a token', async () => {
    const res = await chai.request(app).get(`/files/${fileId}/data`);
    expect(res).to.have.status(404);
    expect(res.body).to.deep.equal({ error: 'Not found' });
  });

  it('returns the content once published, without a token', async () => {
    await chai.request(app).put(`/files/${fileId}/publish`).set('X-Token', token);
    const res = await chai.request(app).get(`/files/${fileId}/data`);
    expect(res).to.have.status(200);
    expect(res.text).to.equal('Hello Webstack!\n');
  });

  it('returns 400 for a folder', async () => {
    await chai.request(app).put(`/files/${folderId}/publish`).set('X-Token', token);
    const res = await chai.request(app).get(`/files/${folderId}/data`).set('X-Token', token);
    expect(res).to.have.status(400);
    expect(res.body).to.deep.equal({ error: "A folder doesn't have content" });
  });

  it('returns 404 for an unknown id', async () => {
    const res = await chai.request(app).get('/files/5f1e879ec7ba06511e683b99/data').set('X-Token', token);
    expect(res).to.have.status(404);
  });
});
