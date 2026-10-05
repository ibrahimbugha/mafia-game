const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve static assets (js, css, manifest, etc.)
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Store active room connections
const rooms = {};

wss.on('connection', (ws) => {
  let userRoom = null;

  ws.on('message', (rawMessage) => {
    try {
      const data = JSON.parse(rawMessage);

      // Handle room joining
      if (data.type === 'JOIN' || data.type === 'CREATE_ROOM') {
        userRoom = data.roomId || 'default';
        if (!rooms[userRoom]) rooms[userRoom] = new Set();
        rooms[userRoom].add(ws);

        ws.send(JSON.stringify({ type: 'CONNECTED', roomId: userRoom }));
        return;
      }

      // Broadcast game state, actions, and votes to other players in the same room
      if (userRoom && rooms[userRoom]) {
        rooms[userRoom].forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    if (userRoom && rooms[userRoom]) {
      rooms[userRoom].delete(ws);
      if (rooms[userRoom].size === 0) {
        delete rooms[userRoom];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
