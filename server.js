const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();

// Serve static files (index.html, CSS, client JS) from this folder
app.use(express.static(__dirname));

// Serve index.html when users go to the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Attach HTTP server to Express
const server = http.createServer(app);

// Attach WebSocket server to the SAME HTTP server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Player connected!');

  ws.on('message', (message) => {
    // Put your game logic / broadcasting here
    console.log('Received:', message.toString());
  });

  ws.on('close', () => {
    console.log('Player disconnected');
  });
});

// CRITICAL FOR RENDER: Listen on process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});