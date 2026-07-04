import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Typography,
  Paper,
  Button,
  LinearProgress,
  Alert,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { toast } from 'react-toastify';

function FileUpload() {
  const navigate = useNavigate();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, success, error
  const [uploadedFile, setUploadedFile] = useState(null);
  const [error, setError] = useState(null);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploadStatus('uploading');
    setUploadProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append('chunk', file);
    formData.append('chunkId', `chunk-${Date.now()}-${Math.random().toString(36).substring(7)}`);

    try {
      const response = await axios.post('/api/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      });

      setUploadedFile({
        name: file.name,
        size: file.size,
        fileId: response.data.fileId,
      });
      setUploadStatus('success');
      toast.success('File uploaded successfully!');
      navigate(`/files/${response.data.fileId}`);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Failed to upload file');
      setUploadStatus('error');
      toast.error('Failed to upload file');
    }
  }, [navigate]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
  });

  const handleViewFile = () => {
    if (uploadedFile) {
      navigate(`/files/${uploadedFile.fileId}`);
    }
  };

  const handleUploadAnother = () => {
    setUploadStatus('idle');
    setUploadProgress(0);
    setUploadedFile(null);
    setError(null);
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Upload File
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper
            {...getRootProps()}
            sx={{
              p: 3,
              textAlign: 'center',
              backgroundColor: isDragActive ? 'rgba(25, 118, 210, 0.08)' : 'white',
              border: '2px dashed',
              borderColor: isDragActive ? 'primary.main' : 'grey.300',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              '&:hover': {
                backgroundColor: 'rgba(25, 118, 210, 0.04)',
                borderColor: 'primary.main',
              },
            }}
          >
            <input {...getInputProps()} />
            <CloudUploadIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              {isDragActive
                ? 'Drop the file here'
                : 'Drag and drop a file here, or click to select'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Supported file types: All
            </Typography>
          </Paper>

          {uploadStatus === 'uploading' && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" gutterBottom>
                Uploading...
              </Typography>
              <LinearProgress
                variant="determinate"
                value={uploadProgress}
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {uploadProgress}%
              </Typography>
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 3 }}>
              {error}
            </Alert>
          )}
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Upload Status
              </Typography>

              {uploadStatus === 'idle' && (
                <Typography variant="body2" color="text.secondary">
                  No file selected
                </Typography>
              )}

              {uploadStatus === 'success' && uploadedFile && (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                    <Typography variant="body1">Upload Complete</Typography>
                  </Box>
                  <Typography variant="body2" gutterBottom>
                    File: {uploadedFile.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Size: {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Button
                      variant="contained"
                      fullWidth
                      onClick={handleViewFile}
                      sx={{ mb: 1 }}
                    >
                      View File
                    </Button>
                    <Button
                      variant="outlined"
                      fullWidth
                      onClick={handleUploadAnother}
                    >
                      Upload Another
                    </Button>
                  </Box>
                </Box>
              )}

              {uploadStatus === 'error' && (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <ErrorIcon color="error" sx={{ mr: 1 }} />
                  <Typography variant="body1">Upload Failed</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default FileUpload; 