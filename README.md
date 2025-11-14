# Prototype A - Body Node Interaction System

This is an interactive body node visualization project based on p5.js that explores social connections through abstract representations of human bodies and relationships.

## Features

- **Real-time Pose Detection**: Advanced MediaPipe Pose with 33 keypoints for precise body tracking
- **Interactive Body Nodes**: Live camera-based human pose converted to interactive nodes
- **Dual Control System**: Automatic pose tracking with WASD keyboard fallback
- **Dynamic Node System**: Colorful floating nodes with AI-driven behaviors
- **Smart Interactions**:
  - Same color nodes attract and connect when close
  - Different color nodes repel each other
  - **Distance Disconnect**: Connections break automatically if distance exceeds 80 pixels, nodes fade quickly
- **Growth Mechanics**: Nodes get absorbed after 5 seconds connection, body nodes grow larger
- **Confidence-based Rendering**: Node transparency adjusts based on pose detection confidence

## Online Experience

Experience the interactive visualization directly in your browser: [https://fuxiangzhai.github.io/Ephemeral-IP/](https://fuxiangzhai.github.io/Ephemeral-IP/)

Or run locally:
1. Download the project files
2. Start a local server:
   ```bash
   python3 -m http.server 8000
   ```
3. Open in browser:
   ```
   http://localhost:8000
   ```

The experience automatically adapts to full screen and supports window resizing.

## Controls

- **WASD Keys**: Move the body node structure
  - **W**: Move up
  - **S**: Move down
  - **A**: Move left
  - **D**: Move right
  - **Combination Keys**: Press multiple keys simultaneously for diagonal movement (WD, WA, SA, SD)
- Natural deceleration with friction
- Boundary constraints prevent moving outside screen limits
- **Full-screen Support**: Automatically adapts to browser window size

## Visual Effects

- **Body Nodes**: Large colorful circular nodes without borders, representing human body structure
- **Floating Nodes**: Diverse closed shapes (circles, ellipses, triangles, squares, pentagons) of varying sizes without borders, representing different people
- Pulsing connection lines
- Node transparency changes over time
- New nodes spawn automatically at regular intervals

## Tech Stack

- **p5.js**: Graphics rendering and interaction
- **MediaPipe Pose**: Real-time pose estimation with 33 keypoints
- **JavaScript ES6**: Modern JavaScript syntax
- **HTML5 Canvas**: Graphics drawing
- **WebRTC Camera API**: Real-time video capture

## Project Structure

```
prototype A/
├── index.html      # Main page
├── sketch.js       # Core logic code
└── README.md       # Project documentation
```
