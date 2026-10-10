export type MacroAction = 
  | "SPRINT_RIGHT"
  | "FULL_JUMP_RIGHT"
  | "SHORT_HOP_RIGHT"
  | "HIGH_VERTICAL_JUMP"
  | "SKID_STOP"
  | "WAIT_OBSERVE";

export interface MacroActionOption {
  value: MacroAction;
  description: string;
}

export interface Enemy {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  isAlive: boolean;
  type: "goomba" | "koopa";
  deathTimer: number;
}

export interface MysteryBlock {
  x: number;
  y: number;
  hasCoin: boolean;
  isHit: boolean;
  bumpOffset: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

export interface LookaheadSensors {
  nearestPipe: { distX: number; height: number } | null;
  nearestEnemy: { distX: number; distY: number; isAlive: boolean } | null;
  nearestPit: { distX: number; width: number } | null;
  nearestBlock: { distX: number; height: number; hasCoin: boolean } | null;
  isGrounded: boolean;
  speedRatio: number;
  asciiGrid: string;
}

export interface MarioState {
  marioX: number;
  marioY: number;
  vx: number;
  vy: number;
  score: number;
  coins: number;
  distance: number;
  isGrounded: boolean;
  isDead: boolean;
  isVictory: boolean;
  sensors: LookaheadSensors;
  availableActions: MacroActionOption[];
}

export interface DecisionResponse {
  chosenAction: MacroAction;
  confidence: number;
  latencyMs: number;
  model: string;
  reasoning: string;
  probabilities: Record<string, number>;
  costUsd: number;
}
