import { expect } from 'chai';
import dbClient from '../utils/db';
import { waitConnections, clearDb } from './helpers';

describe('dbClient', () => {
  before(async () => {
    await waitConnections();
  });

  it('isAlive() is true once connected', () => {
    expect(dbClient.isAlive()).to.equal(true);
  });

  it('nbUsers() returns a number', async () => {
    expect(await dbClient.nbUsers()).to.be.a('number');
  });

  it('nbFiles() returns a number', async () => {
    expect(await dbClient.nbFiles()).to.be.a('number');
  });

  it('nbUsers() reflects inserted documents', async () => {
    await clearDb();
    expect(await dbClient.nbUsers()).to.equal(0);
    await dbClient.db.collection('users').insertOne({ email: 'count@me.com' });
    expect(await dbClient.nbUsers()).to.equal(1);
  });

  it('nbFiles() reflects inserted documents', async () => {
    await clearDb();
    expect(await dbClient.nbFiles()).to.equal(0);
    await dbClient.db.collection('files').insertMany([{ name: 'a' }, { name: 'b' }]);
    expect(await dbClient.nbFiles()).to.equal(2);
  });
});
