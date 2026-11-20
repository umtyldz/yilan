const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const playerNameDisplay = document.getElementById('player-name-display');
const roomInput = document.getElementById('room-input');
const adminControls = document.getElementById('admin-controls');
const closeRoomBtn = document.getElementById('close-room-btn');

const socket = io();

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

let ARENA_WIDTH = 5000;
let ARENA_HEIGHT = 5000;

const foodColors = ['#ff3366', '#33ff66', '#3366ff', '#ffff33', '#ff33ff', '#33ffff', '#ff9933'];

// Pool settings for username (kept from original)
const adjectivesPool = ["Güçlü", "Şirin", "Çılgın", "Hızlı", "Dev", "Minik", "Korkusuz", "Tatlı", "Akıllı", "Sevimli", "Deli", "Süper", "Mega", "Kral", "Şahane", "Fırtına", "Büyülü", "Gizemli", "Asi", "Mutlu", "Öfkeli", "Yetenekli", "Cesur", "Dahice", "Efsane", "Yıldızlı", "Kurnaz", "Çevik", "Karizmatik", "Zeki", "Dinamik", "Parlak", "Korkunç", "Mükemmel", "Şanslı", "Becerikli", "Zırhlı", "Uçan", "Kusursuz", "Eğlenceli"];
const nounsPool = ["Piton", "Ejder", "Ninja", "Samuray", "Kedi", "Köpek", "Penguen", "Kaplumbağa", "Maymun", "Ejderha", "Kartal", "Aslan", "Tilki", "Ayı", "Kurt", "Şahin", "Panda", "Timsah", "Köpekbalığı", "Kobra", "Anka", "Karakurt", "Gölge", "Şimşek", "Ateş", "Buz", "Demir", "Çelik", "Robot", "Uzaylı", "Hayalet", "Zombi", "Vampir", "Korsan", "Büyücü", "Şövalye", "Gladyatör", "Titan", "Cüce", "Panter"];
const usernamePools = [adjectivesPool, nounsPool];

function getRandomWordFromPool(poolIndex) {
    const pool = usernamePools[poolIndex];
    return pool[Math.floor(Math.random() * pool.length)];
}

const wordInputs = [document.getElementById('word-input-1'), document.getElementById('word-input-2')];
const usernamePreview = document.getElementById('username-preview');

function updateUsernamePreview() {
    if (usernamePreview) {
        const w1 = wordInputs[0] ? wordInputs[0].value : '';
        const w2 = wordInputs[1] ? wordInputs[1].value : '';
        usernamePreview.textContent = `${w1} ${w2}`;
        usernamePreview.style.color = selectedSnakeColor;
        usernamePreview.style.textShadow = `0 0 12px ${selectedSnakeColor}88`;
    }
}

function initUsernameInputs() {
    wordInputs.forEach((input, index) => {
        if (input) {
            input.value = getRandomWordFromPool(index);
            input.addEventListener('click', () => {
                input.value = getRandomWordFromPool(index);
                updateUsernamePreview();
            });
            input.addEventListener('input', () => updateUsernamePreview());
        }
    });
    updateUsernamePreview();
}

let selectedSnakeColor = '#00ffcc';
const startScreenEl = document.getElementById('start-screen');

function updateStartScreenBackground(hex) {
    if (!startScreenEl) return;
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!match) return;
    const r = Math.round(parseInt(match[1], 16) * 0.2);
    const g = Math.round(parseInt(match[2], 16) * 0.2);
    const b = Math.round(parseInt(match[3], 16) * 0.2);
    startScreenEl.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.94)`;
}

const colorOptions = document.querySelectorAll('.color-option');
colorOptions.forEach(option => {
    option.addEventListener('click', () => {
        colorOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        selectedSnakeColor = option.getAttribute('data-color');
        updateUsernamePreview();
        updateStartScreenBackground(selectedSnakeColor);
    });
});

updateStartScreenBackground(selectedSnakeColor);
initUsernameInputs();

class Snake {
    constructor(id, x, y, isPlayer = false, color = '#00ffcc', name = 'Yılan') {
        this.id = id;
        this.x = x;
        this.y = y;
        this.angle = 0;
        this.targetAngle = 0;
        this.speed = 3.5;
        this.boostSpeed = 6.5;
        this.baseRadius = 14;
        this.segments = [];
        this.segmentSpacing = 10;
        this.isBoosting = false;
        this.isPlayer = isPlayer;
        this.color = color;
        this.name = name;
        this.boostFrameCount = 0;
        this.boostTimer = 0;
        this.boostCooldown = 0;

        const initialLength = 15;
        for (let i = 0; i < initialLength; i++) {
            this.segments.push({ x: this.x - i * this.segmentSpacing, y: this.y });
        }
    }

    setLength(n) {
        n = Math.max(1, Math.min(Math.floor(n) || 1, 2000));
        while (this.segments.length < n) {
            const t = this.segments[this.segments.length - 1];
            this.segments.push({ x: t.x, y: t.y });
        }
        while (this.segments.length > n) this.segments.pop();
    }

    triggerBoost() {
        if (!this.isBoosting && this.boostCooldown <= 0 && this.segments.length > 15) {
            this.isBoosting = true;
            this.boostTimer = 120;
        }
    }

    update(arenaWidth, arenaHeight) {
        if (this.isPlayer) {
            if (this.isBoosting) {
                this.boostTimer--;
                if (this.boostTimer <= 0 || this.segments.length <= 15) {
                    this.isBoosting = false;
                    this.boostCooldown = 90;
                }
            } else if (this.boostCooldown > 0) {
                this.boostCooldown--;
            }
        }

        const isCurrentlyBoosting = this.isBoosting && this.segments.length > 15;
        const currentSpeed = isCurrentlyBoosting ? this.boostSpeed : this.speed;

        if (isCurrentlyBoosting && this.isPlayer) {
            this.boostFrameCount++;
            if (this.boostFrameCount >= 10) {
                this.boostFrameCount = 0;
                this.segments.pop();
                scoreEl.textContent = this.segments.length;
            }
        }

        const lengthFactor = this.segments.length;
        const turnSpeed = Math.max(0.015, 0.08 - (lengthFactor * 0.001));

        let angleDiff = this.targetAngle - this.angle;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        this.angle += angleDiff * turnSpeed;

        this.x += Math.cos(this.angle) * currentSpeed;
        this.y += Math.sin(this.angle) * currentSpeed;

        const margin = 20;
        this.x = Math.max(margin, Math.min(arenaWidth - margin, this.x));
        this.y = Math.max(margin, Math.min(arenaHeight - margin, this.y));

        this.segments[0].x = this.x;
        this.segments[0].y = this.y;

        for (let i = 1; i < this.segments.length; i++) {
            const leader = this.segments[i - 1];
            const follower = this.segments[i];
            const fdx = leader.x - follower.x;
            const fdy = leader.y - follower.y;
            const dist = Math.hypot(fdx, fdy);
            if (dist > this.segmentSpacing) {
                const angle = Math.atan2(fdy, fdx);
                follower.x = leader.x - Math.cos(angle) * this.segmentSpacing;
                follower.y = leader.y - Math.sin(angle) * this.segmentSpacing;
            }
        }
    }

    draw(ctx) {
        const currentRadius = this.baseRadius + Math.min(this.segments.length * 0.05, 6);
        for (let i = this.segments.length - 1; i >= 0; i--) {
            const seg = this.segments[i];
            if (seg.x < view.l || seg.x > view.r || seg.y < view.t || seg.y > view.b) continue;
            const ratio = 1 - (i / this.segments.length);
            const radius = currentRadius * (0.6 + 0.4 * ratio);
            ctx.save();
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, radius, 0, Math.PI * 2);
            ctx.shadowBlur = 15;
            ctx.shadowColor = this.color;
            ctx.fillStyle = i === 0 ? this.color : `rgba(${this.hexToRgb(this.color)}, ${0.4 + 0.6 * ratio})`;
            ctx.fill();
            ctx.restore();
        }

        const head = this.segments[0];
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(6, -6, 4, 0, Math.PI * 2);
        ctx.arc(6, 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(7, -6, 1.5, 0, Math.PI * 2);
        ctx.arc(7, 6, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.font = 'bold 12px Segoe UI';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#000000';
        ctx.fillText(this.name, head.x, head.y - currentRadius - 8);
        ctx.restore();
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 255, 204';
    }
}

const view = { l: 0, t: 0, r: 0, b: 0 };

const gameState = {
    isStarted: false,
    snakes: new Map(),
    player: null,
    isGameOver: false,
    roomName: '',
    isAdmin: false,
    input: {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        isActive: false,
        joystick: { active: false, identifier: null, startX: 0, startY: 0, currentX: 0, currentY: 0 }
    },
    foods: []
};

// Start Game
let joinInfo = null;
function joinGame() {
    if (joinInfo) socket.emit('joinRoom', joinInfo);
}

const startBtn = document.getElementById('start-btn');
if (startBtn) {
    startBtn.addEventListener('click', () => {
        const room = roomInput.value.trim();
        if (!room) {
            alert('Lütfen bir oda adı girin!');
            return;
        }

        const w1 = wordInputs[0].value.trim() || "Koca";
        const w2 = wordInputs[1].value.trim() || "Mavi";
        const finalName = `${w1} ${w2}`;

        gameState.roomName = room;
        joinInfo = { roomName: room, playerName: finalName, color: selectedSnakeColor };
        joinGame();

        localStorage.setItem('slither_username', finalName);
        localStorage.setItem('slither_color', selectedSnakeColor);
    });
}

socket.on('init', ({ id, players, foods, arena, isAdmin }) => {
    ARENA_WIDTH = arena.width;
    ARENA_HEIGHT = arena.height;
    // Temiz başlangıç (yeniden oynama / yeniden bağlanma için)
    gameState.snakes.clear();
    gameState.player = null;
    gameState.isGameOver = false;
    gameState.spawnProtectUntil = Date.now() + 2500;
    const goScreen = document.getElementById('game-over-screen');
    if (goScreen) goScreen.classList.add('hidden');
    gameState.isAdmin = isAdmin;
    adminControls.classList.toggle('hidden', !isAdmin);

    gameState.foods = foods.slice();

    players.forEach(p => {
        const s = new Snake(p.id, p.x, p.y, p.id === id, p.color, p.name);
        s.setLength(p.length || 15);
        s.angle = s.targetAngle = p.angle || 0;
        gameState.snakes.set(p.id, s);
        if (p.id === id) {
            gameState.player = s;
            playerNameDisplay.textContent = s.name;
            scoreEl.textContent = s.segments.length;
        }
    });

    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.style.display = 'none';
    gameState.isStarted = true;
});

socket.on('playerJoined', (p) => {
    const s = new Snake(p.id, p.x, p.y, false, p.color, p.name);
    s.setLength(p.length || 15);
    gameState.snakes.set(p.id, s);
});

socket.on('playerUpdated', (p) => {
    const s = gameState.snakes.get(p.id);
    if (s) {
        // Interpolation or direct sync
        s.targetAngle = p.angle;
        s.isBoosting = p.isBoosting;
        s.setLength(p.length || s.segments.length);
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d > 150) {
            s.x = p.x;
            s.y = p.y;
            s.segments.forEach(seg => { seg.x = p.x; seg.y = p.y; });
        } else if (d > 2) {
            s.x += (p.x - s.x) * 0.2;
            s.y += (p.y - s.y) * 0.2;
        }
    }
});

socket.on('playerRemoved', (id) => {
    gameState.snakes.delete(id);
});

socket.on('foodUpdate', ({ eatenId, newFood }) => {
    const index = gameState.foods.findIndex(f => f.id === eatenId);
    if (index !== -1) gameState.foods.splice(index, 1);
    gameState.foods.push(newFood);
});

socket.on('makeAdmin', () => {
    gameState.isAdmin = true;
    adminControls.classList.remove('hidden');
});

socket.on('roomClosed', () => {
    alert('Oda admin tarafından kapatıldı.');
    location.reload();
});

closeRoomBtn.addEventListener('click', () => {
    if (gameState.isAdmin) {
        socket.emit('closeRoom', gameState.roomName);
    }
});

// Bağlantı koptuysa (ör. Render uyku/yeniden başlatma) otomatik yeniden katıl
socket.on('connect', () => {
    if (gameState.isStarted && !gameState.isGameOver) joinGame();
});

// Position updates to server
setInterval(() => {
    if (gameState.isStarted && gameState.player) {
        socket.emit('updatePosition', {
            roomName: gameState.roomName,
            data: {
                x: gameState.player.x,
                y: gameState.player.y,
                angle: gameState.player.angle,
                isBoosting: gameState.player.isBoosting,
                length: gameState.player.segments.length
            }
        });
    }
}, 50);

function checkCollisions() {
    if (gameState.isGameOver || !gameState.isStarted || !gameState.player) return;

    const head = gameState.player.segments[0];
    const currentRadius = gameState.player.baseRadius + Math.min(gameState.player.segments.length * 0.05, 6);

    // Wall collision
    // (Yılan kenardan en fazla 20px içeri girebildiği için eşik 20 olmalı)
    const margin = 20;
    if (head.x <= margin || head.x >= ARENA_WIDTH - margin || head.y <= margin || head.y >= ARENA_HEIGHT - margin) {
        die();
        return;
    }

    // Other snakes collision (doğma sonrası kısa koruma süresi var)
    const protectedNow = Date.now() < (gameState.spawnProtectUntil || 0);
    for (const [id, snake] of gameState.snakes) {
        if (id === socket.id || protectedNow) continue;
        for (const seg of snake.segments) {
            const dist = Math.hypot(head.x - seg.x, head.y - seg.y);
            if (dist < currentRadius + 5) {
                die();
                return;
            }
        }
    }

    // Food collision
    for (let i = gameState.foods.length - 1; i >= 0; i--) {
        const food = gameState.foods[i];
        const dist = Math.hypot(head.x - food.x, head.y - food.y);
        if (dist < currentRadius + food.radius) {
            gameState.foods.splice(i, 1); // hemen kaldır: aynı yem tekrar sayılmasın
            socket.emit('foodEaten', { roomName: gameState.roomName, foodId: food.id });
            const tail = gameState.player.segments[gameState.player.segments.length - 1];
            gameState.player.segments.push({ x: tail.x, y: tail.y });
            scoreEl.textContent = gameState.player.segments.length;
        }
    }
}

function die() {
    if (gameState.isGameOver) return;
    gameState.isGameOver = true;
    socket.emit('playerDied', { roomName: gameState.roomName });
    const finalScoreEl = document.getElementById('final-score');
    if (finalScoreEl) finalScoreEl.textContent = gameState.player.segments.length;
    const gameOverScreen = document.getElementById('game-over-screen');
    if (gameOverScreen) gameOverScreen.classList.remove('hidden');
}

const restartBtn = document.getElementById('restart-btn');
if (restartBtn) {
    restartBtn.addEventListener('click', () => {
        joinGame(); // sayfayı yenilemeden aynı odaya tekrar katıl
    });
}

// Input Handlers
function handleInput(clientX, clientY) {
    if (!gameState.isStarted || !gameState.player || gameState.isGameOver) return;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    if (Math.hypot(dx, dy) > 10) {
        gameState.player.targetAngle = Math.atan2(dy, dx);
    }
}

window.addEventListener('mousemove', (e) => {
    handleInput(e.clientX, e.clientY);
});

// Mobile Touch & Joystick (çift dokunma = boost)
let lastTouchTime = 0;
window.addEventListener('touchstart', (e) => {
    if (!gameState.isStarted || gameState.isGameOver) return;
    const now = Date.now();
    if (now - lastTouchTime < 300 && gameState.player) gameState.player.triggerBoost();
    lastTouchTime = now;
    const touch = e.touches[0];
    gameState.input.joystick.active = true;
    gameState.input.joystick.startX = touch.clientX;
    gameState.input.joystick.startY = touch.clientY;
    gameState.input.joystick.currentX = touch.clientX;
    gameState.input.joystick.currentY = touch.clientY;
    handleInput(touch.clientX, touch.clientY);
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if (!gameState.isStarted || gameState.isGameOver || !gameState.player) return;
    e.preventDefault(); // Stop mobile scroll
    const touch = e.touches[0];
    if (gameState.input.joystick.active) {
        gameState.input.joystick.currentX = touch.clientX;
        gameState.input.joystick.currentY = touch.clientY;
        
        const dx = touch.clientX - gameState.input.joystick.startX;
        const dy = touch.clientY - gameState.input.joystick.startY;
        if (Math.hypot(dx, dy) > 5) {
            gameState.player.targetAngle = Math.atan2(dy, dx);
        }
    }
}, { passive: false });

window.addEventListener('touchend', () => {
    gameState.input.joystick.active = false;
});


function drawJoystick() {
    const j = gameState.input.joystick;
    if (!j.active) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(j.startX, j.startY, 50, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 255, 204, 0.1)';
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    const dx = j.currentX - j.startX;
    const dy = j.currentY - j.startY;
    const dist = Math.min(Math.hypot(dx, dy), 50);
    const angle = Math.atan2(dy, dx);

    ctx.beginPath();
    ctx.arc(j.startX + Math.cos(angle) * dist, j.startY + Math.sin(angle) * dist, 25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 255, 204, 0.4)';
    ctx.fill();
    ctx.restore();
}

function update() {
    if (!gameState.isStarted || gameState.isGameOver) return;
    for (const [id, snake] of gameState.snakes) {
        snake.update(ARENA_WIDTH, ARENA_HEIGHT);
    }
    checkCollisions();
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    ctx.beginPath();
    for (let x = 0; x <= ARENA_WIDTH; x += gridSize) {
        ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_HEIGHT);
    }
    for (let y = 0; y <= ARENA_HEIGHT; y += gridSize) {
        ctx.moveTo(0, y); ctx.lineTo(ARENA_WIDTH, y);
    }
    ctx.stroke();
}

function drawMiniMap() {
    const mapSize = 140;
    const mapX = canvas.width - mapSize - 20;
    const mapY = 20;
    ctx.save();
    ctx.beginPath();
    ctx.rect(mapX, mapY, mapSize, mapSize);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fill();
    const scale = mapSize / ARENA_WIDTH;
    for (const food of gameState.foods) {
        ctx.fillStyle = food.color;
        ctx.fillRect(mapX + food.x * scale, mapY + food.y * scale, 1.5, 1.5);
    }
    for (const [id, snake] of gameState.snakes) {
        const head = snake.segments[0];
        ctx.beginPath();
        ctx.arc(mapX + head.x * scale, mapY + head.y * scale, snake.isPlayer ? 3 : 2, 0, Math.PI * 2);
        ctx.fillStyle = snake.color;
        ctx.fill();
    }
    ctx.restore();
}

let lastLeaderboardUpdate = 0;
function updateLeaderboard() {
    const now = performance.now();
    if (now - lastLeaderboardUpdate < 300) return;
    lastLeaderboardUpdate = now;
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    const sorted = Array.from(gameState.snakes.values()).sort((a, b) => b.segments.length - a.segments.length);
    listEl.textContent = '';
    for (let i = 0; i < Math.min(sorted.length, 5); i++) {
        const sn = sorted[i];
        const li = document.createElement('li');
        if (sn.isPlayer) li.className = 'player-row';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${i + 1}. ${sn.name}`;
        const scoreSpan = document.createElement('span');
        scoreSpan.textContent = sn.segments.length;
        li.appendChild(nameSpan);
        li.appendChild(scoreSpan);
        listEl.appendChild(li);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!gameState.player) return;
    view.l = gameState.player.x - canvas.width / 2 - 60;
    view.r = gameState.player.x + canvas.width / 2 + 60;
    view.t = gameState.player.y - canvas.height / 2 - 60;
    view.b = gameState.player.y + canvas.height / 2 + 60;
    ctx.save();
    ctx.translate(canvas.width / 2 - gameState.player.x, canvas.height / 2 - gameState.player.y);
    drawGrid();
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 12;
    ctx.strokeRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    for (const food of gameState.foods) {
        if (food.x < view.l || food.x > view.r || food.y < view.t || food.y > view.b) continue;
        ctx.beginPath();
        ctx.arc(food.x, food.y, food.radius, 0, Math.PI * 2);
        ctx.fillStyle = food.color;
        ctx.fill();
    }
    for (const [id, snake] of gameState.snakes) {
        snake.draw(ctx);
    }
    ctx.restore();
    if (gameState.isStarted) {
        drawJoystick();
        drawMiniMap();
        updateLeaderboard();
    }
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}
loop();
