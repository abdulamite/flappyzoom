const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Buffer scaled to fill viewport (works on mobile + desktop)
const BW = 288;
const BH = 512;

function resizeCanvas() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.min(vw / BW, vh / BH);
  const w = Math.floor(BW * scale);
  const h = Math.floor(BH * scale);
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.imageSmoothingEnabled = false;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// Offscreen buffer
const buf = document.createElement("canvas");
buf.width = BW;
buf.height = BH;
const bctx = buf.getContext("2d");
bctx.imageSmoothingEnabled = false;

// ============ SOUND EFFECTS (Web Audio API) ============
let audioCtx;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playFlap() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.12);
}

function playScore() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(520, ctx.currentTime);
  osc.frequency.setValueAtTime(680, ctx.currentTime + 0.07);
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.18);
}

function playDeath() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.5);
}

function playSwoosh() {
  const ctx = getAudioCtx();
  const bufferSize = ctx.sampleRate * 0.15;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1200;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  src.start(ctx.currentTime);
}

// LegalZoom brand colors
const LZ_ORANGE = "#E8531E";
const LZ_DARK = "#C7421A";
const LZ_LIGHT = "#F47A3E";
const LZ_WHITE = "#FFFFFF";

// Game constants
const GRAVITY = 0.35;
const FLAP_POWER = -6.4;
const PIPE_WIDTH = 52;
const PIPE_GAP = 130;
const PIPE_SPEED = 1.6;
const PIPE_SPAWN_INTERVAL = 120;
const GROUND_HEIGHT = 56;
const GROUND_Y = BH - GROUND_HEIGHT;
const BIRD_SIZE = 32;

// Game state
let bird, pipes, score, bestScore, gameState, frameCount, groundScroll;
bestScore = 0;

// Cloud positions
const clouds = [];
for (let i = 0; i < 6; i++) {
  clouds.push({
    x: Math.random() * BW,
    y: 20 + Math.random() * 80,
    w: 30 + Math.random() * 40,
    h: 12 + Math.random() * 10,
    speed: 0.15 + Math.random() * 0.2,
  });
}

// Floating document particles
const docs = [];
for (let i = 0; i < 4; i++) {
  docs.push({
    x: Math.random() * BW,
    y: 120 + Math.random() * 200,
    speed: 0.1 + Math.random() * 0.15,
    wobble: Math.random() * Math.PI * 2,
  });
}

function resetGame() {
  bird = { x: 60, y: BH / 2 - 40, vy: 0, size: BIRD_SIZE };
  pipes = [];
  score = 0;
  frameCount = 0;
  groundScroll = 0;
  gameState = "ready";
}
resetGame();

// Input
function flap() {
  if (gameState === "ready") {
    gameState = "playing";
    bird.vy = FLAP_POWER;
    playFlap();
  } else if (gameState === "playing") {
    bird.vy = FLAP_POWER;
    playFlap();
  } else if (gameState === "dead") {
    playSwoosh();
    resetGame();
  }
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    flap();
  }
});
canvas.addEventListener("click", flap);
canvas.addEventListener("touchstart", (e) => { e.preventDefault(); flap(); }, { passive: false });
document.addEventListener("touchmove", (e) => { e.preventDefault(); }, { passive: false });

// Pipe management
function spawnPipe() {
  const minTop = 60;
  const maxTop = GROUND_Y - PIPE_GAP - 60;
  const topHeight = minTop + Math.floor(Math.random() * (maxTop - minTop));
  pipes.push({ x: BW, topHeight, scored: false });
}

// Collision
function checkCollision() {
  const cx = bird.x + bird.size / 2;
  const cy = bird.y + bird.size / 2;
  const r = bird.size / 2 - 2;

  if (bird.y + bird.size > GROUND_Y || bird.y < 0) return true;

  for (const pipe of pipes) {
    if (circleRectCollision(cx, cy, r, pipe.x, 0, PIPE_WIDTH, pipe.topHeight)) return true;
    const bottomY = pipe.topHeight + PIPE_GAP;
    if (circleRectCollision(cx, cy, r, pipe.x, bottomY, PIPE_WIDTH, GROUND_Y - bottomY)) return true;
  }
  return false;
}

function circleRectCollision(cx, cy, r, rx, ry, rw, rh) {
  const nearX = Math.max(rx, Math.min(cx, rx + rw));
  const nearY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy < r * r;
}

// ============ DRAWING ============

function pRect(x, y, w, h, color) {
  bctx.fillStyle = color;
  bctx.fillRect(Math.floor(x), Math.floor(y), w, h);
}

// Draw the LZ logo as the bird
function drawBird() {
  const bx = Math.floor(bird.x);
  const by = Math.floor(bird.y);
  const s = bird.size;

  const angle = Math.max(-0.5, Math.min(bird.vy * 0.06, 1.2));

  bctx.save();
  bctx.translate(bx + s / 2, by + s / 2);
  bctx.rotate(angle);

  // Orange rounded square background
  const r = 5;
  const hs = s / 2;
  bctx.beginPath();
  bctx.moveTo(-hs + r, -hs);
  bctx.lineTo(hs - r, -hs);
  bctx.quadraticCurveTo(hs, -hs, hs, -hs + r);
  bctx.lineTo(hs, hs - r);
  bctx.quadraticCurveTo(hs, hs, hs - r, hs);
  bctx.lineTo(-hs + r, hs);
  bctx.quadraticCurveTo(-hs, hs, -hs, hs - r);
  bctx.lineTo(-hs, -hs + r);
  bctx.quadraticCurveTo(-hs, -hs, -hs + r, -hs);
  bctx.closePath();

  // Orange fill with subtle gradient
  const grad = bctx.createLinearGradient(-hs, -hs, hs, hs);
  grad.addColorStop(0, LZ_LIGHT);
  grad.addColorStop(0.4, LZ_ORANGE);
  grad.addColorStop(1, LZ_DARK);
  bctx.fillStyle = grad;
  bctx.fill();

  // White "LZ" text - pixel art style
  // Scale factor for the letters inside the icon
  const p = s / 32; // pixel unit

  // Letter "L" - left side
  // Vertical stroke
  pRectRel(bctx, -12 * p, -10 * p, 4 * p, 16 * p, LZ_WHITE);
  // Horizontal stroke (bottom of L, angled)
  pRectRel(bctx, -12 * p, 4 * p, 10 * p, 4 * p, LZ_WHITE);
  // Slight angle on the L foot (stylized)
  pRectRel(bctx, -4 * p, 2 * p, 3 * p, 3 * p, LZ_WHITE);

  // Letter "Z" - right side
  // Top horizontal
  pRectRel(bctx, -1 * p, -10 * p, 14 * p, 4 * p, LZ_WHITE);
  // Diagonal (built from small blocks going top-right to bottom-left)
  for (let i = 0; i < 5; i++) {
    pRectRel(bctx, (9 - i * 3) * p, (-6 + i * 3) * p, 4 * p, 4 * p, LZ_WHITE);
  }
  // Bottom horizontal
  pRectRel(bctx, -1 * p, 6 * p, 14 * p, 4 * p, LZ_WHITE);

  bctx.restore();
}

// Helper: draw rect relative to current transform origin
function pRectRel(context, x, y, w, h, color) {
  context.fillStyle = color;
  context.fillRect(x, y, w, h);
}

// Pipes themed as legal gavels / dark wood + orange accents
function drawPipe(pipe) {
  const px = Math.floor(pipe.x);
  const capH = 12;
  const capOverhang = 4;

  drawPipeBody(px, 0, PIPE_WIDTH, pipe.topHeight - capH);
  drawPipeCap(px - capOverhang, pipe.topHeight - capH, PIPE_WIDTH + capOverhang * 2, capH);

  const bottomY = pipe.topHeight + PIPE_GAP;
  drawPipeCap(px - capOverhang, bottomY, PIPE_WIDTH + capOverhang * 2, capH);
  drawPipeBody(px, bottomY + capH, PIPE_WIDTH, GROUND_Y - bottomY - capH);
}

function drawPipeBody(x, y, w, h) {
  if (h <= 0) return;
  // Dark wood tones with orange accent
  pRect(x, y, 3, h, "#5C3A1E");
  pRect(x + 3, y, 4, h, "#D4803A");
  pRect(x + 7, y, w - 17, h, "#8B5E3C");
  pRect(x + 7, y, 3, h, "#B87840");
  pRect(x + w - 10, y, 7, h, "#6B4428");
  pRect(x + w - 3, y, 3, h, "#5C3A1E");
  // Orange accent stripe
  pRect(x + Math.floor(w / 2) - 1, y, 3, h, LZ_ORANGE);
}

function drawPipeCap(x, y, w, h) {
  pRect(x, y, w, h, "#5C3A1E");
  pRect(x + 2, y + 2, w - 4, h - 4, "#8B5E3C");
  pRect(x + 4, y + 2, 4, h - 4, "#D4803A");
  pRect(x + 8, y + 2, 3, h - 4, "#B87840");
  pRect(x + w - 7, y + 2, 4, h - 4, "#6B4428");
  // Orange top edge
  pRect(x + 2, y + 2, w - 4, 2, LZ_ORANGE);
}

// Background
function drawBackground() {
  // Sky gradient - warm tones
  const bands = [
    [0, 0.25, "#1a3a5c"],
    [0.25, 0.5, "#2a5a7c"],
    [0.5, 0.75, "#4a8aac"],
    [0.75, 1.0, "#7ab8d0"],
  ];
  for (const [start, end, color] of bands) {
    pRect(0, Math.floor(BH * start), BW, Math.floor(BH * (end - start)), color);
  }

  // Clouds
  for (const cloud of clouds) {
    drawCloud(cloud.x, cloud.y, cloud.w, cloud.h);
  }

  // Floating legal documents in background
  for (const doc of docs) {
    drawFloatingDoc(doc);
  }

  // City skyline silhouette (law offices)
  drawSkyline();
}

function drawCloud(x, y, w, h) {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  pRect(cx + w * 0.2, cy, w * 0.6, h, "rgba(255,255,255,0.6)");
  pRect(cx, cy + h * 0.3, w, h * 0.5, "rgba(255,255,255,0.6)");
  pRect(cx + w * 0.1, cy + h * 0.15, w * 0.8, h * 0.7, "rgba(255,255,255,0.6)");
}

function drawFloatingDoc(doc) {
  const dx = Math.floor(doc.x);
  const dy = Math.floor(doc.y + Math.sin(doc.wobble) * 3);
  // Little paper
  pRect(dx, dy, 8, 10, "rgba(255,255,255,0.15)");
  // Lines on paper
  pRect(dx + 1, dy + 2, 6, 1, "rgba(255,255,255,0.1)");
  pRect(dx + 1, dy + 4, 5, 1, "rgba(255,255,255,0.1)");
  pRect(dx + 1, dy + 6, 6, 1, "rgba(255,255,255,0.1)");
}

// Pre-generate skyline window states so they don't flicker
const skylineBuildings = [
  [0, 70], [20, 50], [38, 85], [60, 60], [78, 95],
  [100, 55], [118, 75], [140, 65], [158, 90], [180, 50],
  [198, 80], [220, 60], [240, 70], [260, 55], [278, 65],
];
const windowStates = {};
for (const [bx, bh] of skylineBuildings) {
  for (let wy = GROUND_Y - bh + 6; wy < GROUND_Y - 8; wy += 10) {
    for (let wx = bx + 3; wx < bx + 16; wx += 5) {
      windowStates[`${wx},${wy}`] = Math.random() > 0.3;
    }
  }
}

function drawSkyline() {
  const baseY = GROUND_Y;
  for (const [bx, bh] of skylineBuildings) {
    pRect(bx, baseY - bh, 18, bh, "#1a2a3a");
    for (let wy = baseY - bh + 6; wy < baseY - 8; wy += 10) {
      for (let wx = bx + 3; wx < bx + 16; wx += 5) {
        const lit = windowStates[`${wx},${wy}`];
        pRect(wx, wy, 3, 4, lit ? "#F4A030" : "#0a1a2a");
      }
    }
  }
}

// Scrolling ground - dark sophisticated
function drawGround() {
  const gx = Math.floor(groundScroll) % 48;

  // Dark marble-like ground
  pRect(0, GROUND_Y, BW, GROUND_HEIGHT, "#2a2a2a");
  // Orange accent line on top
  pRect(0, GROUND_Y, BW, 3, LZ_ORANGE);
  pRect(0, GROUND_Y + 3, BW, 1, LZ_DARK);

  // Subtle tile pattern
  for (let x = -gx; x < BW + 48; x += 48) {
    pRect(x, GROUND_Y + 8, 24, 2, "#333");
    pRect(x + 24, GROUND_Y + 16, 24, 2, "#333");
    pRect(x, GROUND_Y + 24, 24, 2, "#333");
    pRect(x + 24, GROUND_Y + 32, 24, 2, "#333");
  }

  // "LEGALZOOM" repeating text on ground
  bctx.fillStyle = "#444";
  bctx.font = "bold 6px monospace";
  bctx.textAlign = "left";
  for (let x = -Math.floor(gx * 2) % 120; x < BW + 120; x += 120) {
    bctx.fillText("LEGALZOOM", x, GROUND_Y + 48);
  }
}

// Score with pixel digits
const DIGIT_SPRITES = {
  0: [" ### ","#   #","#   #","#   #","#   #","#   #"," ### "],
  1: ["  #  "," ##  ","  #  ","  #  ","  #  ","  #  "," ### "],
  2: [" ### ","#   #","    #"," ### ","#    ","#    ","#####"],
  3: [" ### ","#   #","    #"," ### ","    #","#   #"," ### "],
  4: ["#   #","#   #","#   #","#####","    #","    #","    #"],
  5: ["#####","#    ","#    ","#### ","    #","#   #"," ### "],
  6: [" ### ","#    ","#    ","#### ","#   #","#   #"," ### "],
  7: ["#####","    #","   # ","  #  "," #   "," #   "," #   "],
  8: [" ### ","#   #","#   #"," ### ","#   #","#   #"," ### "],
  9: [" ### ","#   #","#   #"," ####","    #","    #"," ### "],
};

function drawPixelDigit(cx, cy, digit, scale) {
  const rows = DIGIT_SPRITES[digit];
  const s = scale || 2;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === "#") {
        pRect(cx + c * s - 1, cy + r * s, s, s, "#333");
        pRect(cx + c * s + 1, cy + r * s, s, s, "#333");
        pRect(cx + c * s, cy + r * s - 1, s, s, "#333");
        pRect(cx + c * s, cy + r * s + 1, s, s, "#333");
      }
    }
  }
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === "#") {
        pRect(cx + c * s, cy + r * s, s, s, "#fff");
      }
    }
  }
}

function drawScore() {
  const str = String(score);
  const digitW = 12;
  const totalW = str.length * digitW;
  const startX = Math.floor(BW / 2 - totalW / 2);
  for (let i = 0; i < str.length; i++) {
    drawPixelDigit(startX + i * digitW, 24, parseInt(str[i]), 2);
  }
}

// Game over panel - LegalZoom themed
function drawGameOver() {
  const pw = 200;
  const ph = 110;
  const px = Math.floor(BW / 2 - pw / 2);
  const py = Math.floor(BH / 2 - ph / 2 - 20);

  // Dark panel with orange border
  pRect(px - 2, py - 2, pw + 4, ph + 4, LZ_ORANGE);
  pRect(px, py, pw, ph, "#1a1a2a");
  pRect(px + 2, py + 2, pw - 4, ph - 4, "#222238");

  // Orange header bar
  pRect(px + 2, py + 2, pw - 4, 20, LZ_ORANGE);
  bctx.fillStyle = "#fff";
  bctx.font = "bold 10px monospace";
  bctx.textAlign = "center";
  bctx.fillText("CASE CLOSED", BW / 2, py + 15);

  // Score
  bctx.fillStyle = "#ccc";
  bctx.font = "bold 9px monospace";
  bctx.textAlign = "left";
  bctx.fillText("FILINGS", px + 16, py + 42);
  bctx.textAlign = "right";
  bctx.fillStyle = LZ_WHITE;
  bctx.fillText(String(score), px + pw - 16, py + 42);

  bctx.fillStyle = "#ccc";
  bctx.textAlign = "left";
  bctx.fillText("RECORD", px + 16, py + 60);
  bctx.textAlign = "right";
  bctx.fillStyle = LZ_WHITE;
  bctx.fillText(String(bestScore), px + pw - 16, py + 60);

  // Medal
  if (score >= 10) {
    const mx = px + 16;
    const my = py + 68;
    const medalColor = score >= 30 ? "#ffd700" : score >= 20 ? "#c0c0c0" : "#cd7f32";
    pRect(mx, my, 16, 16, medalColor);
    pRect(mx + 2, my + 2, 12, 12, "#fff8d0");
    pRect(mx + 4, my + 4, 8, 8, medalColor);
  }

  // Restart button
  const btnW = 120;
  const btnH = 16;
  const btnX = Math.floor(BW / 2 - btnW / 2);
  const btnY = py + ph - 24;
  pRect(btnX, btnY, btnW, btnH, LZ_ORANGE);
  pRect(btnX + 1, btnY + 1, btnW - 2, btnH - 2, LZ_LIGHT);
  pRect(btnX + 1, btnY + 1, btnW - 2, 1, "#ffa060");
  bctx.fillStyle = "#fff";
  bctx.font = "bold 8px monospace";
  bctx.textAlign = "center";
  bctx.fillText("FILE AGAIN", BW / 2, btnY + 11);

  // Bottom text
  bctx.fillStyle = "#888";
  bctx.font = "6px monospace";
  bctx.fillText("TAP TO RESTART", BW / 2, py + ph + 16);
}

// Ready screen
function drawReady() {
  // Title with orange LegalZoom branding
  bctx.fillStyle = "#000";
  bctx.font = "bold 18px monospace";
  bctx.textAlign = "center";
  bctx.fillText("FLAPPY", BW / 2 + 1, BH / 2 - 65 + 1);
  bctx.fillStyle = LZ_WHITE;
  bctx.fillText("FLAPPY", BW / 2, BH / 2 - 65);

  // "ZOOM" in orange
  bctx.fillStyle = "#000";
  bctx.fillText("ZOOM", BW / 2 + 1, BH / 2 - 43 + 1);
  bctx.fillStyle = LZ_ORANGE;
  bctx.fillText("ZOOM", BW / 2, BH / 2 - 43);

  // Tagline
  bctx.fillStyle = "#fff";
  bctx.font = "bold 7px monospace";
  bctx.fillText("NAVIGATE THE LEGAL SYSTEM", BW / 2, BH / 2 - 22);

  bctx.fillStyle = "#ddd";
  bctx.font = "bold 8px monospace";
  bctx.fillText("TAP OR PRESS SPACE", BW / 2, BH / 2);

  // Bouncing arrow
  const bounce = Math.floor(Math.sin(frameCount * 0.08) * 4);
  const ax = BW / 2;
  const ay = BH / 2 + 16 + bounce;
  pRect(ax - 2, ay, 5, 2, LZ_ORANGE);
  pRect(ax - 4, ay + 2, 9, 2, LZ_ORANGE);
  pRect(ax - 6, ay + 4, 13, 2, LZ_ORANGE);
}

// ============ GAME LOOP ============

function update() {
  frameCount++;

  for (const cloud of clouds) {
    cloud.x -= cloud.speed;
    if (cloud.x + cloud.w < 0) {
      cloud.x = BW + 10;
      cloud.y = 20 + Math.random() * 80;
    }
  }

  for (const doc of docs) {
    doc.x -= doc.speed;
    doc.wobble += 0.02;
    if (doc.x < -10) {
      doc.x = BW + 10;
      doc.y = 120 + Math.random() * 200;
    }
  }

  if (gameState !== "dead") {
    groundScroll += PIPE_SPEED;
  }

  if (gameState === "ready") {
    bird.y = BH / 2 - 40 + Math.sin(frameCount * 0.08) * 8;
    return;
  }

  if (gameState !== "playing") return;

  bird.vy += GRAVITY;
  bird.y += bird.vy;

  if (frameCount % PIPE_SPAWN_INTERVAL === 0) {
    spawnPipe();
  }

  for (const pipe of pipes) {
    pipe.x -= PIPE_SPEED;
    if (!pipe.scored && pipe.x + PIPE_WIDTH < bird.x) {
      pipe.scored = true;
      score++;
      playScore();
    }
  }
  pipes = pipes.filter((p) => p.x + PIPE_WIDTH > -10);

  if (checkCollision()) {
    gameState = "dead";
    playDeath();
    if (score > bestScore) bestScore = score;
  }
}

function draw() {
  bctx.clearRect(0, 0, BW, BH);

  drawBackground();

  for (const pipe of pipes) {
    drawPipe(pipe);
  }

  drawGround();
  drawBird();
  drawScore();

  if (gameState === "ready") {
    drawReady();
  } else if (gameState === "dead") {
    drawGameOver();
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(buf, 0, 0, BW, BH, 0, 0, canvas.width, canvas.height);
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
