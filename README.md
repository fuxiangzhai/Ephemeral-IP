# Ephemeral-IP - Abstract Body Network Interactive Art

An interactive body network visualization project implemented using MediaPipe Tasks Vision API. Combines body keypoints with floating particle systems to create unique interactive experiences.

## 🎨 Project Features

- **Full-screen Immersive Experience**: Pure black background creating a mysterious atmosphere
- **Abstract Body Visualization**: Only displays body keypoints and connection lines, with black background
- **Dynamic Floating Particle System**: 20 different colored particles floating on screen
- **Real-time Interaction**: Body nodes collide and connect with floating particles
- **Artistic Title**: "Ephemeral-IP" text subtly displayed in the center of screen

## 📚 Official Documentation References

- [MediaPipe Pose Landmarker Web JS Guide](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js?hl=zh-cn#video)
- [MediaPipe Web Setup Guide](https://ai.google.dev/edge/mediapipe/solutions/setup_web?hl=zh-cn)

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

## 🔧 Technical Implementation

### Libraries Used

1. **MediaPipe Tasks Vision** (v0.10.0)
   - Loaded from CDN: `https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0`
   - Provides `PoseLandmarker`, `FilesetResolver` and other classes

### Core Feature Implementation

#### 1. Dual Canvas System
- **Main Canvas (mainCanvas)**: Displays body keypoints and connection lines
- **Particle Canvas (particleCanvas)**: Displays floating particle system
- Two canvases overlay for layered rendering

#### 2. Floating Particle System
```javascript
class Particle {
    // 20 different colored particles
    // Automatic movement and boundary bouncing
    // Lifecycle management (decay and regeneration)
    // Interaction detection with body nodes
}
```

#### 3. Body Node & Particle Interaction
- **Distance Detection**: Calculate distance between body keypoints and particles
- **Connection Mechanism**: Establish connection when distance is less than 60 pixels
- **Physics Effects**: Connected particles are attracted to body nodes
- **Visual Effects**: Connected particles glow and increase in size

#### 4. Abstract Visualization
- Only renders body keypoints and connection lines
- Background remains pure black
- Keypoints use green glow effect
- Important nodes (head, shoulders, hips) are larger and brighter

## 📝 Important Notes

### 1. Module Type
- Code uses ES6 modules (`import/export`)
- HTML must use `<script type="module">` tags
- Must be run through HTTP server, cannot use `file://` protocol

### 2. Model Loading
- Model files loaded from Google Cloud Storage
- Initial loading may take some time
- Requires stable network connection

### 3. Browser Compatibility
- Requires modern browsers that support ES6 modules
- Recommended: Latest versions of Chrome, Firefox, Edge
- Camera functionality requires HTTPS environment (except localhost)

### 4. Performance Optimization
- Uses GPU acceleration (`delegate: "GPU"`)
- Video mode uses `detectForVideo` instead of `detect`
- Rendering loop optimized with `requestAnimationFrame`

## 🐛 Frequently Asked Questions

### Q: Page shows blank?
A: Check browser console for errors. Ensure:
- Running through HTTP server (not opening file directly)
- Network connection is normal (CDN resources need to be loaded)
- Browser supports ES6 modules

### Q: Cannot access camera?
A:
- Ensure browser is allowed to access camera permissions
- Check if other applications are using the camera
- Local development can use HTTP on localhost, production environment requires HTTPS

### Q: Model loading failed?
A:
- Check network connection
- Confirm CDN address is accessible
- View error messages in browser console

### Q: Detection results inaccurate?
A:
- Ensure adequate lighting
- Person clearly visible in frame
- Try adjusting camera angle and distance

## 📖 Learning Resources

- [MediaPipe Official Documentation](https://ai.google.dev/edge/mediapipe)
- [MediaPipe GitHub](https://github.com/google/mediapipe)
- [Web API Documentation](https://developer.mozilla.org/en-US/docs/Web/API)

## 📄 License

This project is based on Apache License 2.0, consistent with MediaPipe official examples.

## 🔧 Troubleshooting

If the page shows blank, black screen after camera starts, or detection errors occur, follow these troubleshooting steps:

### 1. Basic Function Tests
- **Test Particles**: Click "Test Particles" button to confirm particle system is working (should show colored dots on screen)
- **Test Detection**: Click "Test Detection" button to confirm MediaPipe detection function is working

### 2. Common Errors & Solutions

#### Detection Error
```
Detection Error: WebGL context lost
```
**Cause**: WebGL context lost, usually due to insufficient memory
**Solution**: Close other browser tabs to free up memory

#### Video Not Ready
```
Video not ready, skipping detection
```
**Cause**: Camera permission issues or video stream not ready
**Solution**:
- Ensure browser is allowed camera access
- Check if camera is being used by other applications
- Refresh page and retry

#### PoseLandmarker Not Initialized
```
PoseLandmarker not initialized, skipping detection
```
**Cause**: MediaPipe library loading failed
**Solution**:
- Check network connection
- Refresh page to reload libraries
- Check browser console for CDN loading errors

#### Continuous Errors Auto-stop
```
Too many detection errors (5), stopping camera detection
```
**Cause**: 5 consecutive detection failures, app auto-stops for protection
**Solution**:
- Check causes of common errors above
- Refresh page to restart
- View detailed error information in console

### 3. Browser Settings

#### Enable Hardware Acceleration
- **Chrome**: Settings → Advanced → System → ✅ Use hardware acceleration
- **Firefox**: about:config → `webgl.force-enabled` → Set to true
- **Edge**: Settings → System → ✅ Use hardware acceleration

#### Camera Permissions
- **Chrome**: Click 🔒 icon in address bar → Camera → Allow
- **Firefox**: Click 🛡️ icon → Allow camera
- **Edge**: Permission icon → Allow camera access

### 4. Compatibility Check
- Visit `webgl-test.html` to check WebGL support
- Visit `camera-test.html` to check camera functionality
- Use modern browsers (latest versions of Chrome, Firefox, Edge)

### 5. Debug Steps
1. Open browser console (F12)
2. Refresh page, observe loading process
3. Click test buttons to confirm function status
4. View console error messages
5. Fix issues based on specific errors

## 🔄 Changelog

- **v1.0.0** (2024)
  - Implemented using official MediaPipe Tasks Vision API
  - Supports image and video real-time detection
  - Complete Chinese interface and error handling
  - Particle system and body interaction features
