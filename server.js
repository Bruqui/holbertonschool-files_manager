import express from 'express';
import router from './routes/index';

const app = express();
const PORT = process.env.PORT || 5000;

// Base64 payloads inflate the body by ~33%, well past express' 100kb default.
app.use(express.json({ limit: '10mb' }));
app.use('/', router);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
