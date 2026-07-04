const mongoose = require('mongoose');

const chunkSchema = new mongoose.Schema({
  chunkId: {
    type: String,
    required: true,
    unique: true,
    sparse: true
  },
  size: {
    type: Number,
    required: true
  },
  storageNodes: [{
    nodeId: String,
    url: String
  }],
  checksum: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const fileSchema = new mongoose.Schema({
  fileId: {
    type: String,
    required: true,
    unique: true
  },
  filename: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  mimeType: String,
  chunks: {
    type: [chunkSchema],
    default: []
  },
  replicationFactor: {
    type: Number,
    default: 3
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

fileSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('File', fileSchema); 