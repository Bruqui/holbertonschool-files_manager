import express from 'express';
import router from './routes/index';
import dbClient from './utils/db';

const app = express();
const PORT = process.env.PORT || 5000;

// Base64 payloads inflate the body by ~33%, well past express' 100kb default.
app.use(express.json({ limit: '10mb' }));
app.use('/', router);

// Only start listening once Mongo is connected, so no request can reach a
// handler while dbClient.db is still null (which would hang the request).
dbClient.whenConnected().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

export default app;
