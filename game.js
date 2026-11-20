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
const colorOptions = document.querySelectorAll('.color-option');
colorOptions.forEach(option => {
    option.addEventListener('click', () => {
        colorOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        selectedSnakeColor = option.getAttribute('data-color');
        updateUsernamePreview();
    });
});

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
        socket.emit('joinRoom', { roomName: room, playerName: finalName, color: selectedSnakeColor });

        localStorage.setItem('slither_username', finalName);
        localStorage.setItem('slither_color', selectedSnakeColor);
    });
}

socket.on('init', ({ id, players, foods, arena, isAdmin }) => {
    ARENA_WIDTH = arena.width;
    ARENA_HEIGHT = arena.height;
    gameState.isAdmin = isAdmin;
    if (isAdmin) adminControls.classList.remove('hidden');

    foods.forEach(f => gameState.foods.push(f));

    players.forEach(p => {
        const s = new Snake(p.id, p.x, p.y, p.id === id, p.color, p.name);
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
    gameState.snakes.set(p.id, s);
});

socket.on('playerUpdated', (p) => {
    const s = gameState.snakes.get(p.id);
    if (s) {
        // Interpolation or direct sync
        s.targetAngle = p.angle;
        s.isBoosting = p.isBoosting;
        // For simplicity, direct sync segments if needed, but here we just follow targetAngle
        if (Math.hypot(s.x - p.x, s.y - p.y) > 50) {
            s.x = p.x;
            s.y = p.y;
        }
    }
});

socket.on('playerRemoved', (id) => {
    gameState.snakes.delete(id);
});

socket.on('foodUpdate', ({ eatenId, newFood }) => {
    const index = gameState.foods.findIndex(f => f.id === eatenId);
    if (index !== -1) {
        gameState.foods[index] = newFood;
    }
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

// Position updates to server
setInterval(() => {
    if (gameState.isStarted && gameState.player) {
        socket.emit('updatePosition', {
            roomName: gameState.roomName,
            data: {
                x: gameState.player.x,
                y: gameState.player.y,
                angle: gameState.player.angle,
                isBoosting: gameState.player.isBoosting
            }
        });
    }
}, 50);

function checkCollisions() {
    if (gameState.isGameOver || !gameState.isStarted || !gameState.player) return;

    const head = gameState.player.segments[0];
    const currentRadius = gameState.player.baseRadius + Math.min(gameState.player.segments.length * 0.05, 6);

    // Wall collision
    const margin = 15;
    if (head.x <= margin || head.x >= ARENA_WIDTH - margin || head.y <= margin || head.y >= ARENA_HEIGHT - margin) {
        die();
    }

    // Other snakes collision
    for (const [id, snake] of gameState.snakes) {
        if (id === socket.id) continue;
        for (const seg of snake.segments) {
            const dist = Math.hypot(head.x - seg.x, head.y - seg.y);
            if (dist < currentRadius + 5) {
                die();
                return;
            }
        }
    }

    // Food collision
    for (let i = 0; i < gameState.foods.length; i++) {
        const food = gameState.foods[i];
        const dist = Math.hypot(head.x - food.x, head.y - food.y);
        if (dist < currentRadius + food.radius) {
            socket.emit('foodEaten', { roomName: gameState.roomName, foodId: food.id });
            const tail = gameState.player.segments[gameState.player.segments.length - 1];
            gameState.player.segments.push({ x: tail.x, y: tail.y });
            scoreEl.textContent = gameState.player.segments.length;
        }
    }
}

function die() {
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
        location.reload();
    });
}

// Input Handlers (kept from original)
window.addEventListener('mousemove', (e) => {
    if (!gameState.isStarted || !gameState.player) return;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    if (Math.hypot(dx, dy) > 10) {
        gameState.player.targetAngle = Math.atan2(dy, dx);
    }
});

// Joystick and Boost handlers (simplified for brevity but functional)
window.addEventListener('dblclick', () => {
    if (gameState.player) gameState.player.triggerBoost();
});

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

function updateLeaderboard() {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    const sorted = Array.from(gameState.snakes.values()).sort((a, b) => b.segments.length - a.segments.length);
    let html = '';
    for (let i = 0; i < Math.min(sorted.length, 5); i++) {
        const s = sorted[i];
        html += `<li class="${s.isPlayer ? 'player-row' : ''}"><span>${i + 1}. ${s.name}</span><span>${s.segments.length}</span></li>`;
    }
    listEl.innerHTML = html;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!gameState.player) return;
    ctx.save();
    ctx.translate(canvas.width / 2 - gameState.player.x, canvas.height / 2 - gameState.player.y);
    drawGrid();
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 12;
    ctx.strokeRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    for (const food of gameState.foods) {
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
