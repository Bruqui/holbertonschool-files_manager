import chai from 'chai';
import chaiHttp from 'chai-http';
import sha1 from 'sha1';
import dbClient from '../utils/db';
import app from '../server';
import { waitConnections, clearDb, basicAuth } from './helpers';

chai.use(chaiHttp);
const { expect } = chai;

const EMAIL = 'user@test.com';
const PASSWORD = 'superSecret1';

describe('POST /users', () => {
  before(async () => {
    await waitConnections();
    await clearDb();
  });

  after(clearDb);

  it('creates a user and returns id + email with status 201', async () => {
    const res = await chai.request(app).post('/users').send({ email: EMAIL, password: PASSWORD });
    expect(res).to.have.status(201);
    expect(res.body).to.have.property('id');
    expect(res.body.email).to.equal(EMAIL);
    expect(res.body).to.not.have.property('password');
  });

  it('stores the SHA1 of the password', async () => {
    const stored = await dbClient.db.collection('users').findOne({ email: EMAIL });
    expect(stored.password).to.equal(sha1(PASSWORD));
  });

  it('rejects a missing email with 400 Missing email', async () => {
    const res = await chai.request(app).post('/users').send({ password: PASSWORD });
    expect(res).to.have.status(400);
    expect(res.body).to.deep.equal({ error: 'Missing email' });
  });

  it('rejects a missing password with 400 Missing password', async () => {
    const res = await chai.request(app).post('/users').send({ email: 'x@y.com' });
    expect(res).to.have.status(400);
    expect(res.body).to.deep.equal({ error: 'Missing password' });
  });

  it('rejects a duplicate email with 400 Already exist', async () => {
    const res = await chai.request(app).post('/users').send({ email: EMAIL, password: PASSWORD });
    expect(res).to.have.status(400);
    expect(res.body).to.deep.equal({ error: 'Already exist' });
  });
});

describe('GET /connect, /disconnect and /users/me', () => {
  let token;

  before(async () => {
    await waitConnections();
    await clearDb();
    await chai.request(app).post('/users').send({ email: EMAIL, password: PASSWORD });
  });

  after(clearDb);

  it('rejects a bad Basic auth with 401', async () => {
    const res = await chai.request(app).get('/connect').set('Authorization', basicAuth(EMAIL, 'wrong'));
    expect(res).to.have.status(401);
    expect(res.body).to.deep.equal({ error: 'Unauthorized' });
  });

  it('signs in with a valid Basic auth and returns a token', async () => {
    const res = await chai.request(app).get('/connect').set('Authorization', basicAuth(EMAIL, PASSWORD));
    expect(res).to.have.status(200);
    expect(res.body).to.have.property('token');
    token = res.body.token;
  });

  it('GET /users/me returns the user for a valid token', async () => {
    const res = await chai.request(app).get('/users/me').set('X-Token', token);
    expect(res).to.have.status(200);
    expect(res.body.email).to.equal(EMAIL);
    expect(res.body).to.have.property('id');
  });

  it('GET /users/me rejects a missing/invalid token with 401', async () => {
    const res = await chai.request(app).get('/users/me').set('X-Token', 'nope');
    expect(res).to.have.status(401);
    expect(res.body).to.deep.equal({ error: 'Unauthorized' });
  });

  it('GET /disconnect signs out with status 204', async () => {
    const res = await chai.request(app).get('/disconnect').set('X-Token', token);
    expect(res).to.have.status(204);
  });

  it('the token is invalid after disconnect', async () => {
    const res = await chai.request(app).get('/users/me').set('X-Token', token);
    expect(res).to.have.status(401);
  });
});
