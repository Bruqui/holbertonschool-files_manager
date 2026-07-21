import express from 'express';
import router from './routes/index';
import dbClient from './utils/db';

const app = express();
const PORT = process.env.PORT || 5000;

// Base64 payloads inflate the body by ~33%, well past express' 100kb default.
app.use(express.json({ limit: '10mb' }));
app.use('/', router);

// Any error escaping an async handler returns a response instead of leaving
// the request to hang (Express 4 does not forward async rejections on its own).
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ error: 'Internal Server Error' });
});

// Only start listening once Mongo is connected, so no request can reach a
// handler while dbClient.db is still null (which would hang the request).
dbClient.whenConnected().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  // Importing this module in a test while a server already holds the port
  // must not crash the process with an uncaught EADDRINUSE.
  server.on('error', (err) => console.error(`Server error: ${err.message}`));
});

export default app;
