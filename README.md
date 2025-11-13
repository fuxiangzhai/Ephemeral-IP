# Prototype A - Interactive Body Node System

An interactive body node visualization project based on p5.js that explores social connections through abstract representations of human bodies and relationships.

## Features

- **Body Node Structure**: Human body composed of interconnected nodes (head, torso, arms, legs)
- **WASD Controls**: Move the entire body structure using keyboard WASD keys
- **Floating Nodes**: Colorful nodes that float around with random movement and lifespans
- **Interaction Mechanics**:
  - Same color nodes attract and connect when close
  - Different color nodes repel each other
  - **Distance Disconnect**: Connections break automatically if distance exceeds 500 pixels, nodes fade quickly
- **Timer System**: Each floating node has a random lifespan of 15-25 seconds
- **Connection Refresh**: Connecting with same-color nodes resets the timer
- **Disappearance**: Nodes vanish when all connected same-color nodes' timers run out

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
- **JavaScript ES6**: Modern JavaScript syntax
- **HTML5 Canvas**: Graphics drawing

## Project Structure

```
prototype A/
├── index.html      # Main page
├── sketch.js       # Core logic code
└── README.md       # Project documentation
```
