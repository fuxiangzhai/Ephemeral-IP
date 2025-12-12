# Ephemeral-IP

An interactive experiment that blends pose tracking, particle physics, and multiple artistic “body” presets. It supports real-time body tracking, particle absorption/repulsion, username bubbles, and several visual styles.

## ✨ Key Features
- **Real-time pose tracking**: MediaPipe Tasks Vision, focusing on 5 keypoints (nose, left shoulder, right wrist, left foot, right ankle).
- **Body presets (random each spawn)**: `tri_glass` (glass triangles), `spring` (springs), `tube` (dual-layer glass tubes), `goo` (central goo shape fit), `dots` (dot chains).
- **Particle system**: 7 colors for free particles (5 body colors + 2 extras), with collision, attraction/repulsion, gravity collapse, and respawn.
- **Random body colors**: The 5 body colors are shuffled every spawn; body spheres use 3D glassy shading.
- **Usernames & speech bubbles**: Free particles can pick up historical usernames; when connecting, they exchange English greetings plus “I was here X minute(s) ago.”
- **Name database**: Up to 50 historical names, circular buffer; particles won’t reuse names already in the scene.
- **Lifespan & respawn**: Body groups fade out in 15–25s; when all expire, the body dies, particles collapse, and respawn after 15s.
- **Debug control**: “Instant Death” button to immediately kill the current body and trigger respawn cooldown.
- **UI toggle**: Spacebar hides/shows the control buttons.

## 🚀 Quick Start
### Live Demo
[https://fuxiangzhai.github.io/Ephemeral-IP/](https://fuxiangzhai.github.io/Ephemeral-IP/)

### Run Locally
1) Start a local HTTP server (ES6 modules required):
   - Python 3:
     ```bash
     python3 -m http.server 8000
     ```
   - Node.js:
     ```bash
     npx http-server -p 8000
     ```
2) Open `http://localhost:8000` in your browser.

## 🎮 Controls
- **Start Camera**: Toggle camera and tracking.
- **Instant Death**: Immediately kill the current body (useful for quick respawn tests).
- **Space**: Hide/show the controls UI.

## 🧠 How It Works
- **Preset selection**: Each `startNewBodySession` cycles and random-picks from the preset list (logged as `[Body Preset] ...` in console).
- **Node timers**: Each body color group lives 15–25s; when all are expired, the body is considered dead.
- **Respawn**: 15s cooldown after death; colors, preset, username, foot offsets, and hand blends are refreshed.
- **Particles**: Free-floating, collide, respawn on bounds; connected ones can collapse with gravity on body death.
- **Usernames & greetings**: A free particle picks a name with probability `1.5% * existing_names` (capped by availability). Names already in-scene are skipped. Greetings are English and include “I was here X minute(s) ago.”

## 🛠️ Tech Stack
- MediaPipe Tasks Vision (Pose)
- HTML5 Canvas
- Vanilla JavaScript

## ⚙️ Performance Notes
- Optimized for 60fps on modern browsers.
- If performance drops, lower resolution or reduce `particleCount`.

## 📜 License
For course/experimental use. Follow the repository license.***

