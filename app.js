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

// 漂浮点系统
const particleColors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
    '#F8B739', '#E74C3C', '#3498DB', '#2ECC71', '#F39C12',
    '#9B59B6', '#1ABC9C', '#E67E22', '#34495E', '#E91E63'
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

        // 如果没有连接，逐渐衰减
        if (!this.connected) {
            this.life -= this.decayRate;
            if (this.life <= 0) {
                // 重生
                this.x = Math.random() * particleCanvas.width;
                this.y = Math.random() * particleCanvas.height;
                this.life = 1;
                this.alpha = Math.random() * 0.5 + 0.3;
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
        ctx.globalAlpha = this.alpha;
        
        if (this.connected) {
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
        
        loadingText.textContent = '模型加载完成！点击启动摄像头';
        console.log('PoseLandmarker 初始化完成！');
        
    } catch (error) {
        console.error('初始化 PoseLandmarker 失败:', error);
        loadingText.textContent = '加载失败: ' + error.message;
    }
};

createPoseLandmarker();

// 摄像头控制
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

if (hasGetUserMedia()) {
    webcamButton.addEventListener("click", enableCam);
} else {
    webcamButton.disabled = true;
    webcamButton.textContent = "浏览器不支持摄像头";
}

function enableCam() {
    if (!poseLandmarker) {
        alert("模型还在加载中，请稍候...");
        return;
    }

    if (webcamRunning) {
        webcamRunning = false;
        webcamButton.textContent = "启动摄像头";
        
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
        
        // 清空主画布（透明背景）
        mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        currentLandmarks = [];

        // 重置所有粒子的连接状态
        particles.forEach(particle => {
            particle.connected = false;
            particle.connectionTime = 0;
        });

        // 重置错误计数器
        detectionErrorCount = 0;

        // 重新启动animate循环
        if (!animateFrameId) {
            animate();
        }
    } else {
        webcamRunning = true;
        webcamButton.textContent = "停止摄像头";
        loadingText.textContent = '';

        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        navigator.mediaDevices.getUserMedia(constraints)
            .then((stream) => {
                console.log("摄像头权限获取成功");
                video.srcObject = stream;

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

// 检测身体节点与漂浮点的互动
function checkParticleInteractions(landmarks) {
    if (!landmarks || landmarks.length === 0) return;

    // 减少调试信息的频率
    if (Math.random() < 0.05) { // 5%的几率输出调试信息
        console.log('检查粒子互动，关键点数量:', landmarks.length);
    }

    landmarks.forEach(landmark => {
        // 将归一化坐标转换为画布坐标
        const x = landmark.x * mainCanvas.width;
        const y = landmark.y * mainCanvas.height;

        particles.forEach(particle => {
            const dx = x - particle.x;
            const dy = y - particle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const connectDistance = 60; // 连接距离

            if (distance < connectDistance) {
                if (!particle.connected) {
                    particle.connected = true;
                    particle.connectionTime = 0;
                    if (Math.random() < 0.02) { // 2%的几率输出连接信息
                        console.log('粒子连接到身体节点，距离:', distance.toFixed(1));
                    }
                    // 吸引粒子向身体节点
                    const force = 0.05;
                    particle.vx += (dx / distance) * force;
                    particle.vy += (dy / distance) * force;
                } else {
                    // 已连接的粒子继续被吸引
                    const force = 0.02;
                    particle.vx += (dx / distance) * force;
                    particle.vy += (dy / distance) * force;
                }
            } else {
                // 距离太远，断开连接
                if (particle.connected && particle.connectionTime > 30) {
                    particle.connected = false;
                    particle.connectionTime = 0;
                    if (Math.random() < 0.01) { // 1%的几率输出断开信息
                        console.log('粒子断开连接');
                    }
                }
            }

            // 限制速度
            const maxSpeed = 1.5;
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
    head: { indices: [0, 7, 8], colorIndex: 0, name: '头部' },
    rightArm: { indices: [12, 14, 16, 18, 20], colorIndex: 1, name: '右胳膊' },
    leftArm: { indices: [11, 13, 15, 17, 19], colorIndex: 2, name: '左胳膊' },
    waist: { indices: [23, 24], colorIndex: 3, name: '腰部' },
    leftLeg: { indices: [26, 28, 30, 32], colorIndex: 4, name: '左腿' },
    rightLeg: { indices: [23, 25, 27, 29, 31], colorIndex: 5, name: '右腿' }
};

// 自定义连接线 (只保留指定关键点之间的连接)
const CUSTOM_CONNECTIONS = [
    // 右胳膊连接
    [12, 14], [14, 16], [16, 18], [16, 20],
    // 左胳膊连接
    [11, 13], [13, 15], [15, 17], [15, 19],
    // 腰部连接
    [23, 24],
    // 左腿连接 (从腰部开始)
    [23, 26], [26, 28], [28, 30], [30, 32],
    // 右腿连接 (从腰部开始)
    [24, 25], [25, 27], [27, 29], [29, 31]
];

// 绘制身体特征点（透明背景，只显示指定的关键点）
function drawLandmarks(landmarks) {
    // 始终清空画布（透明背景）
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

    // 如果没有检测到身体关键点，不绘制任何东西
    if (!landmarks || landmarks.length === 0) {
        return;
    }

    // 绘制连接线 - 只绘制指定的连接，更粗更艺术
    mainCtx.lineWidth = 5; // 更粗的连线
    mainCtx.lineCap = 'round'; // 圆形线帽
    mainCtx.lineJoin = 'round'; // 圆形连接

    // 为连线添加发光效果
    mainCtx.shadowBlur = 10;

    CUSTOM_CONNECTIONS.forEach(([start, end]) => {
        if (landmarks[start] && landmarks[end]) {
            const startVisibility = landmarks[start].visibility || 1;
            const endVisibility = landmarks[end].visibility || 1;

            if (startVisibility > 0.5 && endVisibility > 0.5) {
                const startX = landmarks[start].x * mainCanvas.width;
                const startY = landmarks[start].y * mainCanvas.height;
                const endX = landmarks[end].x * mainCanvas.width;
                const endY = landmarks[end].y * mainCanvas.height;

                // 根据连接的起点确定颜色
                let color = '#FFFFFF'; // 默认白色
                for (const group of Object.values(POSE_GROUPS)) {
                    if (group.indices.includes(start)) {
                        color = POSE_COLORS[group.colorIndex];
                        break;
                    }
                }

                mainCtx.strokeStyle = color;
                mainCtx.shadowColor = color;
                mainCtx.beginPath();
                mainCtx.moveTo(startX, startY);
                mainCtx.lineTo(endX, endY);
                mainCtx.stroke();
            }
        }
    });

    // 清除阴影效果
    mainCtx.shadowColor = 'transparent';
    mainCtx.shadowBlur = 0;

    // 绘制关键点 - 只绘制指定的关键点，节点更大更艺术
    for (const [groupName, group] of Object.entries(POSE_GROUPS)) {
        const color = POSE_COLORS[group.colorIndex];

        group.indices.forEach(index => {
            if (landmarks[index]) {
                const landmark = landmarks[index];
                const visibility = landmark.visibility || 1;

                if (visibility > 0.5) {
                    const x = landmark.x * mainCanvas.width;
                    const y = landmark.y * mainCanvas.height;

                    // 更大的节点
                    const size = 12;

                    mainCtx.save();
                    mainCtx.globalAlpha = visibility;

                    // 绘制发光外圈
                    mainCtx.shadowColor = color;
                    mainCtx.shadowBlur = 15;
                    mainCtx.fillStyle = color;
                    mainCtx.beginPath();
                    mainCtx.arc(x, y, size, 0, Math.PI * 2);
                    mainCtx.fill();

                    // 绘制实心内圈
                    mainCtx.shadowColor = 'transparent';
                    mainCtx.shadowBlur = 0;
                    mainCtx.fillStyle = color;
                    mainCtx.beginPath();
                    mainCtx.arc(x, y, size * 0.6, 0, Math.PI * 2);
                    mainCtx.fill();

                    // 添加白色高光
                    mainCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    mainCtx.beginPath();
                    mainCtx.arc(x - size * 0.25, y - size * 0.25, size * 0.25, 0, Math.PI * 2);
                    mainCtx.fill();

                    mainCtx.restore();
                }
            }
        });
    }
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

    // 更新和绘制所有粒子
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
        console.log(`粒子状态: 总数${particles.length}, 已连接${connectedCount}`);
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
