"use client";

import React, { useEffect, useRef, useState } from "react";
import { MarioGameEngine, CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE } from "@/engine/marioEngine";
import { MacroAction, DecisionResponse } from "@/engine/types";
import { retroAudio } from "@/engine/audio";

export default function MarioAIArena() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<MarioGameEngine | null>(null);

  // Simulation State
  const [selectedModel, setSelectedModel] = useState<string>("gpt-6-luna");
  const [customOllamaModel, setCustomOllamaModel] = useState<string>("mistral");
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [crtEnabled, setCrtEnabled] = useState<boolean>(true);
  const [showRays, setShowRays] = useState<boolean>(true);
  const [manualMode, setManualMode] = useState<boolean>(false);

  // Live Telemetry
  const [marioState, setMarioState] = useState<any>(null);
  const [decisionHistory, setDecisionHistory] = useState<DecisionResponse | null>(null);
  const [p50Latency, setP50Latency] = useState<number>(450);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [wireTab, setWireTab] = useState<"request" | "response">("response");
  const [copied, setCopied] = useState<boolean>(false);

  // Initialize Engine
  useEffect(() => {
    const engine = new MarioGameEngine(42);
    engineRef.current = engine;
    setMarioState(engine.getFullState());

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!manualMode || !engineRef.current) return;
      if (e.key === "ArrowRight") engineRef.current.setMacroAction("SPRINT_RIGHT", 15);
      if (e.key === "ArrowLeft") engineRef.current.setMacroAction("SKID_STOP", 15);
      if (e.key === "z" || e.key === "Z" || e.key === " ") engineRef.current.setMacroAction("FULL_JUMP_RIGHT", 25);
      if (e.key === "x" || e.key === "X") engineRef.current.setMacroAction("SHORT_HOP_RIGHT", 18);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [manualMode]);

  // Main 60 FPS Game Loop
  useEffect(() => {
    let animId: number;
    let frameCounter = 0;

    const loop = () => {
      const engine = engineRef.current;
      const canvas = canvasRef.current;

      if (engine && canvas && isRunning) {
        for (let s = 0; s < speedMultiplier; s++) {
          engine.step();
        }

        frameCounter++;
        // Request AI Decision when macro burst expires or state shifts
        if (
          !manualMode &&
          engine.macroFramesRemaining <= 0 &&
          !engine.isDead &&
          !engine.isVictory &&
          !isEvaluating
        ) {
          triggerAIDecision(engine);
        }

        // Render Frame
        renderCanvas(canvas, engine, showRays);

        // Update React State throttled (every 5 frames)
        if (frameCounter % 5 === 0) {
          setMarioState(engine.getFullState());
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isRunning, speedMultiplier, manualMode, isEvaluating, showRays]);

  // Request AI Decision from Vercel Serverless API
  const triggerAIDecision = async (engine: MarioGameEngine) => {
    setIsEvaluating(true);
    const sensors = engine.getLookaheadSensors();
    const actions = engine.getAvailableActionCriteria();
    const modelToUse = selectedModel === "custom-ollama"
      ? `ollama:${customOllamaModel.trim() || "llama3.2:1b"}`
      : selectedModel;

    try {
      const res = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelToUse,
          marioX: Math.round(engine.x),
          marioY: Math.round(engine.y),
          isGrounded: engine.isGrounded,
          sensors,
          actions,
        }),
      });

      if (res.ok) {
        const data: DecisionResponse = await res.json();
        setDecisionHistory(data);
        setP50Latency(prev => Math.round(prev * 0.7 + data.latencyMs * 0.3));
        setTotalCost(prev => prev + (data.costUsd || 0));

        // Execute returned macro action
        if (engine && !engine.isDead && !engine.isVictory) {
          engine.setMacroAction(data.chosenAction, 24);
        }
      }
    } catch (err) {
      console.error("AI Decision failed:", err);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleReset = () => {
    if (engineRef.current) {
      engineRef.current.reset(Math.floor(Math.random() * 1000));
      setMarioState(engineRef.current.getFullState());
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    retroAudio.enabled = next;
  };

  return (
    <div>
      {/* Top Header */}
      <header className="arcade-header">
        <div className="brand-title">
          <span className="mario-icon">🍄</span>
          <div>
            <div className="title-text">CYBER-MARIO AI ARENA</div>
            <div className="title-sub">AUTONOMOUS MULTI-MODEL DECISION BENCHMARK • VERCEL EDGE</div>
          </div>
        </div>

        <div className="header-badges">
          <div className="badge-pill model-active">
            <span>●</span> {selectedModel === "gpt-6-luna" ? "GPT-6 Luna (Decisions API)" : selectedModel.toUpperCase()}
          </div>
          <div className="badge-pill">
            <span>⚡</span> {p50Latency} ms P50
          </div>
          <div className="badge-pill">
            <span>💰</span> ${totalCost.toFixed(5)}
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="arena-container">
        {/* Left Game Stage */}
        <div className="stage-panel">
          <div className="cabinet-frame">
            <div className="canvas-wrapper">
              <canvas
                id="marioCanvas"
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
              />

              {crtEnabled && <div className="crt-overlay" />}

              {/* In-Game Retro HUD */}
              <div className="canvas-hud">
                <div className="hud-item">
                  <span>MARIO</span>
                  <span className="hud-val">{(marioState?.score || 0).toString().padStart(6, "0")}</span>
                </div>
                <div className="hud-item">
                  <span>COINS</span>
                  <span className="hud-val">🪙 x{(marioState?.coins || 0).toString().padStart(2, "0")}</span>
                </div>
                <div className="hud-item">
                  <span>WORLD</span>
                  <span className="hud-val">1-1</span>
                </div>
                <div className="hud-item">
                  <span>DISTANCE</span>
                  <span className="hud-val">{marioState?.distance || 0}m</span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Controls */}
          <div className="control-bar">
            <div className="btn-group">
              <button
                className={`arcade-btn btn-primary`}
                onClick={() => setIsRunning(!isRunning)}
              >
                {isRunning ? "⏸ Pause" : "▶ Resume"}
              </button>
              <button className="arcade-btn" onClick={handleReset}>
                🔄 Restart Level
              </button>
              <button
                className={`arcade-btn ${manualMode ? "active" : ""}`}
                onClick={() => setManualMode(!manualMode)}
              >
                🎮 {manualMode ? "Manual (Keyboard)" : "Autonomous AI"}
              </button>
            </div>

            <div className="btn-group">
              <button
                className={`arcade-btn ${speedMultiplier === 1 ? "active" : ""}`}
                onClick={() => setSpeedMultiplier(1)}
              >
                1x
              </button>
              <button
                className={`arcade-btn ${speedMultiplier === 2 ? "active" : ""}`}
                onClick={() => setSpeedMultiplier(2)}
              >
                2x Turbo
              </button>
              <button
                className={`arcade-btn ${showRays ? "active" : ""}`}
                onClick={() => setShowRays(!showRays)}
              >
                👁 Sensor Rays
              </button>
              <button
                className={`arcade-btn ${soundEnabled ? "active" : ""}`}
                onClick={toggleSound}
              >
                {soundEnabled ? "🔊 Sound" : "🔇 Mute"}
              </button>
              <button
                className={`arcade-btn ${crtEnabled ? "active" : ""}`}
                onClick={() => setCrtEnabled(!crtEnabled)}
              >
                📺 CRT
              </button>
            </div>
          </div>

          {/* Keyboard instructions if manual */}
          {manualMode && (
            <div className="keys-guide">
              <span>Manual Controls:</span>
              <span><span className="key-tag">→</span> Sprint Right</span>
              <span><span className="key-tag">←</span> Skid Brake</span>
              <span><span className="key-tag">Z</span> or <span className="key-tag">Space</span> Full Jump</span>
              <span><span className="key-tag">X</span> Short Hop Stomp</span>
            </div>
          )}
        </div>

        {/* Right Telemetry Sidebar */}
        <div className="telemetry-sidebar">
          {/* Model Selector Card */}
          <div className="telemetry-card">
            <div className="card-header">
              <span className="card-title">🤖 Active Intelligence Agent</span>
              <span className="agent-badge" style={{ fontSize: "11px", color: "#38bdf8", background: "rgba(56,189,248,0.1)", padding: "2px 6px", borderRadius: "4px" }}>
                {selectedModel.startsWith("ollama") || selectedModel === "custom-ollama"
                  ? "Local Ollama"
                  : selectedModel === "gpt-6-luna"
                  ? "Decisions API"
                  : selectedModel === "gemini-flash"
                  ? "Gemini Cloud"
                  : "Deterministic"}
              </span>
            </div>
            <select
              className="model-select"
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
            >
              <option value="gpt-6-luna">OpenAI GPT-6 Luna (Decisions API • 0 Tokens)</option>
              <option value="ollama:llama3.2:1b">🦙 Ollama Llama 3.2 1B (Local • Ultra-Fast)</option>
              <option value="ollama:llama3.1:latest">🦙 Ollama Llama 3.1 8B (Local)</option>
              <option value="ollama:lukey03/qwen3.5-9b-abliterated:latest">🧠 Ollama Qwen 3.5 9B (Local)</option>
              <option value="gemini-flash">Google Gemini 2.0 Flash (Structured LLM)</option>
              <option value="heuristic">Heuristic Optimal Solver (Sub-1ms Baseline)</option>
              <option value="custom-ollama">⚙️ Custom Ollama Model...</option>
            </select>

            {selectedModel === "custom-ollama" && (
              <div style={{ marginTop: "10px" }}>
                <input
                  type="text"
                  placeholder="e.g. mistral, qwen2.5:3b, phi3, deepseek-r1"
                  value={customOllamaModel}
                  onChange={e => setCustomOllamaModel(e.target.value)}
                  className="custom-model-input"
                />
              </div>
            )}
          </div>

          {/* Live Action Decision Probabilities */}
          <div className="telemetry-card">
            <div className="card-header">
              <span className="card-title">📊 Macro-Action Decision Matrix</span>
              <span style={{ fontSize: "11px", color: isEvaluating ? "#00f3ff" : "#94a3b8" }}>
                {isEvaluating ? "Deliberating..." : "Executed"}
              </span>
            </div>

            <div className="prob-list">
              {[
                "SPRINT_RIGHT",
                "FULL_JUMP_RIGHT",
                "SHORT_HOP_RIGHT",
                "HIGH_VERTICAL_JUMP",
                "SKID_STOP",
                "WAIT_OBSERVE",
              ].map(action => {
                const isChosen = decisionHistory?.chosenAction === action;
                const prob = decisionHistory?.probabilities?.[action] ?? (isChosen ? 0.85 : 0.03);
                return (
                  <div key={action} className="prob-row">
                    <div className="prob-meta">
                      <span className={`prob-name ${isChosen ? "chosen" : ""}`}>
                        {isChosen ? "▶ " : ""}{action}
                      </span>
                      <span className="prob-pct">{(prob * 100).toFixed(0)}%</span>
                    </div>
                    <div className="prob-bar-track">
                      <div
                        className="prob-bar-fill"
                        style={{
                          width: `${Math.max(4, prob * 100)}%`,
                          background: isChosen ? "linear-gradient(90deg, #00f3ff, #10b981)" : "rgba(255,255,255,0.15)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {decisionHistory?.reasoning && (
              <div className="reasoning-box">
                <b>Decision Reasoning:</b> {decisionHistory.reasoning}
              </div>
            )}
          </div>

          {/* Spatial Sensors & Telemetry */}
          <div className="telemetry-card">
            <div className="card-header">
              <span className="card-title">📡 Lookahead Spatial Sensors</span>
            </div>

            <div className="sensor-grid">
              <div className="sensor-box">
                <span className="sensor-label">Next Pipe Obstacle</span>
                <span className="sensor-val">
                  {marioState?.sensors?.nearestPipe ? `${marioState.sensors.nearestPipe.distX}px (H=${marioState.sensors.nearestPipe.height})` : "None in view"}
                </span>
              </div>
              <div className="sensor-box">
                <span className="sensor-label">Nearest Goomba</span>
                <span className="sensor-val" style={{ color: marioState?.sensors?.nearestEnemy?.distX < 60 ? "#f43f5e" : "#e2e8f0" }}>
                  {marioState?.sensors?.nearestEnemy ? `${marioState.sensors.nearestEnemy.distX}px ahead` : "Clear"}
                </span>
              </div>
              <div className="sensor-box">
                <span className="sensor-label">Nearest Abyss Pit</span>
                <span className="sensor-val" style={{ color: marioState?.sensors?.nearestPit?.distX < 60 ? "#fbbf24" : "#e2e8f0" }}>
                  {marioState?.sensors?.nearestPit ? `${marioState.sensors.nearestPit.distX}px (${marioState.sensors.nearestPit.width}px)` : "Solid ground"}
                </span>
              </div>
              <div className="sensor-box">
                <span className="sensor-label">Question Block</span>
                <span className="sensor-val">
                  {marioState?.sensors?.nearestBlock ? `${marioState.sensors.nearestBlock.distX}px` : "None"}
                </span>
              </div>
            </div>

            {marioState?.sensors?.asciiGrid && (
              <div>
                <span className="sensor-label" style={{ marginBottom: "4px", display: "block" }}>ASCII Visual State Slice</span>
                <div className="ascii-slice-box">{marioState.sensors.asciiGrid}</div>
              </div>
            )}
          </div>

          {/* Live OpenAI Wire Telecast */}
          <div className="telemetry-card">
            <div className="card-header">
              <span className="card-title">
                <span className="live-pulse" /> Live API Wire Telecast
              </span>
              <div className="wire-meta-badge">
                <span className="status-code">200 OK</span>
                <span className="zero-token-pill">
                  {selectedModel === "gpt-6-luna"
                    ? "0 Gen Tokens"
                    : selectedModel.startsWith("ollama") || selectedModel === "custom-ollama"
                    ? "Local $0.00"
                    : selectedModel === "gemini-flash"
                    ? "Cloud LLM"
                    : "0ms Rule"}
                </span>
              </div>
            </div>

            <div className="wire-tabs">
              <button
                className={`wire-tab-btn ${wireTab === "request" ? "active" : ""}`}
                onClick={() => setWireTab("request")}
              >
                Request Payload
              </button>
              <button
                className={`wire-tab-btn ${wireTab === "response" ? "active" : ""}`}
                onClick={() => setWireTab("response")}
              >
                Model Response
              </button>
              <button
                className="wire-copy-btn"
                onClick={() => {
                  const dataToCopy = wireTab === "request"
                    ? decisionHistory?.rawRequest || { note: "Awaiting next decision tick" }
                    : decisionHistory?.rawResponse || { note: "Awaiting next decision tick" };
                  navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
            </div>

            <div className="wire-display-container">
              <pre className="wire-json-code">
                {JSON.stringify(
                  wireTab === "request"
                    ? decisionHistory?.rawRequest ?? {
                        endpoint: "POST https://api.openai.com/v1/decisions",
                        model: selectedModel,
                        status: isEvaluating ? "TRANSMITTING WIRE PAYLOAD..." : "STANDBY (INITIALIZING)",
                      }
                    : decisionHistory?.rawResponse ?? {
                        status: isEvaluating ? "WAITING FOR RESPONSE..." : "STANDBY (INITIALIZING)",
                        choice: decisionHistory?.chosenAction || "PENDING",
                      },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// -------------------------------------------------------------
// Canvas 2D Retro Renderer
// -------------------------------------------------------------
function renderCanvas(canvas: HTMLCanvasElement, engine: MarioGameEngine, showRays: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const cameraX = Math.max(0, engine.x - 120);

  // 1. Sky & Parallax Clouds
  ctx.fillStyle = "#5c94fc";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Distant clouds
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  const cloudOffsets = [40, 200, 360, 520, 680, 900, 1200, 1500, 1800, 2100];
  for (const cx of cloudOffsets) {
    const rx = cx - cameraX * 0.3;
    if (rx > -60 && rx < CANVAS_WIDTH + 60) {
      drawCloud(ctx, rx, 35);
    }
  }

  // Distant hills
  ctx.fillStyle = "#00a800";
  const hillOffsets = [80, 280, 480, 720, 1000, 1300, 1600, 1900];
  for (const hx of hillOffsets) {
    const rx = hx - cameraX * 0.5;
    if (rx > -80 && rx < CANVAS_WIDTH + 80) {
      ctx.beginPath();
      ctx.arc(rx, 220, 50, Math.PI, 0);
      ctx.fill();
    }
  }

  // 2. Ground Tiles
  const startCol = Math.max(0, Math.floor(cameraX / TILE_SIZE));
  const endCol = Math.min(engine.levelWidthTiles - 1, Math.floor((cameraX + CANVAS_WIDTH) / TILE_SIZE) + 1);

  for (let c = startCol; c <= endCol; c++) {
    const groundYTile = engine.groundHeights[c];
    if (groundYTile !== 999) {
      const screenX = c * TILE_SIZE - cameraX;
      const screenY = groundYTile * TILE_SIZE;

      // Top ground brick
      ctx.fillStyle = "#d88038";
      ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = "#fc9838";
      ctx.fillRect(screenX + 1, screenY + 1, TILE_SIZE - 2, 2);

      // Deep earth
      ctx.fillStyle = "#b86820";
      ctx.fillRect(screenX, screenY + TILE_SIZE, TILE_SIZE, CANVAS_HEIGHT - screenY - TILE_SIZE);
    }
  }

  // 3. Pipes
  for (const p of engine.pipes) {
    const px = p.x - cameraX;
    if (px > -40 && px < CANVAS_WIDTH + 40) {
      const pipeH = p.height * TILE_SIZE;
      const py = CANVAS_HEIGHT - pipeH - 48;

      // Pipe Body
      ctx.fillStyle = "#00a800";
      ctx.fillRect(px + 2, py + 12, p.width - 4, pipeH - 12);
      ctx.fillStyle = "#80d010"; // Highlight
      ctx.fillRect(px + 4, py + 12, 4, pipeH - 12);

      // Pipe Top Lip
      ctx.fillStyle = "#00a800";
      ctx.fillRect(px, py, p.width, 12);
      ctx.fillStyle = "#80d010";
      ctx.fillRect(px + 2, py + 2, 4, 8);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, p.width, 12);
    }
  }

  // 4. Mystery Blocks & Bricks
  for (const b of engine.blocks) {
    const bx = b.x - cameraX;
    if (bx > -20 && bx < CANVAS_WIDTH + 20) {
      const by = b.y - b.bumpOffset;
      if (b.isHit) {
        ctx.fillStyle = "#a87038"; // Empty brown block
        ctx.fillRect(bx, by, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = "#000";
        ctx.strokeRect(bx, by, TILE_SIZE, TILE_SIZE);
      } else {
        // Glowing gold question block
        ctx.fillStyle = "#fc9838";
        ctx.fillRect(bx, by, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = "#fce4a0";
        ctx.font = "bold 10px monospace";
        ctx.fillText("?", bx + 4, by + 12);
        ctx.strokeStyle = "#804000";
        ctx.strokeRect(bx, by, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // 5. Flagpole & Castle at End
  const fX = engine.flagPoleX - cameraX;
  if (fX > -40 && fX < CANVAS_WIDTH + 40) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(fX, 50, 4, 158);
    ctx.fillStyle = "#00a800"; // Flag
    ctx.beginPath();
    ctx.moveTo(fX, 55);
    ctx.lineTo(fX - 20, 65);
    ctx.lineTo(fX, 75);
    ctx.fill();
    ctx.fillStyle = "#fc9838"; // Top ball
    ctx.beginPath();
    ctx.arc(fX + 2, 50, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 6. Enemies (Goombas)
  for (const enemy of engine.enemies) {
    const ex = enemy.x - cameraX;
    if (ex > -20 && ex < CANVAS_WIDTH + 20) {
      if (!enemy.isAlive) {
        // Squished flat Goomba
        ctx.fillStyle = "#a84000";
        ctx.fillRect(ex, enemy.y + 8, enemy.width, 6);
      } else {
        // Walking Goomba
        ctx.fillStyle = "#a84000";
        ctx.fillRect(ex, enemy.y, enemy.width, enemy.height);
        // Eyes
        ctx.fillStyle = "#fff";
        ctx.fillRect(ex + 2, enemy.y + 4, 3, 5);
        ctx.fillRect(ex + 9, enemy.y + 4, 3, 5);
        ctx.fillStyle = "#000";
        ctx.fillRect(ex + 3, enemy.y + 6, 2, 3);
        ctx.fillRect(ex + 9, enemy.y + 6, 2, 3);
      }
    }
  }

  // 7. Particles
  for (const p of engine.particles) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - cameraX, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // 8. Mario
  const mx = engine.x - cameraX;
  const my = engine.y;

  ctx.save();
  if (!engine.facingRight) {
    ctx.translate(mx + engine.width, my);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(mx, my);
  }

  if (engine.isDead) {
    // Dead pose
    ctx.fillStyle = "#fc3838";
    ctx.fillRect(0, 0, engine.width, engine.height);
  } else {
    // Red Shirt & Cap
    ctx.fillStyle = "#fc3838";
    ctx.fillRect(2, 0, 10, 5); // Cap
    ctx.fillRect(1, 5, 12, 7); // Shirt
    // Blue Overalls
    ctx.fillStyle = "#0040fc";
    ctx.fillRect(3, 10, 8, 8); // Pants
    // Face & Hand
    ctx.fillStyle = "#fcb888";
    ctx.fillRect(4, 2, 7, 4); // Face
    // Shoes
    ctx.fillStyle = "#603810";
    ctx.fillRect(1, 18, 5, 2);
    ctx.fillRect(8, 18, 5, 2);
  }
  ctx.restore();

  // 9. AI Lookahead Sensor Rays (Targeting Line Overlay)
  if (showRays && !engine.isDead && !engine.isVictory) {
    const s = engine.getLookaheadSensors();

    // Line to nearest pipe
    if (s.nearestPipe && s.nearestPipe.distX > 0 && s.nearestPipe.distX < 180) {
      ctx.strokeStyle = "rgba(0, 243, 255, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(mx + engine.width, my + 10);
      ctx.lineTo(mx + s.nearestPipe.distX, my + 10);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Line to nearest enemy
    if (s.nearestEnemy && s.nearestEnemy.distX > 0 && s.nearestEnemy.distX < 180) {
      ctx.strokeStyle = "rgba(244, 63, 94, 0.65)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(mx + engine.width, my + 10);
      ctx.lineTo(mx + s.nearestEnemy.distX, my + 10);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 10. Victory Overlay
  if (engine.isVictory) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 20px 'Outfit', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("STAGE CLEAR! 🚩", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 10);
    ctx.fillStyle = "#fff";
    ctx.font = "14px 'Outfit', sans-serif";
    ctx.fillText(`Autonomous AI Completion Score: ${engine.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 18);
  } else if (engine.isDead) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = "#f43f5e";
    ctx.font = "bold 20px 'Outfit', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("MARIO TERMINATED 💀", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 10);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px 'Outfit', sans-serif";
    ctx.fillText("Auto-Resetting Next Episode...", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 15);
  }
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.arc(x + 12, y - 6, 16, 0, Math.PI * 2);
  ctx.arc(x + 28, y - 4, 14, 0, Math.PI * 2);
  ctx.arc(x + 36, y, 12, 0, Math.PI * 2);
  ctx.fill();
}
