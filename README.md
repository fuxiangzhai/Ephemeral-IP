# Ephemeral-IP - Abstract Body Network Interactive Art

An interactive body network visualization project implemented using MediaPipe Tasks Vision API. Combines body keypoints with floating particle systems to create unique interactive experiences.

## 🎨 Project Features

- **Full-screen Immersive Experience**: Pure black background creating a mysterious atmosphere
- **Abstract Body Visualization**: Only displays body keypoints and connection lines, with black background
- **Dynamic Floating Particle System**: 20 different colored particles floating on screen
- **Real-time Interaction**: Body nodes collide and connect with floating particles
- **Artistic Title**: "Ephemeral-IP" text subtly displayed in the center of screen

## 🚀 Quick Start

### 🌐 Online Experience

Experience the latest interactive body visualization:
**[https://fuxiangzhai.github.io/Ephemeral-IP/](https://fuxiangzhai.github.io/Ephemeral-IP/)**

### 💻 Local Development

#### 1. Start Local Server

Since ES6 modules (`import`) are used, it must be run through an HTTP server and cannot be opened directly as an HTML file.

**Using Python to start server:**

```bash
# Python 3
python3 -m http.server 8000

# or Python 2
python -m SimpleHTTPServer 8000
```

**Using Node.js to start server:**

```bash
# Install http-server
npm install -g http-server

# Start server
http-server -p 8000
```

#### 2. Access Application

Open in browser:
```
http://localhost:8000
```

## 📋 Feature Description

### Game Interface
- **Full-screen Black Background**: Creates an immersive experience
- **Background Text**: "Ephemeral-IP" subtly displayed in screen center with breathing animation effect
- **Floating Particles**: 80 colorful particles freely floating on screen using 20 different colors

### Body Detection & Interaction
- **Abstract Visualization**: Only displays body keypoints and connection lines, background remains black
- **Real-time Detection**: Uses camera for real-time body pose detection
- **Particle Interaction**:
  - When body keypoints approach floating particles, particles are attracted
  - Connected particles glow and follow body nodes
  - When distance becomes too great, connections break and particles resume free floating
  - Unconnected particles gradually decay and regenerate

### Operation Instructions
1. Click "Enable Camera" button
2. Allow browser to access camera permissions
3. Stand in front of camera, move body to interact with floating particles
4. Observe connection effects between body nodes and particles
