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
        rawRequest: {
          pipeline: "In-Memory Deterministic Rule Engine",
          evaluation: "Raycast Lookahead Prioritization",
          sensors: {
            pit_dist: sensors.nearestPit ? `${sensors.nearestPit.distX}px` : "solid",
            pipe_dist: sensors.nearestPipe ? `${sensors.nearestPipe.distX}px` : "none",
            goomba_dist: sensors.nearestEnemy ? `${sensors.nearestEnemy.distX}px` : "clear",
          },
        },
        rawResponse: {
          status: "LOCAL RULE EXECUTED",
          action: decision.action,
          rule: decision.reason,
          latency: `${Math.round(elapsed)} ms`,
        },
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

        const trimmedRequest = {
          endpoint: "POST https://api.openai.com/v1/decisions",
          model: "gpt-6-luna",
          input: {
            state: `Mario at (${marioX}, ${marioY}) [${isGrounded ? "Grounded" : "Airborne"}]`,
            pipe: sensors.nearestPipe ? `${sensors.nearestPipe.distX}px ahead (H=${sensors.nearestPipe.height})` : "none",
            goomba: sensors.nearestEnemy ? `${sensors.nearestEnemy.distX}px ahead` : "clear",
            pit: sensors.nearestPit ? `${sensors.nearestPit.distX}px ahead (${sensors.nearestPit.width}px wide)` : "solid",
          },
          question: {
            name: "mario_macro_action",
            type: "choice",
            candidates: choicesPayload.map(c => c.value),
          },
        };

        const trimmedResponse = {
          status: "200 OK",
          decision: {
            choice: chosen,
            confidence: `${(confidence * 100).toFixed(1)}%`,
            probabilities: probs,
          },
          telemetry: {
            input_tokens: inputTokens,
            output_tokens: 0,
            cost: `$${costUsd.toFixed(6)}`,
            latency: `${Math.round(elapsed)} ms`,
          },
        };

        return NextResponse.json({
          chosenAction: chosen,
          confidence: Math.round(confidence * 100) / 100,
          latencyMs: Math.round(elapsed),
          model: "GPT-6 Luna (Decisions API)",
          reasoning: `Decisions API choice: ${chosen} (Confidence: ${(confidence * 100).toFixed(1)}%)`,
          probabilities: probs,
          costUsd: Number(costUsd.toFixed(6)),
          rawRequest: trimmedRequest,
          rawResponse: trimmedResponse,
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
          rawRequest: { endpoint: "POST /v1/decisions", error: `HTTP ${resp.status}` },
          rawResponse: { error: errText.slice(0, 100) },
        } as DecisionResponse);
      }
    }

    // 3. Ollama Local LLMs (e.g. llama3.2:1b, llama3.1:latest, lukey03/qwen3.5-9b-abliterated)
    if (model.startsWith("ollama:") || model.startsWith("ollama/") || model.startsWith("ollama-") || body.provider === "ollama") {
      const ollamaModelName = model.replace(/^ollama[:\/-]/, "");
      const ollamaEndpoint = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

      const systemPrompt = (
        "You are an autonomous AI playing Super Mario Bros World 1-1.\n" +
        "You must select the single best macro-action to survive, avoid pits, jump over pipes, and stomp enemies.\n" +
        "Return ONLY a valid JSON object with keys:\n" +
        "\"action\": one of [\"SPRINT_RIGHT\", \"FULL_JUMP_RIGHT\", \"SHORT_HOP_RIGHT\", \"HIGH_VERTICAL_JUMP\", \"SKID_STOP\", \"WAIT_OBSERVE\"]\n" +
        "\"reasoning\": a brief one-sentence reason."
      );

      const userPrompt = (
        `Mario State: X=${marioX}, Y=${marioY}, Grounded=${isGrounded}\n` +
        `Sensors:\n` +
        `- Nearest Pit: ${sensors.nearestPit ? `${sensors.nearestPit.distX}px ahead (${sensors.nearestPit.width}px wide)` : "Solid ground"}\n` +
        `- Nearest Pipe: ${sensors.nearestPipe ? `${sensors.nearestPipe.distX}px ahead (H=${sensors.nearestPipe.height}px)` : "None"}\n` +
        `- Nearest Enemy: ${sensors.nearestEnemy ? `${sensors.nearestEnemy.distX}px ahead (Goomba)` : "None"}\n` +
        `- Nearest Question Block: ${sensors.nearestBlock ? `${sensors.nearestBlock.distX}px overhead` : "None"}\n\n` +
        `Candidate Actions:\n` +
        actions.map(a => `- ${a.value}: ${a.description}`).join("\n") +
        `\n\nChoose the optimal action right now in JSON format:`
      );

      const trimmedOllamaRequest = {
        endpoint: `POST ${ollamaEndpoint}/api/chat`,
        model: ollamaModelName,
        format: "json",
        context: {
          mario: `(${marioX}, ${marioY}) [${isGrounded ? "Grounded" : "Airborne"}]`,
          pit: sensors.nearestPit ? `${sensors.nearestPit.distX}px` : "solid",
          pipe: sensors.nearestPipe ? `${sensors.nearestPipe.distX}px` : "none",
          enemy: sensors.nearestEnemy ? `${sensors.nearestEnemy.distX}px` : "none",
        },
        candidate_actions: actions.map(a => a.value),
      };

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const resp = await fetch(`${ollamaEndpoint}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: ollamaModelName,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            format: "json",
            stream: false,
            options: {
              temperature: 0.1,
              num_predict: 60,
            }
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const elapsed = performance.now() - t0;

        if (resp.ok) {
          const data = await resp.json();
          let parsed: any = {};
          try {
            parsed = JSON.parse(data.message?.content || "{}");
          } catch {
            parsed = { action: "SPRINT_RIGHT", reasoning: "Parsed raw fallback" };
          }

          const validActions: MacroAction[] = [
            "SPRINT_RIGHT", "FULL_JUMP_RIGHT", "SHORT_HOP_RIGHT", 
            "HIGH_VERTICAL_JUMP", "SKID_STOP", "WAIT_OBSERVE"
          ];
          const chosen: MacroAction = validActions.includes(parsed.action) ? parsed.action : "SPRINT_RIGHT";
          const evalCount = data.eval_count || 15;
          const promptTokens = data.prompt_eval_count || 120;

          const trimmedOllamaResponse = {
            status: "200 OK (Ollama Local)",
            choice: chosen,
            reasoning: parsed.reasoning || "Autonomous local LLM decision",
            telemetry: {
              hardware: "Local GPU / NPU Execution",
              prompt_tokens: promptTokens,
              eval_tokens: evalCount,
              cost: "$0.000000 (Open Source)",
              latency: `${Math.round(elapsed)} ms`,
            },
            raw_text: data.message?.content,
          };

          return NextResponse.json({
            chosenAction: chosen,
            confidence: 0.90,
            latencyMs: Math.round(elapsed),
            model: `Ollama (${ollamaModelName})`,
            reasoning: parsed.reasoning || `Ollama local decision: ${chosen}`,
            probabilities: { [chosen]: 0.90, SPRINT_RIGHT: 0.05, FULL_JUMP_RIGHT: 0.05 },
            costUsd: 0.0,
            rawRequest: trimmedOllamaRequest,
            rawResponse: trimmedOllamaResponse,
          } as DecisionResponse);
        } else {
          // Ollama server error response
          const errText = await resp.text();
          const fallback = runHeuristicPolicy(sensors, actions);
          const elapsed = performance.now() - t0;
          return NextResponse.json({
            chosenAction: fallback.action,
            confidence: 0.82,
            latencyMs: Math.round(elapsed),
            model: `Ollama (${ollamaModelName}) [Fallback: HTTP ${resp.status}]`,
            reasoning: `Ollama returned ${resp.status}: ${errText.slice(0, 50)}. Safe heuristic engaged.`,
            probabilities: fallback.probs,
            costUsd: 0.0,
            rawRequest: trimmedOllamaRequest,
            rawResponse: { error: `HTTP ${resp.status}: ${errText.slice(0, 80)}`, fallback: fallback.action },
          } as DecisionResponse);
        }
      } catch (ollamaErr: any) {
        // Timeout or connection refused
        const fallback = runHeuristicPolicy(sensors, actions);
        const elapsed = performance.now() - t0;
        const isTimeout = ollamaErr.name === "AbortError";
        return NextResponse.json({
          chosenAction: fallback.action,
          confidence: 0.85,
          latencyMs: Math.round(elapsed),
          model: `Ollama (${ollamaModelName}) [${isTimeout ? "Timeout" : "Fallback"}]`,
          reasoning: isTimeout
            ? "Ollama query exceeded 3.5s budget. Executed real-time heuristic jump."
            : `Ollama service unreachable at ${ollamaEndpoint}. Executed real-time fallback.`,
          probabilities: fallback.probs,
          costUsd: 0.0,
          rawRequest: trimmedOllamaRequest,
          rawResponse: {
            status: isTimeout ? "REQUEST_TIMEOUT (3.5s)" : "CONNECTION_REFUSED",
            fallback_action: fallback.action,
            note: "Start Ollama with `ollama serve` or check local port 11434.",
          },
        } as DecisionResponse);
      }
    }

    // 4. Google Gemini Flash (Generative LLM)
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
          rawRequest: { endpoint: "Google Gemini 2.0 Flash", error: "Missing GEMINI_API_KEY" },
          rawResponse: { fallback: fallback.action },
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
        let parsed: any = {};
        try { parsed = JSON.parse(text); } catch { parsed = { action: "SPRINT_RIGHT" }; }
        const chosen = (parsed.action as MacroAction) || "SPRINT_RIGHT";
        return NextResponse.json({
          chosenAction: chosen,
          confidence: 0.92,
          latencyMs: Math.round(elapsed),
          model: "Gemini 2.0 Flash (Google)",
          reasoning: parsed.reasoning || "Gemini Flash structured decision",
          probabilities: { [chosen]: 0.92 },
          costUsd: 0.00002,
          rawRequest: {
            endpoint: "POST generativelanguage.googleapis.com/...:generateContent",
            model: "gemini-2.0-flash",
            format: "application/json",
          },
          rawResponse: {
            status: "200 OK",
            action: chosen,
            reasoning: parsed.reasoning,
            latency: `${Math.round(elapsed)} ms`,
          },
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
          rawRequest: { endpoint: "Google Gemini 2.0 Flash", error: `HTTP ${resp.status}` },
          rawResponse: { fallback: fallback.action },
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
