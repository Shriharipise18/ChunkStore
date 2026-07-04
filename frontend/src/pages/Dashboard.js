import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Button,
  LinearProgress,
  Paper,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Storage as StorageIcon,
  Speed as SpeedIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';
import axios from 'axios';

function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalFiles: 0,
    totalStorage: 0,
    activeNodes: 0,
    systemHealth: 100,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await axios.get('/api/files');
        const files = response.data;
        
        // Calculate total storage used
        const totalStorageBytes = files.reduce((sum, file) => sum + file.size, 0);
        const totalStorageMB = totalStorageBytes / (1024 * 1024); // Convert bytes to MB
        
        setStats({
          totalFiles: files.length,
          totalStorage: totalStorageMB.toFixed(2),
          activeNodes: 1, // Currently only one node is active
          systemHealth: 100, // System is healthy
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    {
      title: 'Total Files',
      value: stats.totalFiles.toLocaleString(),
      icon: <StorageIcon fontSize="large" color="primary" />,
      color: '#1976d2',
    },
    {
      title: 'Storage Used',
      value: `${stats.totalStorage} MB`,
      icon: <SpeedIcon fontSize="large" color="secondary" />,
      color: '#dc004e',
    },
    {
      title: 'Active Nodes',
      value: stats.activeNodes,
      icon: <SecurityIcon fontSize="large" sx={{ color: '#4caf50' }} />,
      color: '#4caf50',
    },
    {
      title: 'System Health',
      value: `${stats.systemHealth}%`,
      icon: <SecurityIcon fontSize="large" sx={{ color: '#ff9800' }} />,
      color: '#ff9800',
    },
  ];

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Dashboard
        </Typography>
        <Button
          variant="contained"
          startIcon={<CloudUploadIcon />}
          onClick={() => navigate('/upload')}
        >
          Upload File
        </Button>
      </Box>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statCards.map((card) => (
          <Grid item xs={12} sm={6} md={3} key={card.title}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  {card.icon}
                  <Typography variant="h6" component="div" sx={{ ml: 1 }}>
                    {card.title}
                  </Typography>
                </Box>
                <Typography variant="h4" component="div" sx={{ color: card.color }}>
                  {card.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              System Health
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Box sx={{ width: '100%', mr: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={stats.systemHealth}
                  sx={{
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: '#e0e0e0',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: stats.systemHealth > 90 ? '#4caf50' : '#ff9800',
                    },
                  }}
                />
              </Box>
              <Box sx={{ minWidth: 35 }}>
                <Typography variant="body2" color="text.secondary">
                  {`${Math.round(stats.systemHealth)}%`}
                </Typography>
              </Box>
            </Box>
            <Grid container spacing={2} sx={{ mt: 2 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    API Gateway
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#4caf50' }}>
                    Online
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Metadata Service
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#4caf50' }}>
                    Online
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Storage Service
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#4caf50' }}>
                    Online
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Database
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#4caf50' }}>
                    Connected
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Last checked: {new Date().toLocaleTimeString()}
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard; 