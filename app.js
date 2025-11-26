import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

// 获取DOM元素
const mainCanvas = document.getElementById("mainCanvas");
const particleCanvas = document.getElementById("particleCanvas");
const video = document.getElementById("webcam");
const webcamButton = document.getElementById("webcamButton");
const loadingText = document.getElementById("loading");

// 摄像头预览元素
const cameraPreview = document.getElementById("cameraPreview");
const previewVideo = document.getElementById("previewVideo");
const previewCanvas = document.getElementById("previewCanvas");
const previewCtx = previewCanvas.getContext("2d");

const mainCtx = mainCanvas.getContext("2d");
const particleCtx = particleCanvas.getContext("2d");

// 设置画布大小
function resizeCanvases() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    mainCanvas.width = width;
    mainCanvas.height = height;
    particleCanvas.width = width;
    particleCanvas.height = height;

    // 设置预览画布大小
    updatePreviewSize();
}

// 更新预览画布大小
function updatePreviewSize() {
    if (cameraPreview.style.display !== 'none') {
        const previewSize = Math.min(window.innerWidth, window.innerHeight) / 4; // 改为1/4
        previewCanvas.width = previewSize;
        previewCanvas.height = previewSize;
    }
}

resizeCanvases();
window.addEventListener('resize', () => {
    resizeCanvases();
    initParticles(); // 窗口resize时重新初始化粒子
});

// MediaPipe相关
let poseLandmarker = undefined;
let runningMode = "VIDEO";
let webcamRunning = false;

// 漂浮点系统 - 使用20+种颜色
const particleColors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
    '#F8B739', '#E74C3C', '#3498DB', '#2ECC71', '#F39C12',
    '#9B59B6', '#1ABC9C', '#E67E22', '#34495E', '#E91E63',
    '#FF4444', '#44FF44', '#4444FF', '#FFFF44', '#FF44FF', '#44FFFF'
];

class Particle {
    constructor() {
        this.x = Math.random() * particleCanvas.width;
        this.y = Math.random() * particleCanvas.height;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.color = particleColors[Math.floor(Math.random() * particleColors.length)];
        this.size = Math.random() * 6 + 3; // 增大尺寸，从3-9像素
        this.alpha = Math.random() * 0.6 + 0.4; // 增大透明度，从0.4-1.0
        this.life = 1;
        this.decayRate = 0.001 + Math.random() * 0.002;
        this.connected = false;
        this.connectionTime = 0;
        this.connectedBodyIndex = -1; // 连接到的身体节点索引
        this.absorbed = false; // 是否已被吸收
        this.absorbing = false; // 是否正在被吸收
        this.absorbProgress = 0; // 吸收进度 (0-1)
        this.targetBodyX = 0; // 目标身体节点X坐标
        this.targetBodyY = 0; // 目标身体节点Y坐标
        this.assimilatedGroup = null; // 加入身体后的颜色组
    }

    update() {
        // 移动
        this.x += this.vx;
        this.y += this.vy;

        // 边界反弹
        if (this.x < 0 || this.x > particleCanvas.width) {
            this.vx *= -1;
            this.x = Math.max(0, Math.min(particleCanvas.width, this.x));
        }
        if (this.y < 0 || this.y > particleCanvas.height) {
            this.vy *= -1;
            this.y = Math.max(0, Math.min(particleCanvas.height, this.y));
        }

        // 如果正在被吸收，执行吸收动画
        if (this.absorbing) {
            this.absorbProgress += 0.008; // 吸收进度增加 - 更慢的速度（125帧完成）

            if (this.absorbProgress >= 1) {
                // 吸收完成，重生为新粒子
                removeParticleFromGroups(this);
                this.x = Math.random() * particleCanvas.width;
                this.y = Math.random() * particleCanvas.height;
                this.vx = (Math.random() - 0.5) * 0.5;
                this.vy = (Math.random() - 0.5) * 0.5;
                this.color = particleColors[Math.floor(Math.random() * particleColors.length)];
                this.size = Math.random() * 6 + 3;
                this.alpha = Math.random() * 0.6 + 0.4;
                this.life = 1;
                this.decayRate = 0.001 + Math.random() * 0.002;
                this.connected = false;
                this.connectionTime = 0;
                this.connectedBodyIndex = -1;
                this.absorbed = false;
                this.absorbing = false;
                this.absorbProgress = 0;
                this.targetBodyX = 0;
                this.targetBodyY = 0;
                this.assimilatedGroup = null;
                return;
            }

            // 在吸收过程中向身体节点移动
            const dx = this.targetBodyX - this.x;
            const dy = this.targetBodyY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 0.5) {
                // 向目标移动 - 动态速度，根据距离调整
                let speed;
                if (distance > 10) {
                    speed = 0.15; // 远距离快速接近
                } else if (distance > 2) {
                    speed = 0.08 * (1 - this.absorbProgress * 0.3); // 中距离减速
                } else {
                    speed = 0.2 * (1 - this.absorbProgress); // 近距离快速融合
                }

                this.vx = (dx / distance) * speed;
                this.vy = (dy / distance) * speed;
            } else {
                // 非常接近时，直接设置到目标位置
                this.x = this.targetBodyX;
                this.y = this.targetBodyY;
                this.vx = 0;
                this.vy = 0;
            }

            // 只在最后时刻快速融入 - 不变小，只变透明
            if (this.absorbProgress > 0.7) {
                // 最后30%的进度开始快速淡化
                const fadeRate = (this.absorbProgress - 0.7) / 0.3 * 0.15;
                this.alpha *= (1 - fadeRate);
                this.alpha = Math.max(0.1, this.alpha);
            }

            return;
        }

        // 如果没有连接，逐渐衰减
        if (!this.connected) {
            this.life -= this.decayRate;
            if (this.life <= 0) {
                // 重生
                removeParticleFromGroups(this);
                this.x = Math.random() * particleCanvas.width;
                this.y = Math.random() * particleCanvas.height;
                this.life = 1;
                this.alpha = Math.random() * 0.5 + 0.3;
                this.assimilatedGroup = null;
            }
        } else {
            // 连接的粒子保持活力
            this.life = Math.min(1, this.life + 0.02);
            this.connectionTime++;
        }

        this.alpha = this.life;
    }

    draw(ctx) {
        ctx.save();
        const groupAlpha =
            this.assimilatedGroup !== null ? getGroupFadeAlpha(this.assimilatedGroup) : 1;
        ctx.globalAlpha = this.alpha * groupAlpha;

        if (this.absorbing) {
            // 吸收中的粒子有融合发光效果
            const fusionIntensity = 1 + Math.sin(this.absorbProgress * Math.PI * 6) * 0.3; // 快速脉冲
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 15 * fusionIntensity;
        } else if (this.connected) {
            // 连接的粒子发光
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 15;
        }

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// 创建漂浮点
const particles = [];
const particleCount = 25;

// 初始化粒子（在画布resize之后）
function initParticles() {
    particles.length = 0; // 清空现有粒子
    
    // 确保画布大小正确
    if (particleCanvas.width === 0 || particleCanvas.height === 0) {
        resizeCanvases();
    }
    
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }
    
    console.log('粒子初始化完成，数量:', particles.length, '画布大小:', particleCanvas.width, 'x', particleCanvas.height);
}

// 确保画布resize后再初始化粒子
resizeCanvases();
initParticles();

// 身体关键点
let currentLandmarks = [];
let currentWorldLandmarks = [];

// 身体节点大小跟踪（吸收粒子后会变大）
let bodyNodeSizes = {};
const BASE_BODY_NODE_SIZE = 12; // 基础大小
const MAX_BODY_NODE_SIZE = 30; // 最大大小

// 位置平滑缓存，用于减少抖动
let smoothedLandmarks = {};
const SMOOTHING_FACTOR = 0.95; // 平滑因子 (0-1, 越大越平滑)

// 应用位置平滑以减少抖动
function applySmoothing(currentLandmarks) {
    const smoothed = [];

    currentLandmarks.forEach((landmark, index) => {
        if (!smoothedLandmarks[index]) {
            // 第一次检测到这个关键点，直接使用当前位置
            smoothedLandmarks[index] = {
                x: landmark.x,
                y: landmark.y,
                visibility: landmark.visibility || 1
            };
        } else {
            // 应用指数移动平均平滑
            const prev = smoothedLandmarks[index];
            smoothedLandmarks[index] = {
                x: prev.x * SMOOTHING_FACTOR + landmark.x * (1 - SMOOTHING_FACTOR),
                y: prev.y * SMOOTHING_FACTOR + landmark.y * (1 - SMOOTHING_FACTOR),
                visibility: landmark.visibility || 1
            };
        }
        smoothed[index] = smoothedLandmarks[index];
    });

    return smoothed;
}

// 初始化MediaPipe
const createPoseLandmarker = async () => {
    try {
        loadingText.textContent = '正在加载 MediaPipe 模型...';
        
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        
        loadingText.textContent = '正在初始化 PoseLandmarker...';
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
                delegate: "GPU"
            },
            runningMode: runningMode,
            numPoses: 1,
            outputSegmentationMasks: false
        });
        
        loadingText.textContent = 'Model loading complete! Click to start camera.';
        console.log('PoseLandmarker Initialization completed!');
        
    } catch (error) {
        console.error('PoseLandmarker initialization failed:', error);
        loadingText.textContent = 'Loading failed:' + error.message;
    }
};

createPoseLandmarker();

// 摄像头控制
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

if (hasGetUserMedia()) {
    webcamButton.addEventListener("click", enableCam);
} else {
    webcamButton.disabled = true;
    webcamButton.textContent = "The browser does not support the camera";
}

function enableCam() {
    if (!poseLandmarker) {
        alert("The model is still loading, please wait...");
        return;
    }

    if (webcamRunning) {
        webcamRunning = false;
        webcamButton.textContent = "Start Camera";

        // 取消动画帧
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        // 停止视频流
        if (video.srcObject) {
            const tracks = video.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            video.srcObject = null;
        }

        // 停止预览视频流
        if (previewVideo.srcObject) {
            const tracks = previewVideo.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            previewVideo.srcObject = null;
        }

        // 隐藏摄像头预览
        cameraPreview.style.display = 'none';

        // 清空主画布（透明背景）
        mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        currentLandmarks = [];

        // 重置所有粒子的连接状态
        particles.forEach(particle => {
            particle.connected = false;
            particle.connectionTime = 0;
            particle.assimilatedGroup = null;
            removeParticleFromGroups(particle);
        });

        // 重置颜色组计时器
        resetBodyGroupTimers();

        // 重置错误计数器
        detectionErrorCount = 0;

        // 重新启动animate循环
        if (!animateFrameId) {
            animate();
        }
    } else {
        webcamRunning = true;
        webcamButton.textContent = "Stop Camera";
        loadingText.textContent = '';
        resetBodyGroupTimers();

        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        navigator.mediaDevices.getUserMedia(constraints)
            .then((stream) => {
                console.log("Camera permissions obtained successfully");

                // 设置主视频流（用于检测）
                video.srcObject = stream;

                // 设置预览视频流（用于显示）
                previewVideo.srcObject = stream.clone();

                // 显示摄像头预览
                cameraPreview.style.display = 'block';
                updatePreviewSize();

                // 直接开始检测，不依赖事件监听器
                video.addEventListener("loadeddata", () => {
                    console.log("视频加载完成，开始检测");
                    console.log("视频尺寸:", video.videoWidth, "x", video.videoHeight);
                    console.log("画布尺寸:", mainCanvas.width, "x", mainCanvas.height);

                    // 重置错误计数器
                    detectionErrorCount = 0;

                    // 停止animate循环，避免冲突
                    if (animateFrameId) {
                        cancelAnimationFrame(animateFrameId);
                        animateFrameId = null;
                    }

                    // 立即开始预测循环
                    lastVideoTime = -1; // 重置时间戳
                    predictWebcam();
                });

                // 如果视频已经准备好，立即开始
                if (video.readyState >= 2) {
                    console.log("视频已准备好，立即开始检测");
                    lastVideoTime = -1; // 重置时间戳
                    predictWebcam();
                }
            })
            .catch((error) => {
                console.error("无法访问摄像头:", error);
                alert("无法访问摄像头: " + error.message);
                webcamRunning = false;
                webcamButton.textContent = "启动摄像头";
            });
    }
}


// 存储身体节点与粒子之间的连线
let bodyParticleConnections = [];

// 检测身体节点与漂浮点的互动
function checkParticleInteractions(landmarks) {
    if (!landmarks || landmarks.length === 0) return;

    // 重置连线数组
    bodyParticleConnections = [];

    // 减少调试信息的频率
    if (Math.random() < 0.05) { // 5%的几率输出调试信息
        console.log('检查粒子互动，关键点数量:', landmarks.length);
    }

    // 重置身体节点大小（每次检测都重新计算）
    bodyNodeSizes = {};

    // 使用平滑后的位置进行粒子互动计算
    const smoothed = applySmoothing(landmarks);

    smoothed.forEach((landmark, index) => {
        // 将归一化坐标转换为画布坐标
        const x = landmark.x * mainCanvas.width;
        const y = landmark.y * mainCanvas.height;

        // 初始化身体节点大小
        if (!bodyNodeSizes[index]) {
            bodyNodeSizes[index] = BASE_BODY_NODE_SIZE;
        }

        // 获取身体节点的颜色
        let bodyNodeColor = '#FFFFFF'; // 默认白色
        for (const group of Object.values(POSE_GROUPS)) {
            if (group.indices.includes(index)) {
                bodyNodeColor = POSE_COLORS[group.colorIndex];
                break;
            }
        }
        const colorIndex = getColorIndexFromHex(bodyNodeColor);

        particles.forEach(particle => {
            if (particle.assimilatedGroup !== null && particle.assimilatedGroup !== colorIndex) {
                return;
            }

            const dx = x - particle.x;
            const dy = y - particle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const connectDistance = 90; // 连接距离
            const repulsionDistance = 80; // 排斥距离
            const disconnectDistance = 1000; // 断开连接的最大距离

            if (particle.color === bodyNodeColor) {
                // 颜色匹配：吸引和连接逻辑
                if (distance < connectDistance) {
                    if (!particle.connected) {
                        particle.connected = true;
                        particle.connectionTime = 0;
                        particle.connectedBodyIndex = index;
                        if (Math.random() < 0.02) { // 2%的几率输出连接信息
                            console.log('粒子连接到身体节点，距离:', distance.toFixed(1), '颜色匹配');
                        }
                    }

                    if (particle.connected && particle.connectedBodyIndex === index) {
                        if (particle.assimilatedGroup === null) {
                            particle.assimilatedGroup = colorIndex;
                        }

                        // 连接即刷新对应组的计时器
                        refreshBodyGroup(colorIndex, particle);

                        // 吸引粒子向身体节点
                        const force = 0.03;
                        particle.vx += (dx / distance) * force;
                        particle.vy += (dy / distance) * force;

                        // 添加科技风连线
                        bodyParticleConnections.push({
                            bodyX: x,
                            bodyY: y,
                            particleX: particle.x,
                            particleY: particle.y,
                            color: particle.color,
                            alpha: Math.max(0.3, 1 - distance / connectDistance),
                            connectionTime: particle.connectionTime,
                            bodyColorIndex: colorIndex
                        });

                        // 检查是否需要吸收（连接超过3秒，约180帧）
                        if (particle.connectionTime > 180 && !particle.absorbing && !particle.absorbed) {
                            particle.absorbing = true;
                            particle.targetBodyX = x; // 设置目标身体节点位置
                            particle.targetBodyY = y;
                            // 身体节点变大
                            bodyNodeSizes[index] = Math.min(MAX_BODY_NODE_SIZE, bodyNodeSizes[index] + 1.5);
                            if (Math.random() < 0.05) { // 5%的几率输出吸收信息
                                console.log('粒子开始被身体节点吸收，身体节点大小增加到:', bodyNodeSizes[index]);
                            }
                        }
                    }
                } else if (distance > disconnectDistance) {
                    // 距离太远，断开连接
                    if (particle.connected && particle.connectedBodyIndex === index) {
                        particle.connected = false;
                        particle.connectionTime = 0;
                        particle.connectedBodyIndex = -1;
                        if (Math.random() < 0.01) { // 1%的几率输出断开信息
                            console.log('粒子断开连接，距离:', distance.toFixed(1));
                        }
                    }
                }
            } else {
                // 颜色不匹配：排斥逻辑
                if (distance < repulsionDistance) {
                    // 产生排斥力
                    const force = 0.02 * (1 - distance / repulsionDistance);
                    particle.vx -= (dx / distance) * force;
                    particle.vy -= (dy / distance) * force;

                    // 如果太近，增加额外冲击力
                    if (distance < 30) {
                        const impactForce = 0.1;
                        particle.vx -= (dx / distance) * impactForce;
                        particle.vy -= (dy / distance) * impactForce;
                    }
                }

                // 断开任何可能的连接（如果颜色改变了）
                if (particle.connected && particle.connectedBodyIndex === index) {
                    particle.connected = false;
                    particle.connectionTime = 0;
                    particle.connectedBodyIndex = -1;
                }
            }

            // 限制速度
            const maxSpeed = 2.0;
            const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
            if (speed > maxSpeed) {
                particle.vx = (particle.vx / speed) * maxSpeed;
                particle.vy = (particle.vy / speed) * maxSpeed;
            }
        });
    });
}

// MediaPipe Pose关键点颜色分组 (6种差异较大的颜色)
const POSE_COLORS = [
    '#FF4444', // 颜色1 - 鲜红色 (头部)
    '#44FF44', // 颜色2 - 鲜绿色 (右胳膊)
    '#4444FF', // 颜色3 - 鲜蓝色 (左胳膊)
    '#FFFF44', // 颜色4 - 亮黄色 (腰部)
    '#FF44FF', // 颜色5 - 品红色 (左腿)
    '#44FFFF'  // 颜色6 - 青色 (右腿)
];

// 关键点分组定义 (只保留指定的关键点)
const POSE_GROUPS = {
    head: { indices: [0], colorIndex: 0, name: '头部' },
    rightArm: { indices: [12, 14, 16, 18], colorIndex: 1, name: '右胳膊' },
    leftArm: { indices: [11, 13, 15, 17], colorIndex: 2, name: '左胳膊' },
    waist: { indices: [23, 24], colorIndex: 3, name: '腰部' },
    rightLeg: { indices: [25, 27, 31], colorIndex: 4, name: '右腿' },
    leftLeg: { indices: [26, 28, 32], colorIndex: 5, name: '左腿' }
};

// 身体颜色组的褪色与成员追踪
const GROUP_FADE_DURATION = 5 * 60 * 1000; // 5分钟
const bodyGroupTimers = POSE_COLORS.map(() => ({
    lastRefresh: performance.now(),
    particles: new Set()
}));

function refreshBodyGroup(colorIndex, particle) {
    const state = bodyGroupTimers[colorIndex];
    state.lastRefresh = performance.now();
    if (particle) {
        state.particles.add(particle);
    }
}

function resetBodyGroupTimers() {
    const now = performance.now();
    bodyGroupTimers.forEach(state => {
        state.lastRefresh = now;
        state.particles.clear();
    });
}

function getGroupFadeAlpha(colorIndex) {
    const elapsed = performance.now() - bodyGroupTimers[colorIndex].lastRefresh;
    if (elapsed <= 0) return 1;
    if (elapsed >= GROUP_FADE_DURATION) return 0;
    return 1 - (elapsed / GROUP_FADE_DURATION);
}

function removeParticleFromGroups(particle) {
    bodyGroupTimers.forEach(state => state.particles.delete(particle));
}

function getColorIndexFromHex(color) {
    return POSE_COLORS.indexOf(color);
}

// 自定义连接线 (只保留指定关键点之间的连接)
const CUSTOM_CONNECTIONS = [
    // 右胳膊连接
    [12, 14], [14, 16], [16, 18],
    // 左胳膊连接
    [11, 13], [13, 15], [15, 17],
    // 腰部连接
    [23, 24],
    // 右腿连接 (从腰部开始)
    [24, 25], [25, 27], [27, 31],
    // 左腿连接 (从腰部开始)
    [23, 26], [26, 28], [28, 32]
];

// 绘制身体特征点（透明背景，只显示指定的关键点）
function drawLandmarks(landmarks) {
    // 始终清空画布（透明背景）
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

    // 如果没有检测到身体关键点，不绘制任何东西
    if (!landmarks || landmarks.length === 0) {
        return;
    }

    // 应用位置平滑以减少抖动
    const smoothedLandmarks = applySmoothing(landmarks);

    const palette = {
        head: '#E74C3C',
        torso: '#F39C12',
        leftArm: '#2ECC71',
        rightArm: '#2D6CFF',
        leftLeg: '#9B59B6',
        rightLeg: '#16C1C8',
        scribble: 'rgba(230, 230, 230, 0.9)'
    };

    const getPoint = (index) => {
        const landmark = smoothedLandmarks[index];
        if (!landmark) return null;
        const visibility = landmark.visibility ?? 1;
        if (visibility < 0.4) return null;
        return {
            x: landmark.x * mainCanvas.width,
            y: landmark.y * mainCanvas.height,
            visibility
        };
    };

    const drawPolygon = (points, fillColor, strokeColor, shadowColor) => {
        const validPoints = points.filter(Boolean);
        if (validPoints.length < 3) return;

        mainCtx.save();
        mainCtx.lineJoin = 'round';
        mainCtx.lineCap = 'round';

        if (shadowColor) {
            mainCtx.shadowColor = shadowColor;
            mainCtx.shadowBlur = 15;
        }

        mainCtx.beginPath();
        mainCtx.moveTo(validPoints[0].x, validPoints[0].y);
        validPoints.slice(1).forEach(p => mainCtx.lineTo(p.x, p.y));
        mainCtx.closePath();
        mainCtx.fillStyle = fillColor;
        mainCtx.fill();

        if (strokeColor) {
            mainCtx.lineWidth = 6;
            mainCtx.shadowBlur = 0;
            mainCtx.strokeStyle = strokeColor;
            mainCtx.stroke();
        }

        mainCtx.restore();
    };

    const lerp = (a, b, t) => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
    });

    const leftShoulder = getPoint(11);
    const rightShoulder = getPoint(12);
    const leftHip = getPoint(23);
    const rightHip = getPoint(24);
    const leftElbow = getPoint(13);
    const rightElbow = getPoint(14);
    const leftWrist = getPoint(15);
    const rightWrist = getPoint(16);
    const leftKnee = getPoint(25);
    const rightKnee = getPoint(26);
    const leftAnkle = getPoint(27);
    const rightAnkle = getPoint(28);
    const nose = getPoint(0);
    const leftEar = getPoint(7) || leftShoulder;
    const rightEar = getPoint(8) || rightShoulder;

    mainCtx.save();
    mainCtx.lineJoin = 'round';
    mainCtx.lineCap = 'round';

    // 身体灰色涂鸦感的骨架
    if (leftShoulder && rightShoulder && leftHip && rightHip) {
        const spineTop = lerp(leftShoulder, rightShoulder, 0.5);
        const spineBottom = lerp(leftHip, rightHip, 0.5);
        const horizontal = (() => {
            const dx = rightShoulder.x - leftShoulder.x;
            const dy = rightShoulder.y - leftShoulder.y;
            const len = Math.hypot(dx, dy) || 1;
            return { x: dx / len, y: dy / len };
        })();

        const segments = 16;
        const amplitude = Math.max(Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y) * 0.45, 40);

        mainCtx.beginPath();
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const base = lerp(spineTop, spineBottom, t);
            const taper = 1 - Math.abs(0.5 - t) * 1.5;
            const wave = (i % 2 === 0 ? 1 : -1) * (0.6 + Math.abs(Math.sin(i * 2.1)) * 0.4);
            const offset = amplitude * taper * wave * 0.35;
            const x = base.x + horizontal.x * offset;
            const y = base.y + horizontal.y * offset;
            if (i === 0) {
                mainCtx.moveTo(x, y);
            } else {
                mainCtx.lineTo(x, y);
            }
        }

        mainCtx.strokeStyle = palette.scribble;
        mainCtx.lineWidth = 12;
        mainCtx.shadowColor = 'rgba(200, 200, 200, 0.35)';
        mainCtx.shadowBlur = 18;
        mainCtx.stroke();
    }

    // 躯干部抽象三角形
    if (leftShoulder && rightShoulder && leftHip && rightHip) {
        const hipCenter = lerp(leftHip, rightHip, 0.5);
        drawPolygon([leftShoulder, rightShoulder, hipCenter], palette.torso, '#FFC870', 'rgba(243, 156, 18, 0.6)');
    }

    // 头部的红色小三角
    if (nose && leftEar && rightEar) {
        drawPolygon([nose, leftEar, rightEar], palette.head, '#F9C0B3', 'rgba(231, 76, 60, 0.5)');
    }

    // 手臂抽象色块
    drawPolygon([leftShoulder, leftElbow, leftWrist], palette.leftArm, '#8EF1B1', 'rgba(46, 204, 113, 0.5)');
    drawPolygon([rightShoulder, rightElbow, rightWrist], palette.rightArm, '#9AB8FF', 'rgba(45, 108, 255, 0.4)');

    // 腿部抽象色块
    drawPolygon([leftHip, leftKnee, leftAnkle], palette.leftLeg, '#D5B0EA', 'rgba(155, 89, 182, 0.5)');
    drawPolygon([rightHip, rightKnee, rightAnkle], palette.rightLeg, '#8BE8F0', 'rgba(22, 193, 200, 0.45)');

    // 对角线强调三角形，让视觉更有交错感
    if (leftShoulder && rightHip && leftAnkle) {
        drawPolygon([leftShoulder, rightHip, leftAnkle], 'rgba(255, 210, 77, 0.55)', '#FFEFA3', 'rgba(255, 210, 77, 0.5)');
    }
    if (rightShoulder && leftHip && rightAnkle) {
        drawPolygon([rightShoulder, leftHip, rightAnkle], 'rgba(52, 152, 219, 0.5)', '#BBDDF5', 'rgba(52, 152, 219, 0.45)');
    }

    mainCtx.restore();

    // 绘制关键点 - 圆形节点保留互动颜色，呼应抽象图形
    for (const [groupName, group] of Object.entries(POSE_GROUPS)) {
        const color = POSE_COLORS[group.colorIndex];
        const fadeAlpha = getGroupFadeAlpha(group.colorIndex);

        if (fadeAlpha <= 0) {
            continue;
        }

        group.indices.forEach(index => {
            if (smoothedLandmarks[index]) {
                const landmark = smoothedLandmarks[index];
                const visibility = landmark.visibility || 1;

                const blendedAlpha = visibility * fadeAlpha;

                if (blendedAlpha > 0.5 * fadeAlpha) {
                    const x = landmark.x * mainCanvas.width;
                    const y = landmark.y * mainCanvas.height;

                    // 使用动态大小（基于吸收的粒子数量）
                    const size = bodyNodeSizes[index] || BASE_BODY_NODE_SIZE;

                    mainCtx.save();
                    mainCtx.globalAlpha = blendedAlpha;

                    // 绘制发光外圈
                    mainCtx.shadowColor = color;
                    mainCtx.shadowBlur = 18;
                    mainCtx.fillStyle = color;
                    mainCtx.beginPath();
                    mainCtx.arc(x, y, size, 0, Math.PI * 2);
                    mainCtx.fill();

                    // 绘制实心内圈
                    mainCtx.shadowColor = 'transparent';
                    mainCtx.shadowBlur = 0;
                    mainCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                    mainCtx.beginPath();
                    mainCtx.arc(x, y, size * 0.65, 0, Math.PI * 2);
                    mainCtx.fill();

                    // 添加白色高光
                    mainCtx.fillStyle = 'rgba(255, 255, 255, 0.92)';
                    mainCtx.beginPath();
                    mainCtx.arc(x - size * 0.25, y - size * 0.25, size * 0.28, 0, Math.PI * 2);
                    mainCtx.fill();

                    mainCtx.restore();
                }
            }
        });
    }
}

// 绘制预览画布上的关节点
function drawPreviewLandmarks(landmarks) {
    if (!landmarks || landmarks.length === 0 || cameraPreview.style.display === 'none') {
        return;
    }

    // 清空预览画布
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = previewCanvas.width / previewCanvas.height;

    let drawWidth, drawHeight, offsetX = 0, offsetY = 0;

    // 计算视频在画布上的显示区域（保持比例）
    if (videoAspect > canvasAspect) {
        // 视频更宽，以高度为准
        drawHeight = previewCanvas.height;
        drawWidth = drawHeight * videoAspect;
        offsetX = (previewCanvas.width - drawWidth) / 2;
    } else {
        // 视频更高，以宽度为准
        drawWidth = previewCanvas.width;
        drawHeight = drawWidth / videoAspect;
        offsetY = (previewCanvas.height - drawHeight) / 2;
    }

    // 绘制简化的关节点
    for (const [groupName, group] of Object.entries(POSE_GROUPS)) {
        const color = POSE_COLORS[group.colorIndex];

        group.indices.forEach(index => {
            if (landmarks[index]) {
                const landmark = landmarks[index];
                const visibility = landmark.visibility || 1;

                if (visibility > 0.5) {
                    // 将视频坐标转换为预览画布坐标
                    const x = (landmark.x * drawWidth) + offsetX;
                    const y = (landmark.y * drawHeight) + offsetY;

                    // 绘制关节点
                    previewCtx.fillStyle = color;
                    previewCtx.beginPath();
                    previewCtx.arc(x, y, 3, 0, Math.PI * 2); // 较小的节点
                    previewCtx.fill();
                }
            }
        });
    }
}

// 绘制身体节点与粒子的科技风连线
function drawBodyParticleConnections() {
    particleCtx.save();

    bodyParticleConnections.forEach(connection => {
        const { bodyX, bodyY, particleX, particleY, color, alpha, connectionTime, bodyColorIndex } = connection;

        const groupAlpha = bodyColorIndex !== undefined ? getGroupFadeAlpha(bodyColorIndex) : 1;
        if (groupAlpha <= 0) {
            return;
        }

        // 科技风连线效果
        particleCtx.strokeStyle = color;
        particleCtx.globalAlpha = alpha * groupAlpha;
        particleCtx.lineWidth = 2;

        // 添加发光效果
        particleCtx.shadowColor = color;
        particleCtx.shadowBlur = 10;

        // 绘制主连线
        particleCtx.beginPath();
        particleCtx.moveTo(bodyX, bodyY);
        particleCtx.lineTo(particleX, particleY);
        particleCtx.stroke();

        // 根据连接时间添加额外的视觉效果
        if (connectionTime > 120) { // 连接超过2秒
            // 添加脉冲效果
            const pulseAlpha = (Math.sin(connectionTime * 0.1) + 1) * 0.5 * alpha * groupAlpha;
            particleCtx.globalAlpha = pulseAlpha;
            particleCtx.lineWidth = 3;
            particleCtx.beginPath();
            particleCtx.moveTo(bodyX, bodyY);
            particleCtx.lineTo(particleX, particleY);
            particleCtx.stroke();
        }

        // 重置发光效果
        particleCtx.shadowBlur = 0;
    });

    particleCtx.restore();
}

// 绘制漂浮点
function drawParticles() {
    // 确保画布大小正确
    if (particleCanvas.width === 0 || particleCanvas.height === 0) {
        resizeCanvases();
        initParticles();
    }

    particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

    if (particles.length === 0) {
        console.warn('粒子数组为空，重新初始化');
        initParticles();
        return;
    }

    // 先绘制连线
    drawBodyParticleConnections();

    // 更新和绘制所有粒子（移除粒子间的互动逻辑）
    particles.forEach(particle => {
        particle.update();
        particle.draw(particleCtx);
    });

    // 调试信息：显示粒子数量（低频）
    if (Math.random() < 0.01) { // 1%的几率显示
        console.log('当前粒子数量:', particles.length, '设置数量:', particleCount);
    }

    // 调试信息（减少频率）
    if (Math.random() < 0.01) { // 1%的几率输出调试信息
        const connectedCount = particles.filter(p => p.connected).length;
        console.log(`粒子状态: 总数${particles.length}, 已连接${connectedCount}, 连线数量${bodyParticleConnections.length}`);
    }
}

// 预测摄像头画面
let lastVideoTime = -1;
let animationFrameId = null;
let animateFrameId = null; // 跟踪animate函数的动画帧
let detectionErrorCount = 0; // 检测错误计数器
const maxDetectionErrors = 5; // 最大允许错误次数

async function predictWebcam() {
    if (!webcamRunning || !poseLandmarker) {
        return;
    }

    // 确保运行模式为VIDEO
    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await poseLandmarker.setOptions({ runningMode: "VIDEO" });
    }

    // 绘制粒子（摄像头运行时由predictWebcam负责）
    drawParticles();

    let startTimeMs = performance.now();

    // 检测身体姿势 - 移除时间戳检查，始终尝试检测
    try {
        // 检查视频状态
        if (!video || video.readyState < 2) {
            console.warn("视频未准备好，跳过检测", {
                videoExists: !!video,
                readyState: video ? video.readyState : 'N/A',
                videoWidth: video ? video.videoWidth : 'N/A',
                videoHeight: video ? video.videoHeight : 'N/A'
            });
            return;
        }

        // 检查视频尺寸
        if (!video.videoWidth || !video.videoHeight) {
            console.warn("视频尺寸无效，跳过检测");
            return;
        }

        // 检查模型状态
        if (!poseLandmarker) {
            console.warn("PoseLandmarker未初始化，跳过检测");
            return;
        }

        poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
            try {
                if (result && result.landmarks && result.landmarks.length > 0) {
                    // 检测成功，重置错误计数器
                    detectionErrorCount = 0;

                    currentLandmarks = result.landmarks[0];
                    currentWorldLandmarks = result.worldLandmarks ? result.worldLandmarks[0] : [];

                    if (Math.random() < 0.03) { // 3%的几率输出检测信息
                        console.log("检测到身体，关键点数量:", currentLandmarks.length);
                    }

                    // 检查互动
                    checkParticleInteractions(currentLandmarks);

                    // 绘制特征点
                    drawLandmarks(currentLandmarks);

                    // 在预览画布上绘制简化的关节点
                    drawPreviewLandmarks(currentLandmarks);
                } else {
                    // 没有检测到身体，清空主画布但保持黑色背景
                    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
                    currentLandmarks = [];
                }
            } catch (callbackError) {
                console.error("检测结果处理错误:", callbackError);
                detectionErrorCount++;
            }
        });
    } catch (error) {
        detectionErrorCount++;
        console.error("检测错误:", error);
        console.error("错误详情:", {
            error: error.message,
            errorCount: detectionErrorCount,
            videoState: video ? video.readyState : 'video is null',
            poseLandmarker: !!poseLandmarker,
            webcamRunning,
            startTimeMs
        });

        // 如果错误次数太多，停止检测
        if (detectionErrorCount >= maxDetectionErrors) {
            console.error(`检测错误次数过多(${detectionErrorCount})，停止摄像头检测`);
            alert(`检测出现太多错误，已自动停止摄像头。请刷新页面重试。\n错误信息: ${error.message}`);
            webcamRunning = false;
            webcamButton.textContent = "启动摄像头";
            return;
        }

        // 出现错误时，短暂暂停检测，避免连续错误
        console.log(`检测出错(${detectionErrorCount}/${maxDetectionErrors})，将延迟重试`);

        // 继续循环，但添加延迟
        if (webcamRunning) {
            const retryDelay = Math.min(500 * detectionErrorCount, 2000); // 递增延迟，最多2秒
            setTimeout(() => {
                if (webcamRunning) {
                    animationFrameId = window.requestAnimationFrame(predictWebcam);
                }
            }, retryDelay);
        }
        return;
    }

    // 继续循环
    if (webcamRunning) {
        animationFrameId = window.requestAnimationFrame(predictWebcam);
    }
}

// 启动动画循环（只有在摄像头未运行时才绘制粒子）
function animate() {
    // 只有在摄像头未运行时才绘制粒子
    if (!webcamRunning) {
        drawParticles();
    }
    animateFrameId = requestAnimationFrame(animate);
}

// 立即开始动画循环
animate();

// 页面加载完成后的调试检查
setTimeout(() => {
    console.log('=== 页面加载调试信息 ===');
    console.log('粒子系统初始化完成，粒子数量:', particles.length);
    console.log('画布大小:', particleCanvas.width, 'x', particleCanvas.height);
    console.log('主画布上下文:', mainCtx ? '正常' : '异常');
    console.log('粒子画布上下文:', particleCtx ? '正常' : '异常');
    console.log('MediaPipe库:', typeof Pose !== 'undefined' ? '已加载' : '未加载');

    // 立即测试绘制
    console.log('执行初始粒子绘制...');
    drawParticles();
}, 1000);
