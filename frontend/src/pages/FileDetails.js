import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Button,
  CircularProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';

const FileDetails = () => {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const fetchFileDetails = async () => {
      try {
        const response = await axios.get(`/api/files/${fileId}`);
        setFile(response.data);
      } catch (err) {
        console.error('Error fetching file details:', err);
        toast.error('Failed to load file details');
      } finally {
        setLoading(false);
      }
    };

    fetchFileDetails();
  }, [fileId]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // Create a temporary link to trigger the download
      const link = document.createElement('a');
      link.href = `/api/files/${fileId}/download`;
      link.setAttribute('download', ''); // This will use the filename from the Content-Disposition header
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('File downloaded successfully');
    } catch (err) {
      console.error('Download error:', err);
      toast.error('Failed to download file');
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      await axios.delete(`/api/files/${fileId}`);
      toast.success('File deleted successfully');
      navigate('/files');
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to delete file');
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!file) {
    return (
      <Container maxWidth="lg">
        <Box mt={4}>
          <Typography variant="h5" color="error">
            File not found
          </Typography>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/files')}
            sx={{ mt: 2 }}
          >
            Back to Files
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box mt={4}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/files')}
          sx={{ mb: 3 }}
        >
          Back to Files
        </Button>

        <Paper elevation={3} sx={{ p: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h4" gutterBottom>
                {file.filename}
              </Typography>
              <Box display="flex" gap={1} mb={2}>
                <Chip label={`Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`} />
                <Chip label={`Type: ${file.mimeType}`} />
                <Chip label={`Created: ${new Date(file.createdAt).toLocaleString()}`} />
              </Box>
            </Grid>

            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                File Information
              </Typography>
              <List>
                <ListItem>
                  <ListItemText
                    primary="File ID"
                    secondary={file.fileId}
                  />
                </ListItem>
                <Divider />
                <ListItem>
                  <ListItemText
                    primary="Chunks"
                    secondary={`${file.chunks?.length || 0} chunks`}
                  />
                </ListItem>
                <Divider />
                <ListItem>
                  <ListItemText
                    primary="Replication Factor"
                    secondary={file.replicationFactor || 3}
                  />
                </ListItem>
                <Divider />
                <ListItem>
                  <ListItemText
                    primary="Chunk Size"
                    secondary="5 MB per chunk"
                  />
                </ListItem>
                <Divider />
                <ListItem>
                  <ListItemText
                    primary="Storage Nodes"
                    secondary="1 node (node1)"
                  />
                </ListItem>
              </List>
            </Grid>

            <Grid item xs={12}>
              <Box display="flex" gap={2}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<DownloadIcon />}
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  {downloading ? 'Downloading...' : 'Download'}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={handleDelete}
                >
                  Delete
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Box>
    </Container>
  );
};

export default FileDetails; 