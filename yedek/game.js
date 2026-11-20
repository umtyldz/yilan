const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const gameState = {
    player: {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        angle: 0,
        targetAngle: 0,
        speed: 3.5,
        radius: 16,
        segments: [],
        maxSegments: 50,
        segmentSpacing: 10
    },
    input: {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
    },
    score: 15
};

// Initialize snake segments
for (let i = 0; i < gameState.player.maxSegments; i++) {
    gameState.player.segments.push({
        x: gameState.player.x - i * gameState.player.segmentSpacing,
        y: gameState.player.y
    });
}

function handlePointerMove(clientX, clientY) {
    gameState.input.x = clientX;
    gameState.input.y = clientY;
}

window.addEventListener('mousemove', (e) => {
    handlePointerMove(e.clientX, e.clientY);
});

window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
}, { passive: false });

window.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
}, { passive: false });

function update() {
    const p = gameState.player;
    
    // Calculate target angle based on input position relative to head
    const dx = gameState.input.x - p.x;
    const dy = gameState.input.y - p.y;
    
    // Only update target angle if pointer is far enough from head to avoid jitter
    if (Math.hypot(dx, dy) > 5) {
        p.targetAngle = Math.atan2(dy, dx);
    }
    
    // Smooth angle interpolation (shortest path rotation)
    let angleDiff = p.targetAngle - p.angle;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    p.angle += angleDiff * 0.12;

    // Move head forward
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;

    // Screen boundaries wrap-around or bounce (let's wrap around for endless feel)
    const margin = 50;
    if (p.x < -margin) p.x = canvas.width + margin;
    if (p.x > canvas.width + margin) p.x = -margin;
    if (p.y < -margin) p.y = canvas.height + margin;
    if (p.y > canvas.height + margin) p.y = -margin;

    // Update body segments (follow the leader)
    p.segments[0].x = p.x;
    p.segments[0].y = p.y;

    for (let i = 1; i < p.segments.length; i++) {
        const leader = p.segments[i - 1];
        const follower = p.segments[i];
        
        const fdx = leader.x - follower.x;
        const fdy = leader.y - follower.y;
        const dist = Math.hypot(fdx, fdy);
        
        if (dist > p.segmentSpacing) {
            const angle = Math.atan2(fdy, fdx);
            follower.x = leader.x - Math.cos(angle) * p.segmentSpacing;
            follower.y = leader.y - Math.sin(angle) * p.segmentSpacing;
        }
    }

    gameState.score = p.segments.length;
    scoreEl.textContent = gameState.score;
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    
    const offsetX = (canvas.width / 2 - gameState.player.x) % gridSize;
    const offsetY = (canvas.height / 2 - gameState.player.y) % gridSize;

    ctx.beginPath();
    for (let x = offsetX; x < canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    for (let y = offsetY; y < canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    drawGrid();

    const p = gameState.player;

    // Draw glowing body segments (from tail to head)
    for (let i = p.segments.length - 1; i >= 0; i--) {
        const seg = p.segments[i];
        const ratio = 1 - (i / p.segments.length);
        const radius = p.radius * (0.6 + 0.4 * ratio);

        ctx.save();
        ctx.beginPath();
        ctx.arc(seg.x, seg.y, radius, 0, Math.PI * 2);
        
        // Glow effect
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ffcc';
        ctx.fillStyle = i === 0 ? '#00ffcc' : `rgba(0, 255, 204, ${0.4 + 0.6 * ratio})`;
        ctx.fill();
        ctx.restore();
    }

    // Draw head eyes or details
    const head = p.segments[0];
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(p.angle);

    // Eyes
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
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();
