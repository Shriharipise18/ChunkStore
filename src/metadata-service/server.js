const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
const File = require('./models/File');
const promClient = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3001;

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'metadata_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const fileOperationsCounter = new promClient.Counter({
  name: 'metadata_file_operations_total',
  help: 'Total number of file operations',
  labelNames: ['operation', 'status']
});

register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(fileOperationsCounter);

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    httpRequestDurationMicroseconds
      .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
      .observe(duration / 1000);
  });
  next();
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// MongoDB connection handling
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dfs-metadata';

mongoose.connection.on('connected', () => {
  console.log('Successfully connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Disconnected from MongoDB');
});

// Connect to MongoDB with retry logic
const connectWithRetry = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    });
  } catch (err) {
    console.error('Failed to connect to MongoDB, retrying in 5 seconds...', err);
    setTimeout(connectWithRetry, 5000);
  }
};

connectWithRetry();

// Routes
app.post('/files', async (req, res) => {
  try {
    const { filename, size, mimeType, replicationFactor } = req.body;
    const file = new File({
      fileId: uuidv4(),
      filename,
      size,
      mimeType,
      replicationFactor: replicationFactor || 3
    });
    await file.save();
    fileOperationsCounter.labels('create', 'success').inc();
    res.status(201).json(file);
  } catch (error) {
    fileOperationsCounter.labels('create', 'error').inc();
    res.status(500).json({ error: error.message });
  }
});

app.get('/files/:fileId', async (req, res) => {
  try {
    const file = await File.findOne({ fileId: req.params.fileId });
    if (!file) {
      fileOperationsCounter.labels('get', 'not_found').inc();
      return res.status(404).json({ error: 'File not found' });
    }
    fileOperationsCounter.labels('get', 'success').inc();
    res.json(file);
  } catch (error) {
    fileOperationsCounter.labels('get', 'error').inc();
    res.status(500).json({ error: error.message });
  }
});

app.delete('/files/:fileId', async (req, res) => {
  try {
    const file = await File.findOne({ fileId: req.params.fileId });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    await File.deleteOne({ fileId: req.params.fileId });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/files/:fileId/chunks', async (req, res) => {
  try {
    const { chunks } = req.body;
    const file = await File.findOne({ fileId: req.params.fileId });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Add all chunks to the file
    if (Array.isArray(chunks)) {
      file.chunks = [...file.chunks, ...chunks];
    } else {
      // Handle single chunk for backward compatibility
      file.chunks.push(chunks);
    }
    
    await file.save();
    res.status(201).json(file);
  } catch (error) {
    console.error('Error updating chunks:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/files/:fileId/chunks/:chunkId', async (req, res) => {
  try {
    const file = await File.findOne({ fileId: req.params.fileId });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const chunk = file.chunks.find(c => c.chunkId === req.params.chunkId);
    if (!chunk) {
      return res.status(404).json({ error: 'Chunk not found' });
    }
    
    res.json(chunk);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/files', async (req, res) => {
  try {
    const files = await File.find().sort({ createdAt: -1 });
    res.json(files);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Metadata service running on port ${PORT}`);
}); 