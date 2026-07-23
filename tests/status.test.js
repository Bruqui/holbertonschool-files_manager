import chai from 'chai';
import chaiHttp from 'chai-http';
import dbClient from '../utils/db';
import app from '../server';
import { waitConnections, clearDb } from './helpers';

chai.use(chaiHttp);
const { expect } = chai;

describe('GET /status', () => {
  before(async () => {
    await waitConnections();
  });

  it('reports redis and db as alive with status 200', async () => {
    const res = await chai.request(app).get('/status');
    expect(res).to.have.status(200);
    expect(res.body).to.deep.equal({ redis: true, db: true });
  });
});

describe('GET /stats', () => {
  before(async () => {
    await waitConnections();
    await clearDb();
    await dbClient.db.collection('users').insertMany([{ email: 'a' }, { email: 'b' }]);
    await dbClient.db.collection('files').insertMany([{ name: 'x' }, { name: 'y' }, { name: 'z' }]);
  });

  after(clearDb);

  it('returns the users and files counts with status 200', async () => {
    const res = await chai.request(app).get('/stats');
    expect(res).to.have.status(200);
    expect(res.body).to.deep.equal({ users: 2, files: 3 });
  });
});
