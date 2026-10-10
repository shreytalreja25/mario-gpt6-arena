# 🍄 Cyber-Mario AI Arena: Autonomous GPT-6 Decision Agent

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.4-black?logo=next.js)](https://nextjs.org)
[![OpenAI Decisions API](https://img.shields.io/badge/OpenAI-GPT--6_Luna_Decisions_API-10a37f?logo=openai)](https://platform.openai.com/decisions)
[![Vercel Edge](https://img.shields.io/badge/Vercel-Edge_Functions-000000?logo=vercel)](https://vercel.com)
[![Web Audio API](https://img.shields.io/badge/Sound-8--Bit_Web_Audio_Synth-f59e0b)](#)

A real-time, autonomous AI showcase where **OpenAI's GPT-6 Luna (Decisions API)**, **Google Gemini 2.0 Flash**, and **deterministic heuristic baselines** play **Super Mario Bros Level 1-1** live in the browser. 

Powered by a client-side HTML5 Canvas physics engine, Vercel Serverless/Edge decision routing, and a retro-cyberpunk telemetry dashboard.

---

## ⚡ Live Features

- **🎮 Full Client-Side HTML5 Canvas Game Engine**: Runs 100% in the browser at 60 FPS without server GPU requirements or ROM dependencies. Authentic physics: acceleration, friction, variable jump impulse, tile collision, mystery coin blocks, Goomba stomping, pits, and the iconic flagpole!
- **🧠 Macro-Action AI Decision Pipeline**: Solves the classic cloud latency dilemma by executing high-level physical macro-actions (`SPRINT_RIGHT`, `FULL_JUMP_RIGHT`, `SHORT_HOP_RIGHT`, `HIGH_VERTICAL_JUMP`, `SKID_STOP`, `WAIT_OBSERVE`) over 20–30 frame physics burst windows.
- **⚡ OpenAI Decisions API Integration**: Uses `POST /v1/decisions` with `gpt-6-luna` for zero-output-token typed choices, sub-second latency, and probability distributions.
- **📊 Real-Time Cyberpunk Telemetry HUD**:
  - Live probability distributions across all 6 candidate actions.
  - Lookahead sensor raycasting (detecting upcoming pipes, pits, Goombas, and coin blocks in real-time).
  - ASCII visual slice grid passed to the model.
  - Live P50 latency counter, coin tally, distance meter, and operational token cost tracker.
- **🕹️ Co-Op / Manual Takeover**: Toggle between Autonomous AI and manual keyboard control at any millisecond (`→` sprint, `←` skid, `Z`/`Space` full jump, `X` short hop).
- **🔊 8-Bit Web Audio Synthesizer**: Pure procedural Web Audio API sound effects (jump, coin collect, Goomba stomp, death, and victory fanfare).
- **📺 Retro CRT Shader**: Optional scanline shader and CRT shadow vignette filter.

---

## 🚀 Quickstart & Local Setup

### 1. Clone & Install
```bash
git clone https://github.com/shreytalreja25/mario-gpt6-arena.git
cd mario-gpt6-arena
npm install
```

### 2. Configure API Keys
Create a `.env.local` file in the root directory:
```env
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ 1-Click Vercel Deployment

This project is built with Next.js App Router and is 100% configured for zero-setup deployment on **Vercel**:

1. Push this repository to your GitHub account.
2. Go to [Vercel Dashboard](https://vercel.com) $\to$ **Add New Project** $\to$ Select this repository.
3. In **Environment Variables**, add:
   - `OPENAI_API_KEY`: Your OpenAI API key (for GPT-6 Luna Decisions API).
   - `GEMINI_API_KEY`: *(Optional)* Your Google AI Studio API key.
4. Click **Deploy**. Your live Mario AI arena will be active globally on Vercel's edge network!

---

## 📐 System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER (60 FPS)                         │
│                                                                        │
│   Canvas 2D Physics Engine       Retro Web Audio Synth   CRT Shader    │
│   - Mario Kinematics             - Procedural 8-bit      - Scanlines   │
│   - Goomba Patrol & Stomp        - Jump / Coin / Stomp   - Neon HUD    │
│   - Lookahead Sensor Rays                                              │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │
                         State JSON │ Macro Action Choice
                                    │ (e.g. FULL_JUMP_RIGHT, 77%)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      VERCEL SERVERLESS / EDGE API                      │
│                         (/api/decision route)                          │
│                                                                        │
│   ┌────────────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│   │  OpenAI Decisions API  │  │  Google Gemini  │  │   Heuristic    │  │
│   │      (gpt-6-luna)      │  │   Flash (JSON)  │  │     Solver     │  │
│   │   Zero Output Tokens   │  │  Cloud Fallback │  │   <1ms Baseline│  │
│   └────────────────────────┘  └─────────────────┘  └────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🕹️ Controls

| Key | Action |
|---|---|
| `→` (Right Arrow) | Sprint Right (Max acceleration) |
| `←` (Left Arrow) | Skid Brake (Cancel momentum) |
| `Z` or `Space` | Full Height Jump (Clear high pipes / wide pits) |
| `X` | Short Hop (Precision Goomba stomp) |
| `Pause / Resume` | Pause or resume simulation |
| `2x Turbo` | Accelerate physics simulation clock |
| `Sensor Rays` | Toggle AI lookahead targeting lines on canvas |

---

## 📄 License
MIT License. Built for the autonomous agent community.
