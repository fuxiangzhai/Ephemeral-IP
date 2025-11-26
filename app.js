import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

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
    '#E53935', '#1E40FF', '#18C065', '#F28C28', '#E53935', // 预留身体配色
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
    '#F8B739', '#E74C3C', '#3498DB', '#2ECC71', '#F39C12',
    '#9B59B6', '#1ABC9C', '#E67E22', '#34495E', '#E91E63',
    '#FF4444', '#44FF44', '#4444FF', '#FFFF44', '#FF44FF', '#44FFFF'
];

// MediaPipe Pose关键点颜色分组（按照示例图的配色）
const POSE_COLORS = [
    '#E53935', // 鼻子 - 红
    '#E53935', // 左肩 - 红（与鼻子同色）
    '#1E40FF', // 右手腕 - 蓝
    '#18C065', // 左脚前脚掌 - 绿
    '#F28C28'  // 右脚踝 - 橙
];

// 关键点分组定义（只保留指定的关键点）
const POSE_GROUPS = {
    nose: { indices: [0], colorIndex: 0, name: '鼻子' },
    leftShoulder: { indices: [11], colorIndex: 1, name: '左肩' },
    rightWrist: { indices: [16], colorIndex: 2, name: '右手腕' },
    leftFoot: { indices: [31], colorIndex: 3, name: '左脚前脚掌' },
    rightAnkle: { indices: [28], colorIndex: 4, name: '右脚踝' }
};

const LANDMARK_INDEX = {
    nose: 0,
    leftShoulder: 11,
    rightWrist: 16,
    leftFoot: 31,
    rightAnkle: 28
};

const LEFT_FOOT_ART_OFFSET = 26; // 左脚节点在视觉上下移制造与右脚的高度差

class Particle {
    constructor() {
        this.x = Math.random() * particleCanvas.width;
        this.y = Math.random() * particleCanvas.height;
        this.vx = (Math.random() - 0.5) * 0.24; // 更慢的初速度
        this.vy = (Math.random() - 0.5) * 0.24;
        this.color = particleColors[Math.floor(Math.random() * particleColors.length)];
        this.size = Math.random() * 6 + 7; // 增大尺寸，从7-13像素
        this.alpha = Math.random() * 0.6 + 0.5; // 增大透明度，从0.5-1.1
        this.life = 1;
        this.decayRate = 0.0003 + Math.random() * 0.0006; // 更慢的褪色速度
        this.connected = false;
        this.connectionTime = 0;
        this.connectedBodyIndex = -1; // 连接到的身体节点索引
        this.absorbed = false; // 是否已被吸收
        this.absorbing = false; // 是否正在被吸收
        this.absorbProgress = 0; // 吸收进度 (0-1)
        this.targetBodyX = 0; // 目标身体节点X坐标
        this.targetBodyY = 0; // 目标身体节点Y坐标
        this.assimilatedGroup = null; // 加入身体后的颜色组
        this.nearBodyStart = new Map(); // 记录靠近身体节点的时间戳
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
                this.vx = (Math.random() - 0.5) * 0.24;
                this.vy = (Math.random() - 0.5) * 0.24;
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

        // 如果所属的身体组已完全褪色，解除连接并重置状态
        if (this.assimilatedGroup !== null && getGroupFadeAlpha(this.assimilatedGroup) <= 0) {
            this.connected = false;
            this.connectedBodyIndex = -1;
            this.assimilatedGroup = null;
            this.nearBodyStart.clear();
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
const particleCount = 30;

// 确保五个身体颜色在漂浮节点中始终存在
function ensureBodyColorParticles() {
    const colorCounts = new Map();
    particles.forEach(p => {
        colorCounts.set(p.color, (colorCounts.get(p.color) || 0) + 1);
    });

    POSE_COLORS.forEach(color => {
        if (!colorCounts.has(color)) {
            const replacement = particles[Math.floor(Math.random() * particles.length)] || new Particle();
            replacement.color = color;
            replacement.life = 1;
            replacement.alpha = Math.random() * 0.6 + 0.5;
            replacement.decayRate = 0.0003 + Math.random() * 0.0006;
            replacement.connected = false;
            replacement.assimilatedGroup = null;
            replacement.connectedBodyIndex = -1;
            replacement.nearBodyStart.clear();
            if (!particles.includes(replacement)) {
                particles.push(replacement);
            }
        }
    });
}

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

    ensureBodyColorParticles();
    
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

const MEDIAPIPE_VERSION = "0.10.0";
const MEDIAPIPE_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const POSE_MODEL_URL = `${MEDIAPIPE_BASE}/wasm/pose_landmarker_lite.task`;
const WASM_ASSETS_URL = `${MEDIAPIPE_BASE}/wasm`;

// 初始化MediaPipe，支持 GPU -> CPU 的自动降级，避免模型加载卡住
const createPoseLandmarker = async () => {
    try {
        loadingText.textContent = 'Loading MediaPipe model...';

        const vision = await FilesetResolver.forVisionTasks(WASM_ASSETS_URL);

        const attemptCreate = async (delegate) => {
            loadingText.textContent = delegate === 'GPU'
                ? 'Initializing PoseLandmarker (GPU)...'
                : 'GPU unavailable, falling back to CPU...';

            return PoseLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: POSE_MODEL_URL,
                    delegate
                },
                runningMode: runningMode,
                numPoses: 1,
                outputSegmentationMasks: false
            });
        };

        try {
            poseLandmarker = await attemptCreate('GPU');
        } catch (gpuError) {
            console.warn('GPU delegate unavailable, switching to CPU:', gpuError);
            poseLandmarker = await attemptCreate('CPU');
        }

        loadingText.textContent = 'Model ready! Click Start Camera.';
        console.log('PoseLandmarker Initialization completed!');

    } catch (error) {
        console.error('PoseLandmarker initialization failed:', error);
        loadingText.textContent = 'Loading failed: ' + error.message;
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

    const now = performance.now();

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
        let bodyNodeColor = '#FFFFFF'; 
        let colorIndex = -1;
        
        for (const group of Object.values(POSE_GROUPS)) {
            if (group.indices.includes(index)) {
                bodyNodeColor = POSE_COLORS[group.colorIndex];
                break;
            }
        }
        
        // colorIndex 最后统一从颜色反查
        colorIndex = getColorIndexFromHex(bodyNodeColor);

        const fadeAlpha = colorIndex >= 0 ? getGroupFadeAlpha(colorIndex) : 0;
        if (fadeAlpha <= 0) {
            return;
        }

        const connectDistance = 42; // 更紧的连接半径
        const repulsionDistance = 130; // 强烈排斥半径

        const fadeAlpha = colorIndex >= 0 ? getGroupFadeAlpha(colorIndex) : 0;
        if (fadeAlpha <= 0) {
            return;
        }

        const connectDistance = 42; // 更紧的连接半径
        const repulsionDistance = 130; // 强烈排斥半径

        particles.forEach(particle => {
            // 已并入其他身体节点的不再与当前节点互动
            if (particle.connected && particle.connectedBodyIndex !== index) {
                return;
            }

            const dx = x - particle.x;
            const dy = y - particle.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 0.0001;

            if (particle.color === bodyNodeColor) {
                // 保证靠近计时
                if (distance < connectDistance) {
                    const start = particle.nearBodyStart.get(index) || now;
                    particle.nearBodyStart.set(index, start);

                    if (!particle.connected && now - start >= 1000) {
                        particle.connected = true;
                        particle.connectionTime = 0;
                        particle.connectedBodyIndex = index;
                        particle.assimilatedGroup = colorIndex;
                        refreshBodyGroup(colorIndex, particle);
                        console.log('粒子锁定身体节点，颜色匹配且停留超过1s');
                    }
                } else {
                    particle.nearBodyStart.delete(index);
                }

                if (particle.connected && particle.connectedBodyIndex === index) {
                    refreshBodyGroup(colorIndex, particle);

                    // 稳定牵引，让连接保持贴合
                    if (distance > 2) {
                        const force = 0.028;
                        particle.vx += (dx / distance) * force;
                        particle.vy += (dy / distance) * force;
                    }

                    bodyParticleConnections.push({
                        bodyX: x,
                        bodyY: y,
                        particleX: particle.x,
                        particleY: particle.y,
                        color: bodyNodeColor,
                        alpha: 0.9,
                        connectionTime: particle.connectionTime,
                        bodyColorIndex: colorIndex
                    });
                }
            } else {
                particle.nearBodyStart.delete(index);

                // 夸张的排斥挤压效果
                if (distance < repulsionDistance) {
                    const baseForce = 0.08;
                    const impactForce = distance < 40 ? 0.22 : 0;
                    const force = baseForce + impactForce;
                    particle.vx -= (dx / distance) * force;
                    particle.vy -= (dy / distance) * force;
                }
            }

            // 限制速度
            const maxSpeed = 1.05;
            const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
            if (speed > maxSpeed) {
                particle.vx = (particle.vx / speed) * maxSpeed;
                particle.vy = (particle.vy / speed) * maxSpeed;
            }
        });
    });

    // 已吸收的粒子与自由粒子之间的互动：同色连接、异色排斥
    const connectedParticles = particles.filter(p => p.connected);
    connectedParticles.forEach(anchor => {
        particles.forEach(other => {
            if (anchor === other) return;

            const dx = anchor.x - other.x;
            const dy = anchor.y - other.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;

            if (anchor.color === other.color) {
                if (!other.connected && distance < 55) {
                    other.connected = true;
                    other.connectedBodyIndex = anchor.connectedBodyIndex;
                    other.assimilatedGroup = anchor.assimilatedGroup;
                    refreshBodyGroup(anchor.assimilatedGroup, other);
                }

                if (distance < 140) {
                    const pull = 0.018;
                    other.vx += (dx / distance) * pull;
                    other.vy += (dy / distance) * pull;
                }
            } else {
                if (distance < 160) {
                    const repel = 0.12;
                    other.vx -= (dx / distance) * repel;
                    other.vy -= (dy / distance) * repel;
                }
            }

            const cap = 1.1;
            const spd = Math.sqrt(other.vx * other.vx + other.vy * other.vy);
            if (spd > cap) {
                other.vx = (other.vx / spd) * cap;
                other.vy = (other.vy / spd) * cap;
            }
        });
    });
}

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

// 绘制身体特征点（透明背景，只显示指定的关键点）
function drawLandmarks(landmarks) {
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

    if (!landmarks || landmarks.length === 0) {
        return;
    }

    const smoothedLandmarks = applySmoothing(landmarks);
    const MIN_NODE_SIZE = 18;

    const getPoint = (index) => {
        const landmark = smoothedLandmarks[index];
        if (!landmark) return null;
        const visibility = landmark.visibility ?? 1;
        if (visibility < 0.4) return null;
        const artOffsetY = index === LANDMARK_INDEX.leftFoot ? LEFT_FOOT_ART_OFFSET : 0;
        return {
            x: landmark.x * mainCanvas.width,
            y: landmark.y * mainCanvas.height + artOffsetY,
            visibility
        };
    };

    const nose = getPoint(LANDMARK_INDEX.nose);
    const leftShoulder = getPoint(LANDMARK_INDEX.leftShoulder);
    const rightWrist = getPoint(LANDMARK_INDEX.rightWrist);
    const leftFoot = getPoint(LANDMARK_INDEX.leftFoot);
    const rightAnkle = getPoint(LANDMARK_INDEX.rightAnkle);

    const drawTriangle = (p1, p2, p3, color) => {
        if (!p1 || !p2 || !p3) return;
        mainCtx.save();
        mainCtx.beginPath();
        mainCtx.moveTo(p1.x, p1.y);
        mainCtx.lineTo(p2.x, p2.y);
        mainCtx.lineTo(p3.x, p3.y);
        mainCtx.closePath();
        mainCtx.fillStyle = color;
        mainCtx.shadowColor = color;
        mainCtx.shadowBlur = 14;
        mainCtx.fill();
        mainCtx.restore();
    };

    // 按示例配色绘制四个三角区域
    drawTriangle(nose, leftShoulder, rightWrist, '#E53935');
    drawTriangle(nose, leftShoulder, leftFoot, '#18C065');
    drawTriangle(nose, rightWrist, leftFoot, '#1E40FF');
    drawTriangle(leftShoulder, rightWrist, rightAnkle, '#F28C28');

    // 绘制关键点 - 仅保留五个节点，颜色与示例一致且更大
    for (const [groupName, group] of Object.entries(POSE_GROUPS)) {
        const color = POSE_COLORS[group.colorIndex];
        const fadeAlpha = getGroupFadeAlpha(group.colorIndex);

        if (fadeAlpha <= 0) {
            continue;
        }

        group.indices.forEach(index => {
            const landmark = smoothedLandmarks[index];
            if (!landmark) return;
            const visibility = landmark.visibility || 1;
            const blendedAlpha = visibility * fadeAlpha;

            if (blendedAlpha > 0.4 * fadeAlpha) {
                const x = landmark.x * mainCanvas.width;
                const y = landmark.y * mainCanvas.height + (index === LANDMARK_INDEX.leftFoot ? LEFT_FOOT_ART_OFFSET : 0);
                const size = Math.max(bodyNodeSizes[index] || BASE_BODY_NODE_SIZE, MIN_NODE_SIZE);

                mainCtx.save();
                mainCtx.globalAlpha = blendedAlpha;
                mainCtx.shadowColor = color;
                mainCtx.shadowBlur = 20;
                mainCtx.fillStyle = color;
                mainCtx.beginPath();
                mainCtx.arc(x, y, size, 0, Math.PI * 2);
                mainCtx.fill();
                mainCtx.restore();
            }
        });
    }
}

// 绘制预览画布上的关节点（镜像显示以匹配摄像头预览）
function drawPreviewLandmarks(landmarks) {
    if (!landmarks || landmarks.length === 0 || cameraPreview.style.display === 'none') {
        return;
    }

    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = previewCanvas.width / previewCanvas.height;

    let drawWidth, drawHeight, offsetX = 0, offsetY = 0;

    if (videoAspect > canvasAspect) {
        drawHeight = previewCanvas.height;
        drawWidth = drawHeight * videoAspect;
        offsetX = (previewCanvas.width - drawWidth) / 2;
    } else {
        drawWidth = previewCanvas.width;
        drawHeight = drawWidth / videoAspect;
        offsetY = (previewCanvas.height - drawHeight) / 2;
    }

    const toMirroredPoint = (landmark) => {
        if (!landmark) return null;
        return {
            x: offsetX + drawWidth - (landmark.x * drawWidth),
            y: offsetY + (landmark.y * drawHeight)
        };
    };

    const nodes = {
        nose: toMirroredPoint(landmarks[LANDMARK_INDEX.nose]),
        leftShoulder: toMirroredPoint(landmarks[LANDMARK_INDEX.leftShoulder]),
        rightWrist: toMirroredPoint(landmarks[LANDMARK_INDEX.rightWrist]),
        leftFoot: toMirroredPoint(landmarks[LANDMARK_INDEX.leftFoot]),
        rightAnkle: toMirroredPoint(landmarks[LANDMARK_INDEX.rightAnkle])
    };

    if (nodes.leftFoot) {
        nodes.leftFoot.y += LEFT_FOOT_ART_OFFSET;
    }

    const visibilityOK = (landmark) => (landmark?.visibility ?? 1) > 0.5;

    const previewTriangles = [
        ['nose', 'leftShoulder', 'rightWrist', '#E53935'],
        ['nose', 'leftShoulder', 'leftFoot', '#18C065'],
        ['nose', 'rightWrist', 'leftFoot', '#1E40FF'],
        ['leftShoulder', 'rightWrist', 'rightAnkle', '#F28C28']
    ];

    previewTriangles.forEach(([a, b, c, color]) => {
        const la = landmarks[LANDMARK_INDEX[a]];
        const lb = landmarks[LANDMARK_INDEX[b]];
        const lc = landmarks[LANDMARK_INDEX[c]];
        if (nodes[a] && nodes[b] && nodes[c] && visibilityOK(la) && visibilityOK(lb) && visibilityOK(lc)) {
            previewCtx.save();
            previewCtx.beginPath();
            previewCtx.moveTo(nodes[a].x, nodes[a].y);
            previewCtx.lineTo(nodes[b].x, nodes[b].y);
            previewCtx.lineTo(nodes[c].x, nodes[c].y);
            previewCtx.closePath();
            previewCtx.fillStyle = color;
            previewCtx.globalAlpha = 0.85;
            previewCtx.fill();
            previewCtx.restore();
        }
    });

    const MIN_PREVIEW_SIZE = 9;
    for (const [key, point] of Object.entries(nodes)) {
        const idx = LANDMARK_INDEX[key];
        const landmark = landmarks[idx];
        if (!point || !landmark || !visibilityOK(landmark)) continue;

        const group = Object.values(POSE_GROUPS).find(g => g.indices.includes(idx));
        if (!group) continue;
        const color = POSE_COLORS[group.colorIndex];

        previewCtx.save();
        previewCtx.fillStyle = color;
        previewCtx.shadowColor = color;
        previewCtx.shadowBlur = 10;
        previewCtx.beginPath();
        previewCtx.arc(point.x, point.y, MIN_PREVIEW_SIZE, 0, Math.PI * 2);
        previewCtx.fill();
        previewCtx.restore();
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

        const gradient = particleCtx.createLinearGradient(bodyX, bodyY, particleX, particleY);
        gradient.addColorStop(0, `${color}aa`);
        gradient.addColorStop(1, `${color}00`);

        particleCtx.globalAlpha = alpha * groupAlpha;
        particleCtx.lineWidth = 2.4;
        particleCtx.strokeStyle = gradient;
        particleCtx.shadowColor = color;
        particleCtx.shadowBlur = 18;

        particleCtx.beginPath();
        particleCtx.moveTo(bodyX, bodyY);
        particleCtx.lineTo(particleX, particleY);
        particleCtx.stroke();

        // 夸张的能量波纹
        const ripple = 6 + Math.sin(connectionTime * 0.08) * 3;
        particleCtx.lineWidth = 1.4;
        particleCtx.globalAlpha = 0.35 * groupAlpha;
        particleCtx.beginPath();
        particleCtx.moveTo(bodyX, bodyY);
        particleCtx.lineTo((bodyX + particleX) / 2 + ripple, (bodyY + particleY) / 2 - ripple);
        particleCtx.lineTo(particleX, particleY);
        particleCtx.stroke();

        // 端点闪耀
        particleCtx.fillStyle = color;
        particleCtx.globalAlpha = Math.min(1, 0.5 + Math.sin(connectionTime * 0.12) * 0.5) * groupAlpha;
        particleCtx.beginPath();
        particleCtx.arc(bodyX, bodyY, 5, 0, Math.PI * 2);
        particleCtx.fill();
        particleCtx.beginPath();
        particleCtx.arc(particleX, particleY, 6, 0, Math.PI * 2);
        particleCtx.fill();

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

    ensureBodyColorParticles();

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
