import { Enemy, MysteryBlock, Particle, LookaheadSensors, MacroAction, MacroActionOption, MarioState } from "./types";
import { retroAudio } from "./audio";

export const TILE_SIZE = 16;
export const CANVAS_WIDTH = 512;
export const CANVAS_HEIGHT = 288;
export const GRAVITY = 0.42;
export const MAX_RUN_SPEED = 4.2;
export const ACCELERATION = 0.28;
export const FRICTION = 0.88;
export const JUMP_IMPULSE = -9.2;
export const SHORT_JUMP_IMPULSE = -6.8;

export class MarioGameEngine {
  // Mario Entity
  public x: number = 40;
  public y: number = 180;
  public vx: number = 0;
  public vy: number = 0;
  public width: number = 14;
  public height: number = 20;
  public isGrounded: boolean = false;
  public facingRight: boolean = true;
  public isDead: boolean = false;
  public isVictory: boolean = false;

  // Game Stats
  public score: number = 0;
  public coins: number = 0;
  public distanceMax: number = 0;
  public currentTick: number = 0;
  public flagPoleX: number = 2400;

  // Level Geometry
  public levelWidthTiles: number = 180; // ~2880 px
  public groundHeights: number[] = []; // Y index of ground for each X column
  public pipes: { x: number; height: number; width: number }[] = [];
  public blocks: MysteryBlock[] = [];
  public bricks: { x: number; y: number }[] = [];
  public pits: { start: number; end: number }[] = [];
  public enemies: Enemy[] = [];
  public particles: Particle[] = [];

  // Macro Action State
  public activeMacro: MacroAction = "SPRINT_RIGHT";
  public macroFramesRemaining: number = 0;

  constructor(seed: number = 42) {
    this.buildLevel(seed);
  }

  public reset(seed: number = 42) {
    this.x = 40;
    this.y = 180;
    this.vx = 0;
    this.vy = 0;
    this.isGrounded = false;
    this.facingRight = true;
    this.isDead = false;
    this.isVictory = false;
    this.score = 0;
    this.coins = 0;
    this.distanceMax = 0;
    this.currentTick = 0;
    this.particles = [];
    this.macroFramesRemaining = 0;
    this.buildLevel(seed);
  }

  private buildLevel(seed: number) {
    this.groundHeights = new Array(this.levelWidthTiles).fill(13); // Default ground at tile 13 (Y=208)
    this.pipes = [];
    this.blocks = [];
    this.bricks = [];
    this.pits = [];
    this.enemies = [];

    // Pits (chasms)
    this.pits = [
      { start: 68 * TILE_SIZE, end: 71 * TILE_SIZE },
      { start: 86 * TILE_SIZE, end: 89 * TILE_SIZE },
      { start: 135 * TILE_SIZE, end: 138 * TILE_SIZE },
    ];
    for (const pit of this.pits) {
      const sIdx = Math.floor(pit.start / TILE_SIZE);
      const eIdx = Math.floor(pit.end / TILE_SIZE);
      for (let i = sIdx; i <= eIdx; i++) {
        if (i < this.levelWidthTiles) this.groundHeights[i] = 999; // Abyss
      }
    }

    // Classic Pipes
    this.pipes = [
      { x: 28 * TILE_SIZE, height: 2, width: 2 * TILE_SIZE },
      { x: 38 * TILE_SIZE, height: 3, width: 2 * TILE_SIZE },
      { x: 46 * TILE_SIZE, height: 4, width: 2 * TILE_SIZE },
      { x: 57 * TILE_SIZE, height: 4, width: 2 * TILE_SIZE },
      { x: 104 * TILE_SIZE, height: 2, width: 2 * TILE_SIZE },
      { x: 118 * TILE_SIZE, height: 3, width: 2 * TILE_SIZE },
    ];

    // Mystery blocks & bricks
    const blockPositions = [
      { x: 16, y: 9, hasCoin: true },
      { x: 20, y: 9, hasCoin: true },
      { x: 22, y: 5, hasCoin: true },
      { x: 24, y: 9, hasCoin: true },
      { x: 77, y: 9, hasCoin: true },
      { x: 94, y: 9, hasCoin: true },
      { x: 109, y: 5, hasCoin: true },
    ];
    this.blocks = blockPositions.map(b => ({
      x: b.x * TILE_SIZE,
      y: b.y * TILE_SIZE,
      hasCoin: b.hasCoin,
      isHit: false,
      bumpOffset: 0,
    }));

    // Goomba Enemies
    const enemyXList = [22, 41, 52, 54, 80, 82, 98, 112, 126];
    this.enemies = enemyXList.map((tx, idx) => ({
      id: idx + 1,
      x: tx * TILE_SIZE,
      y: 192,
      vx: -0.9,
      vy: 0,
      width: 14,
      height: 14,
      isAlive: true,
      type: "goomba",
      deathTimer: 0,
    }));

    this.flagPoleX = 150 * TILE_SIZE; // 2400 px
  }

  public setMacroAction(action: MacroAction, durationFrames: number = 30) {
    this.activeMacro = action;
    this.macroFramesRemaining = durationFrames;
  }

  public step() {
    if (this.isDead || this.isVictory) return;
    this.currentTick++;

    // Apply Macro Action input controls
    if (this.macroFramesRemaining > 0) {
      this.applyMacroPhysics(this.activeMacro);
      this.macroFramesRemaining--;
    } else {
      // Natural deceleration if no macro active
      this.vx *= FRICTION;
    }

    // Apply gravity
    this.vy += GRAVITY;
    if (this.vy > 9.0) this.vy = 9.0;

    // Move horizontally & resolve tile collision
    this.x += this.vx;
    if (this.vx > 0) this.facingRight = true;
    else if (this.vx < 0) this.facingRight = false;
    this.resolveHorizontalCollisions();

    // Move vertically & resolve tile collision
    this.y += this.vy;
    this.resolveVerticalCollisions();

    // Check Fall in Abyss
    if (this.y > CANVAS_HEIGHT + 30) {
      this.die("Fell into abyss pit chasm");
      return;
    }

    // Update distance record
    if (this.x > this.distanceMax) {
      this.distanceMax = Math.floor(this.x);
    }

    // Check Flagpole Victory
    if (this.x >= this.flagPoleX) {
      this.isVictory = true;
      this.score += 5000;
      retroAudio.playVictory();
    }

    // Update Enemies
    this.updateEnemies();

    // Update Mystery Block Bump animations
    for (const b of this.blocks) {
      if (b.bumpOffset > 0) {
        b.bumpOffset = Math.max(0, b.bumpOffset - 1);
      }
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }
  }

  private applyMacroPhysics(action: MacroAction) {
    switch (action) {
      case "SPRINT_RIGHT":
        this.vx += ACCELERATION * 1.5;
        if (this.vx > MAX_RUN_SPEED) this.vx = MAX_RUN_SPEED;
        break;

      case "FULL_JUMP_RIGHT":
        this.vx += ACCELERATION * 1.3;
        if (this.vx > MAX_RUN_SPEED) this.vx = MAX_RUN_SPEED;
        if (this.isGrounded) {
          this.vy = JUMP_IMPULSE;
          this.isGrounded = false;
          retroAudio.playJump();
        }
        break;

      case "SHORT_HOP_RIGHT":
        this.vx += ACCELERATION;
        if (this.vx > MAX_RUN_SPEED * 0.75) this.vx = MAX_RUN_SPEED * 0.75;
        if (this.isGrounded) {
          this.vy = SHORT_JUMP_IMPULSE;
          this.isGrounded = false;
          retroAudio.playJump();
        }
        break;

      case "HIGH_VERTICAL_JUMP":
        this.vx *= 0.5; // Little horizontal momentum
        if (this.isGrounded) {
          this.vy = JUMP_IMPULSE * 1.05;
          this.isGrounded = false;
          retroAudio.playJump();
        }
        break;

      case "SKID_STOP":
        this.vx *= 0.7; // Hard braking
        if (Math.abs(this.vx) < 0.2) this.vx = 0;
        break;

      case "WAIT_OBSERVE":
        this.vx *= 0.85;
        break;
    }
  }

  private resolveHorizontalCollisions() {
    // Pipe collision
    for (const p of this.pipes) {
      const pipeTop = CANVAS_HEIGHT - p.height * TILE_SIZE - 48;
      if (
        this.x + this.width > p.x &&
        this.x < p.x + p.width &&
        this.y + this.height > pipeTop
      ) {
        if (this.vx > 0) {
          this.x = p.x - this.width;
          this.vx = 0;
        } else if (this.vx < 0) {
          this.x = p.x + p.width;
          this.vx = 0;
        }
      }
    }

    // Left screen bound
    if (this.x < 0) {
      this.x = 0;
      this.vx = 0;
    }
  }

  private resolveVerticalCollisions() {
    this.isGrounded = false;

    // Ground check
    const colIdx = Math.floor((this.x + this.width / 2) / TILE_SIZE);
    const groundYTile = this.groundHeights[colIdx] ?? 13;
    const groundY = groundYTile * TILE_SIZE;

    if (this.y + this.height >= groundY && groundYTile !== 999) {
      this.y = groundY - this.height;
      this.vy = 0;
      this.isGrounded = true;
    }

    // Pipe top check
    for (const p of this.pipes) {
      const pipeTop = CANVAS_HEIGHT - p.height * TILE_SIZE - 48;
      if (
        this.x + this.width > p.x &&
        this.x < p.x + p.width &&
        this.y + this.height >= pipeTop &&
        this.y + this.height <= pipeTop + 14 &&
        this.vy >= 0
      ) {
        this.y = pipeTop - this.height;
        this.vy = 0;
        this.isGrounded = true;
      }
    }

    // Mystery blocks & brick overhead collision
    for (const b of this.blocks) {
      if (
        this.x + this.width > b.x &&
        this.x < b.x + TILE_SIZE &&
        this.y <= b.y + TILE_SIZE &&
        this.y >= b.y &&
        this.vy < 0
      ) {
        this.y = b.y + TILE_SIZE;
        this.vy = 0.5;
        if (!b.isHit) {
          b.isHit = true;
          b.bumpOffset = 6;
          this.coins++;
          this.score += 200;
          retroAudio.playCoin();
          this.spawnCoinParticle(b.x + 8, b.y - 4);
        }
      } else if (
        this.x + this.width > b.x &&
        this.x < b.x + TILE_SIZE &&
        this.y + this.height >= b.y &&
        this.y + this.height <= b.y + 10 &&
        this.vy >= 0
      ) {
        this.y = b.y - this.height;
        this.vy = 0;
        this.isGrounded = true;
      }
    }
  }

  private updateEnemies() {
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) {
        enemy.deathTimer++;
        continue;
      }

      // Move enemy
      enemy.x += enemy.vx;

      // Reverse at pipes or pits
      for (const p of this.pipes) {
        if (enemy.x + enemy.width >= p.x && enemy.x <= p.x + p.width) {
          enemy.vx = -enemy.vx;
        }
      }

      // Check collision with Mario
      const overlapX = this.x + this.width > enemy.x && this.x < enemy.x + enemy.width;
      const overlapY = this.y + this.height > enemy.y && this.y < enemy.y + enemy.height;

      if (overlapX && overlapY) {
        // Did Mario stomp enemy from above?
        if (this.vy > 0 && this.y + this.height - this.vy <= enemy.y + 6) {
          enemy.isAlive = false;
          this.vy = -6.5; // Bounce off enemy
          this.score += 100;
          retroAudio.playStomp();
          this.spawnStompParticles(enemy.x + 7, enemy.y + 7);
        } else {
          this.die("Collided with Goomba hazard");
          return;
        }
      }
    }
  }

  private die(reason: string) {
    this.isDead = true;
    this.vy = -8.0;
    retroAudio.playDeath();
    console.log(`[MARIO DEAD] ${reason}`);
  }

  private spawnCoinParticle(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 3 - 2,
        color: "#fbbf24",
        life: 0,
        maxLife: 20,
        size: 3,
      });
    }
  }

  private spawnStompParticles(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
        color: "#f87171",
        life: 0,
        maxLife: 15,
        size: 2.5,
      });
    }
  }

  // Lookahead sensors extraction for AI models
  public getLookaheadSensors(): LookaheadSensors {
    // 1. Nearest pipe ahead
    let nearestPipe: { distX: number; height: number } | null = null;
    let minPipeDist = 999;
    for (const p of this.pipes) {
      const dist = p.x - this.x;
      if (dist >= -TILE_SIZE && dist < minPipeDist) {
        minPipeDist = dist;
        nearestPipe = { distX: Math.round(dist), height: p.height };
      }
    }

    // 2. Nearest alive enemy ahead
    let nearestEnemy: { distX: number; distY: number; isAlive: boolean } | null = null;
    let minEnemyDist = 999;
    for (const e of this.enemies) {
      if (!e.isAlive) continue;
      const dist = e.x - this.x;
      if (dist >= -TILE_SIZE && dist < minEnemyDist) {
        minEnemyDist = dist;
        nearestEnemy = { distX: Math.round(dist), distY: Math.round(e.y - this.y), isAlive: true };
      }
    }

    // 3. Nearest pit ahead
    let nearestPit: { distX: number; width: number } | null = null;
    let minPitDist = 999;
    for (const pit of this.pits) {
      const dist = pit.start - (this.x + this.width);
      if (dist >= -20 && dist < minPitDist) {
        minPitDist = dist;
        nearestPit = { distX: Math.round(dist), width: Math.round(pit.end - pit.start) };
      }
    }

    // 4. Nearest mystery block overhead
    let nearestBlock: { distX: number; height: number; hasCoin: boolean } | null = null;
    let minBlockDist = 999;
    for (const b of this.blocks) {
      const dist = b.x - this.x;
      if (dist >= -16 && dist < minBlockDist && !b.isHit) {
        minBlockDist = dist;
        nearestBlock = { distX: Math.round(dist), height: Math.round(this.y - b.y), hasCoin: b.hasCoin };
      }
    }

    // ASCII Visual Grid slice (16 cols x 8 rows around Mario)
    const asciiGrid = this.generateAsciiSlice();

    return {
      nearestPipe,
      nearestEnemy,
      nearestPit,
      nearestBlock,
      isGrounded: this.isGrounded,
      speedRatio: Math.min(1.0, Math.abs(this.vx) / MAX_RUN_SPEED),
      asciiGrid,
    };
  }

  private generateAsciiSlice(): string {
    const cols = 20;
    const rows = 10;
    const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill("."));

    const baseTileX = Math.floor(this.x / TILE_SIZE) - 2;
    const marioCol = 2;
    const marioRow = Math.min(rows - 1, Math.max(0, Math.floor(this.y / TILE_SIZE) - 6));
    if (marioRow >= 0 && marioRow < rows) {
      grid[marioRow][marioCol] = "M";
    }

    // Plot pipes, blocks, pits, enemies
    for (let c = 0; c < cols; c++) {
      const tX = baseTileX + c;
      const pX = tX * TILE_SIZE;

      // Ground / Pit
      const gY = this.groundHeights[tX] ?? 13;
      if (gY === 999) {
        grid[rows - 1][c] = "_"; // Abyss
      } else {
        grid[rows - 1][c] = "#"; // Ground
      }

      // Check pipe
      for (const p of this.pipes) {
        if (pX >= p.x && pX < p.x + p.width) {
          for (let h = 0; h < p.height; h++) {
            const r = rows - 2 - h;
            if (r >= 0) grid[r][c] = "P";
          }
        }
      }

      // Check blocks
      for (const b of this.blocks) {
        if (Math.abs(pX - b.x) < 8) {
          const r = Math.floor(b.y / TILE_SIZE) - 6;
          if (r >= 0 && r < rows) grid[r][c] = b.isHit ? "B" : "?";
        }
      }

      // Check enemies
      for (const e of this.enemies) {
        if (e.isAlive && Math.abs(pX - e.x) < 12) {
          grid[rows - 2][c] = "G";
        }
      }
    }

    return grid.map(r => r.join(" ")).join("\n");
  }

  public getAvailableActionCriteria(): MacroActionOption[] {
    const s = this.getLookaheadSensors();

    const criteria: MacroActionOption[] = [
      {
        value: "SPRINT_RIGHT",
        description: s.nearestEnemy && s.nearestEnemy.distX < 50
          ? "HIGH RISK: Sprints straight forward into approaching Goomba hazard."
          : s.nearestPit && s.nearestPit.distX < 40
          ? "FATAL DANGER: Sprints right off the edge into abyss pit."
          : s.nearestPipe && s.nearestPipe.distX < 30
          ? "BLOCKED: Runs into green pipe obstacle."
          : "OPTIMAL: Safe open terrain ahead, accelerates to max velocity (4.2 px/frame).",
      },
      {
        value: "FULL_JUMP_RIGHT",
        description: s.nearestPit && s.nearestPit.distX < 60
          ? "CRITICAL BEST: Clears wide abyss pit gap with maximum jump impulse and momentum."
          : s.nearestPipe && s.nearestPipe.distX < 50
          ? "OPTIMAL: High jump clears vertical pipe obstacle."
          : s.nearestEnemy && s.nearestEnemy.distX < 70
          ? "TACTICAL: Vaults cleanly over enemy patrol with aerial clearance."
          : "EXPEDIENT: High leap forward across standard terrain.",
      },
      {
        value: "SHORT_HOP_RIGHT",
        description: s.nearestEnemy && s.nearestEnemy.distX > 20 && s.nearestEnemy.distX < 50
          ? "ATTACK STOMP: Short hopping arc perfectly descends onto Goomba head to eliminate enemy."
          : s.nearestBlock && s.nearestBlock.distX < 30
          ? "COIN HARVEST: Short hop strikes question block directly overhead."
          : s.nearestPit && s.nearestPit.distX < 30
          ? "DANGER: Short hop may not clear wide chasm."
          : "CONTROLLED: Low-arc traversal maintaining quick ground recovery.",
      },
      {
        value: "HIGH_VERTICAL_JUMP",
        description: s.nearestBlock && Math.abs(s.nearestBlock.distX) < 16
          ? "DIRECT HIT: Jump straight up hits mystery block overhead for gold coins."
          : "VERTICAL RECON: Jump in place to clear imminent low obstacle or dodge.",
      },
      {
        value: "SKID_STOP",
        description: s.nearestPit && s.nearestPit.distX < 30 && s.speedRatio > 0.4
          ? "EMERGENCY BRAKE: Kills running forward momentum to stop right before the edge of a pit."
          : s.nearestEnemy && s.nearestEnemy.distX < 30 && !s.isGrounded
          ? "AIR BRAKE: Cancels forward momentum."
          : "SLOW DOWN: Brings Mario to an immediate halt.",
      },
      {
        value: "WAIT_OBSERVE",
        description: s.nearestEnemy && s.nearestEnemy.distX < 40
          ? "PATIENT: Waits safely on high pipe/ledge until moving enemy walks under or past."
          : "IDLE: Pauses briefly before advancing.",
      },
    ];

    return criteria;
  }

  public getFullState(): MarioState {
    return {
      marioX: Math.round(this.x),
      marioY: Math.round(this.y),
      vx: Number(this.vx.toFixed(2)),
      vy: Number(this.vy.toFixed(2)),
      score: this.score,
      coins: this.coins,
      distance: Math.round(this.x),
      isGrounded: this.isGrounded,
      isDead: this.isDead,
      isVictory: this.isVictory,
      sensors: this.getLookaheadSensors(),
      availableActions: this.getAvailableActionCriteria(),
    };
  }
}
