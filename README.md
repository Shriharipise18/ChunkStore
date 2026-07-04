# Distributed File System

A scalable distributed file system with metadata management, file chunking, node replication, and fault tolerance — inspired by systems like HDFS and IPFS.

## Features

- **Metadata Management**: Efficient tracking of file metadata and chunk information
- **File Chunking**: Automatic splitting of large files into manageable chunks
- **Node Replication**: Configurable replication factor for fault tolerance
- **REST API**: Simple and intuitive API for file operations
- **Scalability**: Microservices architecture for horizontal scaling
- **Fault Tolerance**: Automatic replication and recovery mechanisms
- **Modern UI**: React-based frontend with Material UI components

## Architecture

The system consists of four main components:

1. **Frontend** (Port 80)
   - React-based user interface
   - Material UI components
   - Responsive design for all devices

2. **API Gateway** (Port 3000)
   - Handles client requests
   - Coordinates between services
   - Manages file upload/download operations

3. **Metadata Service** (Port 3001)
   - Stores file metadata
   - Manages chunk information
   - Tracks storage node locations

4. **Storage Service** (Port 3002)
   - Handles actual file storage
   - Manages file chunks
   - Implements replication

## Prerequisites

- Node.js 18 or higher
- Docker and Docker Compose
- MongoDB

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd distributed-file-system
   ```

2. Install dependencies:
   ```bash
   # Install backend dependencies
   npm install
   
   # Install frontend dependencies
   cd frontend
   npm install
   cd ..
   ```

3. Start the services using Docker Compose:
   ```bash
   docker-compose up -d
   ```

## API Endpoints

### Upload File
```http
POST /upload
Content-Type: multipart/form-data

file: <file>
```

### Download File
```http
GET /download/:fileId
```

### Get File Metadata
```http
GET /files/:fileId
```

## Frontend Features

- **Dashboard**: System overview with key metrics
- **File Upload**: Drag-and-drop interface for file uploads
- **File Management**: List, view, download, and delete files
- **File Details**: View detailed information about files and their chunks

## Configuration

The system can be configured through environment variables:

- `NODE_ENV`: Environment (development/production)
- `METADATA_SERVICE_URL`: URL of the metadata service
- `STORAGE_SERVICE_URL`: URL of the storage service
- `MONGODB_URI`: MongoDB connection string
- `STORAGE_PATH`: Path for file storage
- `CHUNK_SIZE`: Size of file chunks (default: 5MB)

## Development

To run the services individually:

```bash
# API Gateway
npm run start

# Metadata Service
npm run start:metadata

# Storage Service
npm run start:storage

# Frontend
npm run start:frontend
```

## Testing

Run the test suite:

```bash
npm test
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 