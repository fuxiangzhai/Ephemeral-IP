# Ephemeral-IP

An interactive body-particle interaction system that combines computer vision with dynamic particle physics. Experience real-time body tracking and intelligent particle behaviors in a minimalist, immersive environment.

## ✨ Features

- **Minimalist Body Tracking**: Simplified pose detection focusing on essential keypoints
- **Smart Particle System**: 26 distinct colored particles with intelligent behaviors
- **Color-Based Interactions**: Particles respond differently based on color matching
- **Magnetic Absorption**: Same-color particles get pulled toward and absorbed by body nodes
- **Repulsive Forces**: Different-color particles create dynamic repulsion effects
- **Real-time Processing**: Smooth 60fps performance with MediaPipe Vision API

## 🚀 Quick Start

### 🌐 Live Demo

Experience the interactive visualization online:
**[https://fuxiangzhai.github.io/Ephemeral-IP/](https://fuxiangzhai.github.io/Ephemeral-IP/)**

### 💻 Local Development

#### Start Local Server

The project uses ES6 modules and requires a local HTTP server:

**Python 3:**
```bash
python3 -m http.server 8000
```

**Node.js:**
```bash
npx http-server -p 8000
```

#### Open in Browser

Navigate to: `http://localhost:8000`

## 🎮 How It Works

### Interface
- **Full-screen Experience**: Immersive black canvas
- **Minimalist Design**: Clean, distraction-free interaction space

### Body Detection
- **Simplified Tracking**: Focuses on nose and right shoulder keypoints
- **Color-Coded Nodes**: 6 distinct colors representing different body parts
- **Smooth Rendering**: Position smoothing reduces jitter

### Particle Interactions

**Same Color Attraction:**
- Particles matching body node colors are magnetically attracted
- Connection forms with glowing visual effects
- 3-second connection triggers absorption sequence
- Body nodes grow larger as they absorb particles

**Different Color Repulsion:**
- Mismatched particles create repulsive forces
- Dynamic collision effects when particles get too close
- Maintains spatial separation between incompatible elements

### Visual Effects
- **Connection Lines**: Glowing connections between attracted particles
- **Absorption Animation**: Particles smoothly merge into body nodes
- **Size Dynamics**: Body nodes scale based on absorbed particles
- **Particle Lifecycle**: Automatic regeneration and decay cycles

## 🎯 Controls

1. Click "Enable Camera" to start pose detection
2. Grant camera permissions when prompted
3. Position yourself in frame for optimal tracking
4. Move your body to influence particle behaviors
5. Watch as particles respond to your movements

## 🛠️ Technical Details

### Libraries
- **MediaPipe Tasks Vision**: Real-time pose estimation
- **HTML5 Canvas**: Hardware-accelerated rendering
- **Vanilla JavaScript**: No external dependencies

### Performance
- Optimized for 60fps on modern devices
- Efficient particle physics calculations
- Minimal memory footprint
- WebGL-accelerated pose detection
