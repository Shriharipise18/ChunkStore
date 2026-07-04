const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const FormData = require('form-data');
const promClient = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const fileUploadCounter = new promClient.Counter({
  name: 'file_uploads_total',
  help: 'Total number of file uploads',
  labelNames: ['status']
});

const fileDownloadCounter = new promClient.Counter({
  name: 'file_downloads_total',
  help: 'Total number of file downloads',
  labelNames: ['status']
});

const chunkOperationsCounter = new promClient.Counter({
  name: 'chunk_operations_total',
  help: 'Total number of chunk operations',
  labelNames: ['operation', 'status']
});

register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(fileUploadCounter);
register.registerMetric(fileDownloadCounter);
register.registerMetric(chunkOperationsCounter);

// Service URLs
const METADATA_SERVICE_URL = process.env.METADATA_SERVICE_URL || 'http://localhost:3001';
const STORAGE_NODES = (process.env.STORAGE_NODES || 'http://localhost:3002').split(',');
let currentNodeIndex = 0;

// Load balancer function - Simple round-robin
function getNextStorageNode() {
  const node = STORAGE_NODES[currentNodeIndex];
  currentNodeIndex = (currentNodeIndex + 1) % STORAGE_NODES.length;
  return node;
}

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

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

// Helper function to split file into chunks
function* createChunks(buffer, chunkSize) {
  for (let i = 0; i < buffer.length; i += chunkSize) {
    yield buffer.slice(i, i + chunkSize);
  }
}

// List all files
app.get('/api/files', async (req, res) => {
  try {
    const response = await axios.get(`${METADATA_SERVICE_URL}/files`);
    const files = response.data.map(file => ({
      fileId: file.fileId,
      filename: file.filename,
      size: file.size,
      mimeType: file.mimeType || 'application/octet-stream',
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      chunks: file.chunks || [],
      replicationFactor: file.replicationFactor || 3,
      // Add any additional fields needed by the frontend
      status: 'active',
      type: file.mimeType ? file.mimeType.split('/')[0] : 'unknown'
    }));
    res.json(files);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: error.message });
  }
});

// Routes
app.post('/api/files/upload', upload.single('chunk'), async (req, res) => {
  try {
    if (!req.file) {
      fileUploadCounter.labels('error').inc();
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Create file metadata
    const fileMetadata = {
      filename: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      replicationFactor: 3
    };

    const metadataResponse = await axios.post(`${METADATA_SERVICE_URL}/files`, fileMetadata);
    const fileId = metadataResponse.data.fileId;

    // Split file into chunks and upload
    const chunks = Array.from(createChunks(req.file.buffer, CHUNK_SIZE));
    const chunkPromises = chunks.map(async (chunk, index) => {
      const chunkId = uuidv4();
      
      // Create a FormData object for the chunk
      const formData = new FormData();
      const chunkBuffer = Buffer.from(chunk);
      formData.append('chunk', chunkBuffer, {
        filename: `chunk-${index}`,
        contentType: req.file.mimetype,
        knownLength: chunkBuffer.length
      });
      formData.append('chunkId', chunkId);

      // Get next storage node using round-robin
      const storageNode = getNextStorageNode();
      const storageResponse = await axios.post(`${storageNode}/chunks`, formData, {
        headers: {
          ...formData.getHeaders(),
          'Content-Length': formData.getLengthSync()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      return {
        chunkId,
        size: chunk.length,
        storageNodes: [{
          nodeId: `node${currentNodeIndex + 1}`,
          url: storageNode
        }],
        checksum: storageResponse.data.checksum
      };
    });

    const chunkResults = await Promise.all(chunkPromises);

    // Update metadata with chunk information
    await axios.post(`${METADATA_SERVICE_URL}/files/${fileId}/chunks`, {
      chunks: chunkResults
    });

    fileUploadCounter.labels('success').inc();
    res.status(201).json({
      fileId,
      message: 'File uploaded successfully',
      chunks: chunkResults.length
    });
  } catch (error) {
    fileUploadCounter.labels('error').inc();
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Keep the old endpoint for backward compatibility
app.post('/upload', upload.single('chunk'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Create file metadata
    const fileMetadata = {
      filename: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      replicationFactor: 3
    };

    const metadataResponse = await axios.post(`${METADATA_SERVICE_URL}/files`, fileMetadata);
    const fileId = metadataResponse.data.fileId;

    // Split file into chunks and upload
    const chunks = Array.from(createChunks(req.file.buffer, CHUNK_SIZE));
    const chunkPromises = chunks.map(async (chunk, index) => {
      const chunkId = uuidv4();
      
      // Create a FormData object for the chunk
      const formData = new FormData();
      const chunkBuffer = Buffer.from(chunk);
      formData.append('chunk', chunkBuffer, {
        filename: `chunk-${index}`,
        contentType: req.file.mimetype,
        knownLength: chunkBuffer.length
      });
      formData.append('chunkId', chunkId);

      // Get next storage node using round-robin
      const storageNode = getNextStorageNode();
      const storageResponse = await axios.post(`${storageNode}/chunks`, formData, {
        headers: {
          ...formData.getHeaders(),
          'Content-Length': formData.getLengthSync()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      return {
        chunkId,
        size: chunk.length,
        storageNodes: [{
          nodeId: `node${currentNodeIndex + 1}`,
          url: storageNode
        }],
        checksum: storageResponse.data.checksum
      };
    });

    const chunkResults = await Promise.all(chunkPromises);

    // Update metadata with chunk information
    await axios.post(`${METADATA_SERVICE_URL}/files/${fileId}/chunks`, {
      chunks: chunkResults
    });

    res.status(201).json({
      fileId,
      message: 'File uploaded successfully',
      chunks: chunkResults.length
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download file endpoint
app.get('/api/files/:fileId/download', async (req, res) => {
  try {
    console.log(`[API Gateway] Download request received for file: ${req.params.fileId}`);
    
    // Get file metadata
    console.log(`[API Gateway] Fetching metadata from: ${METADATA_SERVICE_URL}/files/${req.params.fileId}`);
    const metadataResponse = await axios.get(`${METADATA_SERVICE_URL}/files/${req.params.fileId}`);
    const file = metadataResponse.data;
    console.log(`[API Gateway] File metadata retrieved:`, {
      fileId: file.fileId,
      filename: file.filename,
      size: file.size,
      mimeType: file.mimeType,
      chunksCount: file.chunks?.length || 0
    });

    if (!file.chunks || file.chunks.length === 0) {
      console.error(`[API Gateway] No chunks found for file: ${req.params.fileId}`);
      return res.status(404).json({ error: 'File chunks not found' });
    }

    // Set response headers
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    console.log(`[API Gateway] Response headers set:`, {
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.filename}"`
    });

    // Stream chunks from storage nodes
    for (const chunk of file.chunks) {
      const storageNode = chunk.storageNodes[0]; // Get first available node
      try {
        console.log(`[API Gateway] Processing chunk:`, {
          chunkId: chunk.chunkId,
          size: chunk.size,
          storageNode: storageNode.url
        });

        const chunkUrl = `${storageNode.url}/chunks/${chunk.chunkId}`;
        console.log(`[API Gateway] Requesting chunk from: ${chunkUrl}`);
        
        const chunkResponse = await axios.get(chunkUrl, {
          responseType: 'stream',
          timeout: 30000 // 30 second timeout
        });
        
        console.log(`[API Gateway] Chunk response received:`, {
          status: chunkResponse.status,
          headers: chunkResponse.headers
        });

        // Create a promise to handle the chunk streaming
        await new Promise((resolve, reject) => {
          let bytesStreamed = 0;
          
          chunkResponse.data.on('data', (chunk) => {
            bytesStreamed += chunk.length;
            console.log(`[API Gateway] Streaming chunk ${chunk.chunkId}: ${bytesStreamed} bytes`);
          });

          chunkResponse.data.on('error', (error) => {
            console.error(`[API Gateway] Error streaming chunk ${chunk.chunkId}:`, error);
            reject(error);
          });
          
          chunkResponse.data.on('end', () => {
            console.log(`[API Gateway] Finished streaming chunk ${chunk.chunkId}: ${bytesStreamed} bytes total`);
            resolve();
          });
          
          chunkResponse.data.pipe(res, { end: false });
        });
      } catch (error) {
        console.error(`[API Gateway] Error downloading chunk ${chunk.chunkId}:`, {
          message: error.message,
          code: error.code,
          response: error.response?.status,
          data: error.response?.data
        });
        throw new Error(`Failed to download chunk ${chunk.chunkId}: ${error.message}`);
      }
    }
    res.end();

    fileDownloadCounter.labels('success').inc();
  } catch (error) {
    fileDownloadCounter.labels('error').inc();
    console.error('Download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Keep the old endpoint for backward compatibility
app.get('/download/:fileId', async (req, res) => {
  try {
    // Get file metadata
    const metadataResponse = await axios.get(`${METADATA_SERVICE_URL}/files/${req.params.fileId}`);
    const file = metadataResponse.data;

    // Set response headers
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);

    // Stream chunks from storage nodes
    for (const chunk of file.chunks) {
      const storageNode = chunk.storageNodes[0]; // Get first available node
      const chunkResponse = await axios.get(`${storageNode.url}/chunks/${chunk.chunkId}`, {
        responseType: 'stream'
      });
      chunkResponse.data.pipe(res);
    }
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/files/:fileId', async (req, res) => {
  try {
    const response = await axios.get(`${METADATA_SERVICE_URL}/files/${req.params.fileId}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/files/:fileId', async (req, res) => {
  try {
    // Get file metadata to find chunks
    const metadataResponse = await axios.get(`${METADATA_SERVICE_URL}/files/${req.params.fileId}`);
    const file = metadataResponse.data;
    
    // Delete chunks from storage service
    const deleteChunkPromises = file.chunks.map(async (chunk) => {
      const storageNode = chunk.storageNodes[0]; // Get first available node
      try {
        await axios.delete(`${storageNode.url}/chunks/${chunk.chunkId}`);
      } catch (error) {
        console.error(`Error deleting chunk ${chunk.chunkId}:`, error);
        // Continue with other chunks even if one fails
      }
    });
    
    await Promise.all(deleteChunkPromises);
    
    // Delete file metadata
    await axios.delete(`${METADATA_SERVICE_URL}/files/${req.params.fileId}`);
    
    res.status(204).send();
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
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
  console.log(`API Gateway running on port ${PORT}`);
}); 