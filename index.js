const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use("/assets",express.static('public'));

const config = {
  jwtSecret: 'your_secret_key',
  port: 3000,
};

const usersFile = './users.json';
const roomsFile = './rooms.json';

const readFile = (file) => JSON.parse(fs.existsSync(file) ? fs.readFileSync(file) : '{}');
const writeFile = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, config.jwtSecret, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

app.get('/',(req,res)=>{
    res.sendFile(__dirname + '/index.html')
})
app.get('/chats',(req,res)=>{
    res.sendFile(__dirname + '/chat.html')
})

// Регистрация
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Invalid input' });

  const users = readFile(usersFile);
  if (users[username]) return res.status(400).json({ error: 'Username already exists' });

  users[username] = { password };
  writeFile(usersFile, users);
  res.json({ message: 'User registered successfully' });
});

// Авторизация
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readFile(usersFile);

  if (!users[username] || users[username].password !== password)
    return res.status(400).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ username }, config.jwtSecret, { expiresIn: '1h' });
  res.json({ token });
});

// Создание комнаты
app.post('/api/rooms', authenticateToken, (req, res) => {
  const { name, isPublic, maxMessages } = req.body;
  if (!name || maxMessages <= 0) return res.status(400).json({ error: 'Invalid input' });

  const rooms = readFile(roomsFile);
  const roomId = String(Math.floor(100000 + Math.random() * 900000));
  rooms[roomId] = {
    name,
    isPublic,
    maxMessages,
    owner: req.user.username,
    members: [req.user.username],
    messages: [],
    createdAt: new Date().toISOString(),
  };

  writeFile(roomsFile, rooms);
  res.json({ roomId, message: 'Room created successfully' });
});

// Присоединение к комнате
app.post('/api/rooms/join', authenticateToken, (req, res) => {
  const { roomId } = req.body;
  const rooms = readFile(roomsFile);

  if (!rooms[roomId]) return res.status(404).json({ error: 'Room not found' });

  if (!rooms[roomId].members.includes(req.user.username)) {
    rooms[roomId].members.push(req.user.username);
    writeFile(roomsFile, rooms);
  }
  res.json({ message: 'Joined room successfully' });
});

// Получение списка публичных комнат
app.get('/api/rooms/public', (req, res) => {
  const rooms = readFile(roomsFile);
  const publicRooms = Object.entries(rooms)
    .filter(([, room]) => room.isPublic)
    .map(([roomId, room]) => ({
      roomId,
      name: room.name,
      owner: room.owner,
      membersCount: room.members.length,
    }));
  res.json(publicRooms);
});

// Получение информации о комнате
app.get('/api/rooms/:roomId', authenticateToken, (req, res) => {
  const { roomId } = req.params;
  const rooms = readFile(roomsFile);

  const room = rooms[roomId];
  if (!room || !room.members.includes(req.user.username))
    return res.status(404).json({ error: 'Room not found or access denied' });

  res.json({
    roomId,
    name: room.name,
    isPublic: room.isPublic,
    owner: room.owner,
    members: room.members,
    messages: room.messages,
  });
});

// Отправка сообщения в комнату
app.post('/api/rooms/:roomId/messages', authenticateToken, (req, res) => {
  const { roomId } = req.params;
  const { content } = req.body;
  const rooms = readFile(roomsFile);

  const room = rooms[roomId];
  if (!room || !room.members.includes(req.user.username))
    return res.status(404).json({ error: 'Room not found or access denied' });

  if (room.messages.length >= room.maxMessages) room.messages.shift();
  room.messages.push({ author: req.user.username, content, timestamp: new Date().toISOString() });

  writeFile(roomsFile, rooms);
  res.json({ message: 'Message sent successfully' });
});

// Выход из комнаты
app.post('/api/rooms/:roomId/leave', authenticateToken, (req, res) => {
  const { roomId } = req.params;
  const rooms = readFile(roomsFile);

  const room = rooms[roomId];
  if (!room || !room.members.includes(req.user.username))
    return res.status(404).json({ error: 'Room not found or not a member' });

  room.members = room.members.filter((member) => member !== req.user.username);
  writeFile(roomsFile, rooms);
  res.json({ message: 'Left room successfully' });
});

// Запуск сервера
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});