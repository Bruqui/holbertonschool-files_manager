import { expect } from 'chai';
import redisClient from '../utils/redis';

describe('redisClient', () => {
  before((done) => {
    const check = () => (redisClient.isAlive() ? done() : setTimeout(check, 50));
    check();
  });

  after(async () => {
    await redisClient.del('test_key');
    await redisClient.del('test_del');
    await redisClient.del('test_exp');
  });

  it('isAlive() is true once connected', () => {
    expect(redisClient.isAlive()).to.equal(true);
  });

  it('get() returns null for an unknown key', async () => {
    expect(await redisClient.get('does_not_exist')).to.equal(null);
  });

  it('set() then get() returns the stored value', async () => {
    await redisClient.set('test_key', 'hello', 20);
    expect(await redisClient.get('test_key')).to.equal('hello');
  });

  it('del() removes the key', async () => {
    await redisClient.set('test_del', 'gone', 20);
    await redisClient.del('test_del');
    expect(await redisClient.get('test_del')).to.equal(null);
  });

  it('set() honours the expiration', async () => {
    await redisClient.set('test_exp', 'brief', 1);
    expect(await redisClient.get('test_exp')).to.equal('brief');
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(await redisClient.get('test_exp')).to.equal(null);
  });
});
