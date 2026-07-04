const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const promClient = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3002;
const STORAGE_PATH = process.env.STORAGE_PATH || '/data';

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'storage_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const chunkOperationsCounter = new promClient.Counter({
  name: 'storage_chunk_operations_total',
  help: 'Total number of chunk operations',
  labelNames: ['operation', 'status']
});

const chunkSizeGauge = new promClient.Gauge({
  name: 'storage_chunk_size_bytes',
  help: 'Size of chunks in bytes',
  labelNames: ['operation']
});

register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(chunkOperationsCounter);
register.registerMetric(chunkSizeGauge);

// Ensure storage directory exists
fsPromises.mkdir(STORAGE_PATH, { recursive: true }).catch(console.error);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, STORAGE_PATH);
  },
  filename: (req, file, cb) => {
    // Generate a temporary filename, we'll rename it after upload
    const tempName = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    cb(null, tempName);
  }
});

const upload = multer({ storage });

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

// Calculate file checksum
async function calculateChecksum(filePath) {
  const fileBuffer = await fsPromises.readFile(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

// Routes
app.post('/chunks', upload.single('chunk'), async (req, res) => {
  try {
    if (!req.file) {
      chunkOperationsCounter.labels('upload', 'error').inc();
      console.error('[Storage Service] No chunk file received');
      return res.status(400).json({ error: 'No chunk file uploaded' });
    }

    if (!req.body.chunkId) {
      chunkOperationsCounter.labels('upload', 'error').inc();
      console.error('[Storage Service] No chunkId provided');
      return res.status(400).json({ error: 'chunkId is required' });
    }

    console.log(`[Storage Service] Received chunk upload request:`, {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      chunkId: req.body.chunkId
    });

    const tempPath = req.file.path;
    const finalPath = path.join(STORAGE_PATH, req.body.chunkId);
    
    // Rename the temp file to use the chunkId
    await fsPromises.rename(tempPath, finalPath);
    
    const checksum = await calculateChecksum(finalPath);
    const chunkId = req.body.chunkId;

    chunkSizeGauge.labels('upload').set(req.file.size);
    chunkOperationsCounter.labels('upload', 'success').inc();

    // Log chunk storage for debugging
    console.log(`[Storage Service] Stored chunk ${chunkId} at ${finalPath}`, {
      size: req.file.size,
      checksum: checksum
    });

    res.status(201).json({
      chunkId,
      size: req.file.size,
      path: finalPath,
      checksum
    });
  } catch (error) {
    chunkOperationsCounter.labels('upload', 'error').inc();
    console.error('[Storage Service] Error storing chunk:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/chunks/:chunkId', async (req, res) => {
  try {
    console.log(`[Storage Service] Chunk request received: ${req.params.chunkId}`);
    const chunkPath = path.join(STORAGE_PATH, req.params.chunkId);
    
    try {
      console.log(`[Storage Service] Getting file stats for: ${chunkPath}`);
      const stats = await fsPromises.stat(chunkPath);
      console.log(`[Storage Service] File stats:`, {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      });
      
      // Set response headers
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Type', 'application/octet-stream');
      console.log(`[Storage Service] Response headers set:`, {
        'Content-Length': stats.size,
        'Content-Type': 'application/octet-stream'
      });
      
      // Create read stream with error handling
      console.log(`[Storage Service] Creating read stream for: ${chunkPath}`);
      const fileStream = fs.createReadStream(chunkPath);
      let bytesStreamed = 0;
      
      fileStream.on('data', (chunk) => {
        bytesStreamed += chunk.length;
        chunkSizeGauge.labels('download').set(bytesStreamed);
        console.log(`[Storage Service] Streaming data: ${bytesStreamed} bytes`);
      });
      
      fileStream.on('error', (error) => {
        chunkOperationsCounter.labels('download', 'error').inc();
        console.error(`[Storage Service] Error streaming chunk ${req.params.chunkId}:`, {
          message: error.message,
          code: error.code,
          stack: error.stack
        });
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error streaming chunk' });
        }
      });
      
      fileStream.on('end', () => {
        chunkOperationsCounter.labels('download', 'success').inc();
        console.log(`[Storage Service] Finished streaming chunk ${req.params.chunkId}: ${bytesStreamed} bytes total`);
      });
      
      // Pipe the file stream to the response
      console.log(`[Storage Service] Starting to pipe file stream to response`);
      fileStream.pipe(res);
    } catch (error) {
      if (error.code === 'ENOENT') {
        chunkOperationsCounter.labels('download', 'not_found').inc();
        console.error(`[Storage Service] Chunk not found: ${req.params.chunkId}`);
        return res.status(404).json({ error: 'Chunk not found' });
      }
      chunkOperationsCounter.labels('download', 'error').inc();
      console.error(`[Storage Service] Error accessing chunk file ${chunkPath}:`, {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error accessing chunk file' });
      }
    }
  } catch (error) {
    chunkOperationsCounter.labels('download', 'error').inc();
    console.error(`[Storage Service] Error retrieving chunk ${req.params.chunkId}:`, {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error retrieving chunk' });
    }
  }
});

app.delete('/chunks/:chunkId', async (req, res) => {
  try {
    // List all files in the storage directory
    const files = await fsPromises.readdir(STORAGE_PATH);
    
    // Find the chunk file that matches the requested chunkId
    const chunkFile = files.find(file => file.includes(req.params.chunkId));
    
    if (!chunkFile) {
      console.error(`Chunk not found: ${req.params.chunkId}`);
      return res.status(404).json({ error: 'Chunk not found' });
    }
    
    const chunkPath = path.join(STORAGE_PATH, chunkFile);
    await fsPromises.unlink(chunkPath);
    console.log(`Deleted chunk file: ${chunkFile}`);
    res.status(204).send();
  } catch (error) {
    console.error(`Error deleting chunk ${req.params.chunkId}:`, error);
    res.status(404).json({ error: 'Chunk not found' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Storage service running on port ${PORT}`);
}); 