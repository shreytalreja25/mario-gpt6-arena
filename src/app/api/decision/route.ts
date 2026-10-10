import { NextRequest, NextResponse } from "next/server";
import { MacroAction, MacroActionOption, LookaheadSensors, DecisionResponse } from "@/engine/types";

export async function POST(req: NextRequest) {
  const t0 = performance.now();

  try {
    const body = await req.json();
    const model = body.model || "gpt-6-luna";
    const sensors: LookaheadSensors = body.sensors;
    const actions: MacroActionOption[] = body.actions;
    const marioX = body.marioX || 0;
    const marioY = body.marioY || 0;
    const isGrounded = body.isGrounded ?? true;

    // 1. Algorithmic Heuristic Solver
    if (model === "heuristic") {
      const decision = runHeuristicPolicy(sensors, actions);
      const elapsed = performance.now() - t0;
      return NextResponse.json({
        chosenAction: decision.action,
        confidence: 0.98,
        latencyMs: Math.round(elapsed),
        model: "Heuristic Solver (Deterministic)",
        reasoning: decision.reason,
        probabilities: decision.probs,
        costUsd: 0.0,
      } as DecisionResponse);
    }

    // 2. OpenAI Decisions API (GPT-6 Luna)
    if (model === "gpt-6-luna") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        // Fallback to heuristic if key is missing
        const fallback = runHeuristicPolicy(sensors, actions);
        const elapsed = performance.now() - t0;
        return NextResponse.json({
          chosenAction: fallback.action,
          confidence: 0.85,
          latencyMs: Math.round(elapsed),
          model: "GPT-6 Luna (Simulated Fallback)",
          reasoning: `Missing OPENAI_API_KEY; fallback chosen: ${fallback.reason}`,
          probabilities: fallback.probs,
          costUsd: 0.0,
        } as DecisionResponse);
      }

      // Build compact context prompt for Decisions API
      const inputContext = (
        `Super Mario World 1-1 AI Controller\n` +
        `Mario State: X=${marioX}, Y=${marioY}, Grounded=${isGrounded}\n` +
        `Nearest Pipe: ${sensors.nearestPipe ? `${sensors.nearestPipe.distX}px ahead (H=${sensors.nearestPipe.height})` : "None"}\n` +
        `Nearest Enemy: ${sensors.nearestEnemy ? `${sensors.nearestEnemy.distX}px ahead (Goomba)` : "None"}\n` +
        `Nearest Pit: ${sensors.nearestPit ? `${sensors.nearestPit.distX}px ahead (Width=${sensors.nearestPit.width}px)` : "None"}\n` +
        `Nearest Block: ${sensors.nearestBlock ? `${sensors.nearestBlock.distX}px ahead` : "None"}\n\n` +
        `ASCII Spatial Slice (M=Mario, G=Goomba, P=Pipe, ?=Coin Block, #=Ground, _=Pit):\n${sensors.asciiGrid}`
      );

      const choicesPayload = actions.map(a => ({
        value: a.value,
        description: a.description,
      }));

      const payload = {
        model: "gpt-6-luna",
        input: inputContext,
        questions: [
          {
            type: "choice",
            name: "mario_macro_action",
            instructions: (
              "Select the single best macro-action for Mario to progress rightward while avoiding pits, " +
              "clearing pipes, and stomping or vaulting over enemy hazards."
            ),
            choices: choicesPayload,
          },
        ],
      };

      const resp = await fetch("https://api.openai.com/v1/decisions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const elapsed = performance.now() - t0;

      if (resp.ok) {
        const data = await resp.json();
        const answer = data.answers?.[0] || {};
        const chosen = (answer.choice as MacroAction) || "SPRINT_RIGHT";
        const confidence = Number(answer.confidence || 0.95);

        const probs: Record<string, number> = {};
        if (Array.isArray(answer.probabilities)) {
          for (const p of answer.probabilities) {
            probs[p.value] = Math.round(Number(p.probability || 0) * 100) / 100;
          }
        }

        const inputTokens = data.usage?.input_tokens || 140;
        const costUsd = (inputTokens / 1_000_000) * 0.10;

        return NextResponse.json({
          chosenAction: chosen,
          confidence: Math.round(confidence * 100) / 100,
          latencyMs: Math.round(elapsed),
          model: "GPT-6 Luna (Decisions API)",
          reasoning: `Decisions API choice: ${chosen} (Confidence: ${(confidence * 100).toFixed(1)}%)`,
          probabilities: probs,
          costUsd: Number(costUsd.toFixed(6)),
        } as DecisionResponse);
      } else {
        const errText = await resp.text();
        const fallback = runHeuristicPolicy(sensors, actions);
        return NextResponse.json({
          chosenAction: fallback.action,
          confidence: 0.8,
          latencyMs: Math.round(elapsed),
          model: "GPT-6 Luna (Fallback on HTTP Error)",
          reasoning: `API error (${resp.status}): ${errText.slice(0, 80)}. Safe fallback engaged.`,
          probabilities: fallback.probs,
          costUsd: 0.0,
        } as DecisionResponse);
      }
    }

    // 3. Google Gemini Flash (Generative LLM)
    if (model === "gemini-flash") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        const fallback = runHeuristicPolicy(sensors, actions);
        const elapsed = performance.now() - t0;
        return NextResponse.json({
          chosenAction: fallback.action,
          confidence: 0.85,
          latencyMs: Math.round(elapsed),
          model: "Gemini Flash (Simulated Fallback)",
          reasoning: "Missing GEMINI_API_KEY",
          probabilities: fallback.probs,
          costUsd: 0.0,
        } as DecisionResponse);
      }

      const prompt = `You are playing Super Mario Bros Level 1-1.
State:
- Nearest Pipe: ${sensors.nearestPipe ? `${sensors.nearestPipe.distX}px` : "None"}
- Nearest Enemy (Goomba): ${sensors.nearestEnemy ? `${sensors.nearestEnemy.distX}px` : "None"}
- Nearest Pit (Chasm): ${sensors.nearestPit ? `${sensors.nearestPit.distX}px` : "None"}

Allowed Actions:
${actions.map(a => `- ${a.value}: ${a.description}`).join("\n")}

Respond in strict JSON only:
{"action": "ACTION_NAME", "reasoning": "brief explanation"}`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      });

      const elapsed = performance.now() - t0;
      if (resp.ok) {
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const parsed = JSON.parse(text);
        const chosen = (parsed.action as MacroAction) || "SPRINT_RIGHT";
        return NextResponse.json({
          chosenAction: chosen,
          confidence: 0.92,
          latencyMs: Math.round(elapsed),
          model: "Gemini Flash (Google)",
          reasoning: parsed.reasoning || "Gemini Flash structured decision",
          probabilities: { [chosen]: 0.92 },
          costUsd: 0.00002,
        } as DecisionResponse);
      } else {
        const fallback = runHeuristicPolicy(sensors, actions);
        return NextResponse.json({
          chosenAction: fallback.action,
          confidence: 0.8,
          latencyMs: Math.round(elapsed),
          model: "Gemini Flash (Fallback)",
          reasoning: "Gemini API rate-limit/error; fallback triggered.",
          probabilities: fallback.probs,
          costUsd: 0.0,
        } as DecisionResponse);
      }
    }

    // Default fallback
    const fallback = runHeuristicPolicy(sensors, actions);
    return NextResponse.json({
      chosenAction: fallback.action,
      confidence: 0.9,
      latencyMs: 1,
      model: "Heuristic Fallback",
      reasoning: fallback.reason,
      probabilities: fallback.probs,
      costUsd: 0.0,
    } as DecisionResponse);

  } catch (err) {
    const elapsed = performance.now() - t0;
    return NextResponse.json({
      chosenAction: "FULL_JUMP_RIGHT",
      confidence: 0.5,
      latencyMs: Math.round(elapsed),
      model: "Emergency Recovery",
      reasoning: String(err),
      probabilities: { FULL_JUMP_RIGHT: 1.0 },
      costUsd: 0.0,
    } as DecisionResponse, { status: 200 });
  }
}

function runHeuristicPolicy(
  sensors: LookaheadSensors,
  actions: MacroActionOption[]
): { action: MacroAction; reason: string; probs: Record<string, number> } {
  // 1. Critical: Pit ahead within jump range
  if (sensors.nearestPit && sensors.nearestPit.distX < 65 && sensors.nearestPit.distX > -10) {
    return {
      action: "FULL_JUMP_RIGHT",
      reason: `Approaching pit at ${sensors.nearestPit.distX}px; executing full velocity jump clearance.`,
      probs: { FULL_JUMP_RIGHT: 0.88, SPRINT_RIGHT: 0.04, SHORT_HOP_RIGHT: 0.08 },
    };
  }

  // 2. Pipe obstruction
  if (sensors.nearestPipe && sensors.nearestPipe.distX < 55 && sensors.nearestPipe.distX > -10) {
    return {
      action: "FULL_JUMP_RIGHT",
      reason: `Vertical pipe obstacle ${sensors.nearestPipe.distX}px ahead; leaping over pipe lip.`,
      probs: { FULL_JUMP_RIGHT: 0.92, SPRINT_RIGHT: 0.02, SHORT_HOP_RIGHT: 0.06 },
    };
  }

  // 3. Enemy Goomba approaching
  if (sensors.nearestEnemy && sensors.nearestEnemy.distX < 60 && sensors.nearestEnemy.distX > -5) {
    if (sensors.nearestEnemy.distX < 35) {
      return {
        action: "SHORT_HOP_RIGHT",
        reason: `Enemy in immediate stomp zone (${sensors.nearestEnemy.distX}px); deploying short attack hop.`,
        probs: { SHORT_HOP_RIGHT: 0.75, FULL_JUMP_RIGHT: 0.20, SPRINT_RIGHT: 0.05 },
      };
    } else {
      return {
        action: "FULL_JUMP_RIGHT",
        reason: `Enemy patrol ahead (${sensors.nearestEnemy.distX}px); vaulting over hazard.`,
        probs: { FULL_JUMP_RIGHT: 0.80, SHORT_HOP_RIGHT: 0.15, SPRINT_RIGHT: 0.05 },
      };
    }
  }

  // 4. Mystery Block overhead
  if (sensors.nearestBlock && Math.abs(sensors.nearestBlock.distX) < 18) {
    return {
      action: "HIGH_VERTICAL_JUMP",
      reason: "Question block directly overhead; jumping to collect gold coin.",
      probs: { HIGH_VERTICAL_JUMP: 0.70, SPRINT_RIGHT: 0.25, SHORT_HOP_RIGHT: 0.05 },
    };
  }

  // 5. Default: Full speed sprint
  return {
    action: "SPRINT_RIGHT",
    reason: "Clear runway ahead; full acceleration rightward.",
    probs: { SPRINT_RIGHT: 0.85, FULL_JUMP_RIGHT: 0.10, SHORT_HOP_RIGHT: 0.05 },
  };
}
