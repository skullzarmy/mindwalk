# 🧠 MindWalk

**Walk through an AI's mind** — an interactive 3D word-cloud game interface
powered by OpenAI.

## What it does

* The AI's last response is parsed into a **3D spatial word cloud** rendered in
  real-time with Three.js (Fibonacci-sphere layout, glowing sprites, star-field
  background, orbital camera).
* **Click any word** → triggers a configurable *"ponder"* prompt and regenerates
  the cloud from the next AI response.
* A **sliding chat panel** (left) shows the full conversation history.
* A **prompt editor panel** (right) lets you edit and save the ponder-prompt
  template (`{WORD}` is replaced with the clicked word).
* A manual text input at the bottom lets you start or redirect the conversation
  at any time.

## Quick start

### 1 · Prerequisites

* Node.js ≥ 18
* An [OpenAI API key](https://platform.openai.com/api-keys)

### 2 · Install

```bash
npm install
```

### 3 · Configure

```bash
cp .env.example .env
# edit .env and set OPENAI_API_KEY
```

### 4 · Develop

```bash
npm run dev
# Vite frontend → http://localhost:5173
# Express API   → http://localhost:3001
```

### 5 · Production build

```bash
npm run build
NODE_ENV=production node server.js
```

## Architecture

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite |
| 3D rendering | Three.js (sprites, OrbitControls, AdditiveBlending) |
| Backend | Express.js (OpenAI proxy, keeps API key server-side) |
| Styling | CSS custom properties, cyberpunk/space game aesthetic |

## Controls

| Action | Result |
|---|---|
| **Click word** | Ponder that word (sends prompt to AI) |
| **Drag** | Orbit the word cloud |
| **Scroll** | Zoom in / out |
| **⚙ PROMPT** | Edit the ponder-prompt template |
| **💬 CHAT** | View full conversation history |
| **Type + EXPLORE** | Send a freeform thought |
