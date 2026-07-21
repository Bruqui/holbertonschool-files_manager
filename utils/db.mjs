import mongodb from 'mongodb';

const { MongoClient } = mongodb;

const HOST = process.env.DB_HOST || 'localhost';
const PORT = process.env.DB_PORT || 27017;
const DATABASE = process.env.DB_DATABASE || 'files_manager';

class DBClient {
  constructor() {
    this.db = null;
    this.client = new MongoClient(`mongodb://${HOST}:${PORT}`, {
      useUnifiedTopology: true,
    });
    // Kept so callers (server.js, worker.js) can await a ready connection
    // before serving requests -- otherwise a query can hit a null `db` and
    // throw inside an async handler, which Express 4 turns into a hung request.
    this.connectPromise = this.client.connect()
      .then(() => {
        this.db = this.client.db(DATABASE);
      })
      .catch((err) => {
        console.error(`MongoDB client error: ${err.message}`);
      });
  }

  async whenConnected() {
    await this.connectPromise;
  }

  isAlive() {
    return this.db !== null;
  }

  async nbUsers() {
    if (!this.isAlive()) return 0;
    return this.db.collection('users').countDocuments();
  }

  async nbFiles() {
    if (!this.isAlive()) return 0;
    return this.db.collection('files').countDocuments();
  }
}

const dbClient = new DBClient();
export default dbClient;
