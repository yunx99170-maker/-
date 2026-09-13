// ===== 回合制对战服务器 =====
// 核心原则：所有数值判定都在这里算，前端只能发"意图"
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// 允许所有来源连接（上线后可改成你的前端域名更安全）
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// 首页给个提示，方便确认服务活着
app.get('/', (req, res) => {
  res.send('对战服务器运行中 ✅');
});

// ===== 所有房间数据只存服务器内存，前端碰不到 =====
const rooms = {};
// 结构：{ '1234': { players:[id,id], hp:{id:100}, turn:id, over:false } }

function makeRoomId() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

io.on('connection', (socket) => {
  console.log('连接：', socket.id);

  // ---- 创建房间 ----
  socket.on('createRoom', () => {
    let roomId = makeRoomId();
    while (rooms[roomId]) roomId = makeRoomId(); // 防重复
    rooms[roomId] = {
      players: [socket.id],
      hp: { [socket.id]: 100 },
      turn: socket.id,
      over: false
    };
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('roomCreated', { roomId });
    console.log('创建房间：', roomId);
  });

  // ---- 加入房间 ----
  socket.on('joinRoom', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('errorMsg', '房间不存在');
    if (room.players.length >= 2) return socket.emit('errorMsg', '房间已满');

    room.players.push(socket.id);
    room.hp[socket.id] = 100;
    socket.join(roomId);
    socket.roomId = roomId;

    io.to(roomId).emit('gameStart', {
      players: room.players,
      hp: room.hp,
      turn: room.turn
    });
    console.log('开战：', roomId);
  });

  // ---- 核心：攻击（前端只发"我打谁"）----
  socket.on('attack', ({ targetId }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    if (room.over) return;

    // 校验1：是不是你的回合
    if (room.turn !== socket.id) {
      return socket.emit('errorMsg', '还没轮到你');
    }
    // 校验2：目标合法
    if (!room.players.includes(targetId) || targetId === socket.id) {
      return socket.emit('errorMsg', '非法目标');
    }

    // ===== 服务器算伤害，前端永远看不到这段 =====
    const damage = Math.floor(Math.random() * 10) + 5; // 5~14
    room.hp[targetId] -= damage;

    let winner = null;
    if (room.hp[targetId] <= 0) {
      room.over = true;
      winner = socket.id;
    } else {
      room.turn = room.players.find((p) => p !== socket.id);
    }

    io.to(socket.roomId).emit('attackResult', {
      attacker: socket.id,
      target: targetId,
      damage,
      hp: room.hp,
      turn: room.turn,
      winner
    });
  });

  // ---- 断线 ----
  socket.on('disconnect', () => {
    const room = rooms[socket.roomId];
    if (room) {
      io.to(socket.roomId).emit('opponentLeft');
      delete rooms[socket.roomId];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('服务器启动，端口 ' + PORT));
