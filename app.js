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

// ===== 身体姿态缩放参数 =====
// 整体身体姿态缩放 - 基于距离的非线性缩放系统
const POSE_TRANSLATION_MULTIPLIER = -2.0; // 姿势整体水平移动倍增器，只影响整个身体的左右位移 (负值使移动方向正确)
const FEET_OFFSET_FROM_BOTTOM = 40; // 脚部距离屏幕底部的像素距离

// 非线性缩放系统：基于身体在相机中的大小来确定缩放因子（带平滑插值）
function calculateBodyScaleFactor(landmarks) {
    if (!landmarks || landmarks.length === 0) return 0.5; // 默认缩放

    // 计算身体的高度（从最高点到最低点的距离）
    let minY = 1;
    let maxY = 0;

    // 只考虑我们使用的关键点
    const usedIndices = [LANDMARK_INDEX.nose, LANDMARK_INDEX.leftShoulder,
                        LANDMARK_INDEX.rightWrist, LANDMARK_INDEX.leftFoot, LANDMARK_INDEX.rightAnkle];

    usedIndices.forEach(index => {
        const landmark = landmarks[index];
        if (landmark && landmark.visibility > 0.4) {
            minY = Math.min(minY, landmark.y);
            maxY = Math.max(maxY, landmark.y);
        }
    });

    const bodyHeight = maxY - minY; // 身体在相机视图中的高度 (0-1)
    // wrong, it's not limited to 0-1, it's actually not limited

    // 调整阈值以匹配实际距离（用户反馈5米才触发中等距离）
    // 身体高度与距离的对应关系：
    // - 0.15以下: 远距离 (5米+)
    // - 0.15-0.35: 中等距离渐变区
    // - 0.35-0.55: 近距离渐变区
    // - 0.55以上: 非常近距离 (< 1米)

    let targetScreenPercentage;
    //console.log(bodyHeight);
    if (bodyHeight <= 0.7) {
        // 远距离 (5米+) - 身体在相机中占很小比例
        targetScreenPercentage = 0.3; // 屏幕的30%
    } else if (bodyHeight <= 1.5) {
        // 中等距离渐变区 (2-5米) - 平滑过渡到60%
        const t = (bodyHeight - 0.7) / (1.5 - 0.7); // 0到1的过渡
        targetScreenPercentage = 0.3 + t * (0.6 - 0.3); // 从30%过渡到60%
    } else if (bodyHeight <= 3) {
        // 近距离渐变区 (1-2米) - 平滑过渡到70%
        const t = (bodyHeight - 1.5) / (3 - 1.5); // 0到1的过渡
        targetScreenPercentage = 0.6 + t * (0.75 - 0.6); // 从60%过渡到75%
    } else {
        // 非常近距离 (< 1米) - 身体在相机中占很大比例
        targetScreenPercentage = 0.75; // 屏幕的75%
    }

    // 计算缩放因子：目标屏幕占比 / 当前身体高度
    const scaleFactor = targetScreenPercentage / bodyHeight;

    // 限制缩放因子在合理范围内，避免过度放大或缩小
    return Math.max(0.1, Math.min(3.0, scaleFactor));
}

// ===== 粒子速度调整参数 =====
// 修改这些常量来控制粒子移动速度和行为

const INITIAL_SPEED = 5; // 粒子初始化速度，调大变快，调小变慢
const MAX_PARTICLE_SPEED = 10; // 粒子最大速度限制，调大允许更快移动
const PARTICLE_DAMPING = 0.998; // 阻尼系数，越小阻力越大，0.998表示轻微阻尼

// 粒子间互动力
const BODY_CONNECTION_FORCE = 0.028; // 身体节点对连接粒子的牵引力
const PARTICLE_ATTRACTION_FORCE = 0.018; // 同色粒子间的吸引力
const PARTICLE_REPULSION_FORCE = 0.12; // 异色粒子间的排斥力
const BASE_REPULSION_FORCE = 0.08; // 身体节点基础排斥力
const IMPACT_REPULSION_FORCE = 0.22; // 身体节点近距离冲击力

const ABSORPTION_PROGRESS_SPEED = 0.008; // 吸收进度增加速度

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
let bodyTrackingEnabled = true; // 身体追踪开关（身体死亡后关闭）
let bodyDeadUntil = 0; // 身体死亡后重生的时间戳

// ===== 手部随机插值与用户名系统 =====
let handBlend = { left: 1, right: 1 }; // 手部随机插值因子（0-1）
let currentUsername = ""; // 当前身体的随机用户名
let nameTagState = { x: 0, y: 0, vy: 0, active: false, falling: false }; // 名牌状态
let footOffset = { left: 0, right: 0 }; // 每次新身体生成的左右脚水平随机偏移（像素）
let lastHeadScreenPos = { x: 0, y: 0, valid: false }; // 记录头部屏幕坐标用于气泡
let currentPreset = "tri_glass"; // 身体连线/外观预设

// ===== 名字数据库与场景名牌 =====
const NAME_DB_CAPACITY = 50;
let nameDatabase = new Array(NAME_DB_CAPACITY).fill(null); // {name, timestamp}
let nameDbWriteIndex = 0;
let activeNameTags = new Set(); // 当前场景中已被粒子占用的名字
let speechBubbles = []; // {x,y,text,expires}
let hasInitializedNameDb = false; // 仅会话启动时清空一次
const GREETINGS_USER = [
    "Hey there!", "Hi!", "Great to see you!", "Yo!", "Welcome back!",
    "Hello!", "Nice to meet you!", "Howdy!", "Hey, buddy!", "Hi, friend!"
];
const GREETINGS_NODE = [
    "Hey, I'm still here!", "Long time no see!", "Been waiting here.",
    "Good to see you!", "Hello there!", "Glad you found me!",
    "Yo, I was chilling here!", "Nice, you came back!", "Hey, what's up?",
    "Hi, I've been around!"
];

function resetNameDatabase() {
    nameDatabase = new Array(NAME_DB_CAPACITY).fill(null);
    nameDbWriteIndex = 0;
}

function addNameToDatabase(name) {
    nameDatabase[nameDbWriteIndex] = { name, timestamp: Date.now() };
    nameDbWriteIndex = (nameDbWriteIndex + 1) % NAME_DB_CAPACITY;
}

function pickNameFromDatabase(excludeSet) {
    const candidates = nameDatabase.filter(
        (entry) => entry && !excludeSet.has(entry.name)
    );
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function minutesAgo(ts) {
    const diffMs = Date.now() - ts;
    return Math.max(1, Math.ceil(diffMs / 60000));
}

function findNameRecord(name) {
    return nameDatabase.find((e) => e && e.name === name) || null;
}

function triggerGreeting(particle, bodyX, bodyY) {
    if (!particle.nameTag || particle.hasGreeted) return;
    particle.hasGreeted = true;

    const headPos = lastHeadScreenPos.valid ? lastHeadScreenPos : { x: bodyX, y: bodyY };
    const record = findNameRecord(particle.nameTag);
    const mins = record ? minutesAgo(record.timestamp) : minutesAgo(particle.nameTagTime || Date.now());

    const userGreeting = GREETINGS_USER[Math.floor(Math.random() * GREETINGS_USER.length)];
    const nodeGreeting = GREETINGS_NODE[Math.floor(Math.random() * GREETINGS_NODE.length)];

    addSpeechBubble(headPos.x + 12, headPos.y - 60, `${userGreeting}`);
    addSpeechBubble(particle.x + 12, particle.y - 40, `${nodeGreeting} I was here ${mins} minute(s) ago.`);
}

function attemptAssignNameTag(particle) {
    // 仅对自由粒子，概率 = 1.5% * 已有名字数；且需有未被占用的名字
    if (!particle.isFree) return;

    const totalNames = nameDatabase.filter(Boolean).length;
    const available = nameDatabase.filter(
        (entry) => entry && !activeNameTags.has(entry.name)
    );
    if (!available.length) return; // 无可用名字则跳过

    const chance = Math.min(1, 0.015 * totalNames); // 转小数
    if (Math.random() >= chance) return;

    const entry = available[Math.floor(Math.random() * available.length)];
    if (!entry) return;

    particle.nameTag = entry.name;
    particle.nameTagTime = entry.timestamp || Date.now();
    activeNameTags.add(entry.name);
    particle.hasGreeted = false;
}

function addSpeechBubble(x, y, text) {
    speechBubbles.push({
        x,
        y,
        text,
        expires: performance.now() + 4000
    });
}

function drawSpeechBubbles() {
    const now = performance.now();
    speechBubbles = speechBubbles.filter(b => b.expires > now);

    mainCtx.save();
    const fontSize = 18;
    mainCtx.font = `${fontSize}px Arial, sans-serif`;
    const padding = 8;
    speechBubbles.forEach(b => {
        const textWidth = mainCtx.measureText(b.text).width;
        const rectW = textWidth + padding * 2;
        const rectH = fontSize + padding * 1.2;
        const rectX = b.x;
        const rectY = b.y;

        mainCtx.fillStyle = "rgba(0,0,0,0.65)";
        mainCtx.beginPath();
        mainCtx.roundRect(rectX, rectY, rectW, rectH, 8);
        mainCtx.fill();

        mainCtx.fillStyle = "#FFFFFF";
        mainCtx.fillText(b.text, rectX + padding, rectY + rectH - padding * 0.6);
    });
    mainCtx.restore();
}
const USERNAME_ADJECTIVES = [
    "Swift", "Silent", "Neon", "Cyber", "Shadow", "Quantum", "Pixel", "Solar", "Lunar", "Crystal",
    "Iron", "Atomic", "Cosmic", "Echo", "Phantom", "Velvet", "Nova", "Glitch", "Rapid", "Frost"
];

const USERNAME_NOUNS = [
    "Runner", "Voyager", "Hacker", "Samurai", "Wanderer", "Rider", "Pilot", "Coder", "Ranger", "Seeker",
    "Dancer", "Guardian", "Artist", "Nomad", "Sentinel", "Gamer", "Wizard", "Tinker", "Maker", "Scout"
];

function generateUsername() {
    const adj = USERNAME_ADJECTIVES[Math.floor(Math.random() * USERNAME_ADJECTIVES.length)];
    const noun = USERNAME_NOUNS[Math.floor(Math.random() * USERNAME_NOUNS.length)];
    const num = Math.floor(10 + Math.random() * 89); // 两位随机数
    return `${adj}${noun}${num}`;
}

function randomizeHandBlend() {
    // 先随机一个t，然后再与手部位置做一次平均，使位置更靠近手
    handBlend.left = (Math.random() + 1) / 2;  // 0.5 - 1.0 更靠近手
    handBlend.right = (Math.random() + 1) / 2; // 0.5 - 1.0 更靠近手
}

function shuffleBodyColors() {
    const arr = [...BASE_BODY_COLORS];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// 身体连线预设
const BODY_PRESETS = ["tri_glass", "spring", "tube", "goo", "dots"];
let presetIndex = 0; // 为保证多样性，循环选择预设（仍保留随机性）

// 身体节点基础颜色（5种）
const BASE_BODY_COLORS = [
    '#E53935', // 红
    '#1E40FF', // 蓝
    '#18C065', // 绿
    '#F28C28', // 橙
    '#9B59B6'  // 紫
];

// 漂浮点颜色：身体5色 + 2个额外颜色
const EXTRA_PARTICLE_COLORS = [
    '#00BCD4', // 青
    '#E91E63'  // 粉
];
const particleColors = [
    ...BASE_BODY_COLORS,
    ...EXTRA_PARTICLE_COLORS
];

// MediaPipe Pose关键点颜色（会在每次身体生成时随机排列）
let POSE_COLORS = [...BASE_BODY_COLORS];

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

const LEFT_FOOT_ART_OFFSET = 0; // 左脚节点在视觉上下移制造与右脚的高度差

class Particle {
    constructor() {
        this.x = Math.random() * particleCanvas.width;
        this.y = Math.random() * particleCanvas.height;
        // 粒子初始化速度控制 - 给予向下漂移
        this.vx = (Math.random() - 0.5) * 0.5; // 轻微的水平随机运动
        this.vy = 0.3 + Math.random() * 0.4; // 明确的向下漂移速度
        this.color = particleColors[Math.floor(Math.random() * particleColors.length)];
        this.size = (Math.random() * 6 + 7) * 1.2; // 自由粒子整体放大1.2倍
        this.alpha = 1.0; // 始终以100%透明度开始
        this.life = 1;
        this.decayRate = 0.0003 + Math.random() * 0.0006; // 更慢的褪色速度
        this.connected = false; // 是否已连接到身体节点
        this.isFree = true; // 新增：是否为自由粒子状态
        this.connectionTime = 0;
        this.connectedBodyIndex = -1; // 连接到的身体节点索引
        this.absorbed = false; // 是否已被吸收
        this.absorbing = false; // 是否正在被吸收
        this.absorbProgress = 0; // 吸收进度 (0-1)
        this.targetBodyX = 0; // 目标身体节点X坐标
        this.targetBodyY = 0; // 目标身体节点Y坐标
        this.assimilatedGroup = null; // 加入身体后的颜色组
        this.nearBodyStart = new Map(); // 记录靠近身体节点的时间戳
        this.groupId = null; // 新增：所属组的ID
        this.collapsing = false; // 新增：是否正在下坠
        this.collapseSpeed = 0; // 新增：下坠速度
        this.nameTag = null; // 可选名牌
        this.nameTagTime = 0;
        this.hasGreeted = false;

        attemptAssignNameTag(this); // 尝试赋名牌
    }

    // ===== 防碰撞系统 =====
    applyAntiCollision() {
        particles.forEach(other => {
            if (this === other) return;

            const dx = this.x - other.x;
            const dy = this.y - other.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // 最小碰撞距离（基于粒子大小）
            const minDistance = (this.size + other.size) * 0.8;

            if (distance < minDistance && distance > 0) {
                // 计算碰撞响应
                const overlap = minDistance - distance;
                const force = overlap * 0.1; // 碰撞力度

                // 标准化方向向量
                const nx = dx / distance;
                const ny = dy / distance;

                // 分离粒子
                const separationX = nx * force * 0.5;
                const separationY = ny * force * 0.5;

                this.x += separationX;
                this.y += separationY;
                other.x -= separationX;
                other.y -= separationY;

                // 添加轻微的速度变化（模拟弹性碰撞）
                const bounceForce = force * 0.05;
                this.vx += nx * bounceForce;
                this.vy += ny * bounceForce;
                other.vx -= nx * bounceForce;
                other.vy -= ny * bounceForce;
            }
        });
    }

    // ===== 粒子重生系统 =====
    respawn() {
        // 重置粒子状态为自由悬浮
        removeParticleFromGroups(this);
        this.x = Math.random() * particleCanvas.width;
        this.y = Math.random() * particleCanvas.height;
        // 给予向下漂移的初始速度
        this.vx = (Math.random() - 0.5) * 0.5; // 轻微的水平随机运动
        this.vy = 0.3 + Math.random() * 0.4; // 明确的向下漂移速度
                this.color = particleColors[Math.floor(Math.random() * particleColors.length)];
                this.size = (Math.random() * 6 + 7) * 1.2;
        this.alpha = 1.0;
        this.life = 1;
        this.decayRate = 0.0003 + Math.random() * 0.0006;
        this.connected = false;
        this.isFree = true;
        this.connectionTime = 0;
        this.connectedBodyIndex = -1;
        this.absorbed = false;
        this.absorbing = false;
        this.absorbProgress = 0;
        this.targetBodyX = 0;
        this.targetBodyY = 0;
        this.assimilatedGroup = null;
        this.nearBodyStart.clear();
        this.groupId = null;
        this.collapsing = false;
        this.collapseSpeed = 0;
        if (this.nameTag) activeNameTags.delete(this.nameTag);
        this.nameTag = null;
        this.nameTagTime = 0;
        this.hasGreeted = false;
        attemptAssignNameTag(this);
    }

    update() {
        // ===== 物理引擎：重力系统 =====
        // 自由悬浮粒子：无重力
        // 连接到活跃身体的粒子：无重力
        // 身体消失后的剩余粒子：开启重力下落
        const shouldApplyGravity = this.collapsing && !this.isFree;
        if (shouldApplyGravity) {
            // 向下重力加速度
            this.vy += 0.15;
            // 限制最大下落速度
            this.vy = Math.min(this.vy, 8);
        }

        // ===== 防碰撞系统 =====
        // 检查与其他粒子的碰撞并响应
        this.applyAntiCollision();

        // 应用阻尼以提升流畅度（重力状态下阻尼较小）
        const damping = shouldApplyGravity ? 0.995 : PARTICLE_DAMPING;
        this.vx *= damping;
        this.vy *= damping;

        // 移动
        this.x += this.vx;
        this.y += this.vy;

        // 边界处理
        if (shouldApplyGravity) {
            // 重力粒子（身体死亡后的下落粒子）：底部反弹，其他边界消失
            if (this.y >= particleCanvas.height - 5) {
                this.y = particleCanvas.height - 5;
                this.vx *= 0.8; // 地面摩擦
                this.vy = 0;
                // 落地后逐渐消失
                this.life -= 0.005;
                if (this.life <= 0) {
                    this.respawn();
                }
            } else if (this.x < 0 || this.x > particleCanvas.width || this.y < 0) {
                // 超出左右边界或上边界时消失
                this.life = 0;
                this.respawn();
        }
        } else {
            // 自由粒子：超出任何边界时消失
            if (this.x < 0 || this.x > particleCanvas.width || this.y < 0 || this.y > particleCanvas.height) {
                this.life = 0;
                this.respawn();
            }
        }

        // 如果正在被吸收，执行吸收动画
        if (this.absorbing) {
            this.absorbProgress += ABSORPTION_PROGRESS_SPEED; // 吸收进度增加

            if (this.absorbProgress >= 1) {
                // 吸收完成，重生为新粒子
                removeParticleFromGroups(this);
                this.x = Math.random() * particleCanvas.width;
                this.y = Math.random() * particleCanvas.height;
                this.vx = (Math.random() - 0.5) * 0.5; // 轻微的水平随机运动
                this.vy = 0.3 + Math.random() * 0.4; // 明确的向下漂移速度
                this.color = particleColors[Math.floor(Math.random() * particleColors.length)];
                this.size = (Math.random() * 6 + 3) * 1.2;
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
                // 名牌清理并重新尝试赋名牌
                if (this.nameTag) activeNameTags.delete(this.nameTag);
                this.nameTag = null;
                this.nameTagTime = 0;
                attemptAssignNameTag(this);
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
                this.alpha = 1.0; // 重生时也是100%透明度
                this.assimilatedGroup = null;
                this.isFree = true; // 重生为自由状态
                this.collapsing = false; // 重置崩溃状态
                this.collapseSpeed = 0;
                if (this.nameTag) activeNameTags.delete(this.nameTag);
                this.nameTag = null;
                this.nameTagTime = 0;
                this.hasGreeted = false;
                attemptAssignNameTag(this);
            }
        } else {
            // 连接的粒子保持活力
            this.life = Math.min(1, this.life + 0.02);
            this.connectionTime++;
        }


        // 不在单个节点到期时触发坠落，等待全身死亡统一坠落


        this.alpha = this.life;
    }

    draw(ctx) {
        ctx.save();
        // 获取褪色颜色或保持原始颜色
        let drawColor = this.color;
        let groupAlpha = 1;

        if (this.assimilatedGroup !== null) {
            // 使用褪色颜色而不是alpha变化
            drawColor = getGroupFadeColor(this.assimilatedGroup);
            groupAlpha = getGroupFadeAlpha(this.assimilatedGroup);
        }

        ctx.globalAlpha = this.alpha * groupAlpha;

        if (this.absorbing) {
            // 吸收中的粒子有融合发光效果
            const fusionIntensity = 1 + Math.sin(this.absorbProgress * Math.PI * 6) * 0.3; // 快速脉冲
            ctx.shadowColor = drawColor;
            ctx.shadowBlur = 10 * fusionIntensity; // 减弱泛光
        } else if (this.connected) {
            // 连接的粒子发光
            ctx.shadowColor = drawColor;
            ctx.shadowBlur = 8; // 减弱泛光
        }

        ctx.fillStyle = drawColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// 创建漂浮点
const particles = [];
const particleCount = 60;

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
    activeNameTags.clear();
    
    // 确保画布大小正确
    if (particleCanvas.width === 0 || particleCanvas.height === 0) {
        resizeCanvases();
    }
    
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }

    ensureBodyColorParticles();
    
    //console.log('粒子初始化完成，数量:', particles.length, '画布大小:', particleCanvas.width, 'x', particleCanvas.height);
}

// 确保画布resize后再初始化粒子
resizeCanvases();
initParticles();

// 身体关键点
let currentLandmarks = [];
let currentWorldLandmarks = [];
let lastKnownLandmarks = []; // 存储最后检测到的身体关键点

// 身体节点大小跟踪（吸收粒子后会变大）
let bodyNodeSizes = {};
const BASE_BODY_NODE_SIZE = 12; // 基础大小
const MAX_BODY_NODE_SIZE = 30; // 最大大小

// 位置平滑缓存，用于减少抖动
let smoothedLandmarks = {};
const SMOOTHING_FACTOR = 0.95; // 平滑因子 (0-1, 越大越平滑)

// 应用位置平滑以减少抖动
function applyHandOffsets(landmarks) {
    if (!landmarks || landmarks.length === 0) return landmarks;
    const adjusted = landmarks.map(lm => lm ? { ...lm } : lm);

    // 左手：在左肘(13)与左腕(15)之间插值，写入左肩索引(11)作为手节点
    const leftElbow = landmarks[13];
    const leftWrist = landmarks[15];
    if (leftElbow && leftWrist) {
        const t = handBlend.left;
        adjusted[LANDMARK_INDEX.leftShoulder] = {
            x: leftElbow.x + (leftWrist.x - leftElbow.x) * t,
            y: leftElbow.y + (leftWrist.y - leftElbow.y) * t,
            visibility: Math.min(leftElbow.visibility || 1, leftWrist.visibility || 1)
        };
    }

    // 右手：在右肘(14)与右腕(16)之间插值
    const rightElbow = landmarks[14];
    const rightWrist = landmarks[16];
    if (rightElbow && rightWrist) {
        const t = handBlend.right;
        adjusted[LANDMARK_INDEX.rightWrist] = {
            x: rightElbow.x + (rightWrist.x - rightElbow.x) * t,
            y: rightElbow.y + (rightWrist.y - rightElbow.y) * t,
            visibility: Math.min(rightElbow.visibility || 1, rightWrist.visibility || 1)
        };
    }

    return adjusted;
}

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

// 计算姿势中心（用于整体位移倍增）
function calculatePoseCenter(landmarks) {
    let sumX = 0, sumY = 0, count = 0;
    landmarks.forEach(landmark => {
        if (landmark && landmark.visibility > 0.4) {
            sumX += landmark.x;
            sumY += landmark.y;
            count++;
        }
    });
    return count > 0 ? { x: sumX / count, y: sumY / count } : { x: 0.5, y: 0.5 };
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
    const instantDeathBtn = document.getElementById("instantDeathButton");
    if (instantDeathBtn) {
        instantDeathBtn.addEventListener("click", forceBodyDeath);
    }
} else {
    webcamButton.disabled = true;
    webcamButton.textContent = "The browser does not support the camera";
}

// 空格键隐藏/显示控制按钮
document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
        const controls = document.querySelector(".controls");
        if (!controls) return;
        const hidden = controls.style.display === "none";
        controls.style.display = hidden ? "flex" : "none";
    }
});

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


        // 清空主画布（透明背景）
        mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        currentLandmarks = [];
        lastKnownLandmarks = []; // 清空最后已知的关键点

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
        startNewBodySession();

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
                    //console.log("视频已准备好，立即开始检测");
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
        //console.log('检查粒子互动，关键点数量:', landmarks.length);
    }

    // 重置身体节点大小（每次检测都重新计算）
    bodyNodeSizes = {};

    // 使用平滑后的位置进行粒子互动计算
    const smoothed = applySmoothing(landmarks);

    const interactionPoseCenter = calculatePoseCenter(smoothed);

    // 应用姿势整体水平移动倍增（只影响整个身体的左右位移）
    const interactionAmplifiedCenterX = 0.5 + (interactionPoseCenter.x - 0.5) * POSE_TRANSLATION_MULTIPLIER;

    // 计算垂直偏移以确保脚部位于屏幕底部上方指定距离
    const calculateVerticalOffset = () => {
        // 计算左脚的当前位置（不包含最终的垂直偏移）
        const footLandmark = smoothed[LANDMARK_INDEX.leftFoot];
        if (!footLandmark) return 0;

        const relativeX = footLandmark.x - interactionPoseCenter.x;
        const relativeY = footLandmark.y - interactionPoseCenter.y;
        const mirroredRelativeX = -relativeX;
        const amplifiedX = interactionAmplifiedCenterX + mirroredRelativeX;
        const offsetX = (amplifiedX - 0.5) * particleCanvas.width;
        const offsetY = (interactionPoseCenter.y + relativeY - 0.5) * particleCanvas.height;

        const dynamicScaleFactor = calculateBodyScaleFactor(smoothed);
        const footX = particleCanvas.width / 2 + offsetX * dynamicScaleFactor;
        const footY = particleCanvas.height / 2 + offsetY * dynamicScaleFactor + LEFT_FOOT_ART_OFFSET;

        // 计算需要多少偏移才能让脚位于目标位置
        const targetFootY = particleCanvas.height - FEET_OFFSET_FROM_BOTTOM;
        return targetFootY - footY;
    };

    const verticalOffset = calculateVerticalOffset();

    smoothed.forEach((landmark, index) => {
        // 应用身体缩放因子，让人物在近距离就能被完整采集
        const centerX = mainCanvas.width / 2;
        const centerY = mainCanvas.height / 2;

        // 计算相对于姿势中心的偏移（四肢移动保持正常），然后应用整体位移倍增
        const relativeX = landmark.x - interactionPoseCenter.x; // 相对于姿势中心的水平偏移
        const relativeY = landmark.y - interactionPoseCenter.y; // 相对于姿势中心的垂直偏移

        // 应用水平镜像和整体位移倍增
        const mirroredRelativeX = -relativeX; // 水平镜像
        const amplifiedX = interactionAmplifiedCenterX + mirroredRelativeX; // 应用整体位移倍增后的中心

        // 计算最终坐标
        const offsetX = (amplifiedX - 0.5) * mainCanvas.width;
        const offsetY = (interactionPoseCenter.y + relativeY - 0.5) * mainCanvas.height;

        const dynamicScaleFactor = calculateBodyScaleFactor(smoothed);
        const x = centerX + offsetX * dynamicScaleFactor;
        const y = centerY + offsetY * dynamicScaleFactor + verticalOffset + (index === LANDMARK_INDEX.leftFoot ? LEFT_FOOT_ART_OFFSET : 0);

        // 脚部水平随机偏移（像素）
        let adjustedX = x;
        if (index === LANDMARK_INDEX.leftFoot) adjustedX += footOffset.left;
        if (index === LANDMARK_INDEX.rightAnkle) adjustedX += footOffset.right;

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

        const connectDistance = 88; // 更紧的连接半径
        const repulsionDistance = 130; // 强烈排斥半径

        particles.forEach(particle => {
            // 已并入其他身体节点的不再与当前节点互动
            if (particle.connected && particle.connectedBodyIndex !== index) {
                return;
            }

            const dx = x - particle.x;
            const dy = y - particle.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 0.0001;

            // 自由粒子状态：可以连接到相同颜色的身体节点，被不同颜色的身体节点排斥
            if (particle.isFree) {
                if (particle.color === bodyNodeColor) {
                    // 保证靠近计时
                    if (distance < connectDistance) {
                        const start = particle.nearBodyStart.get(index) || now;
                        particle.nearBodyStart.set(index, start);

                        if (!particle.connected && now - start >= 100) {
                            particle.connected = true;
                            particle.isFree = false; // 不再是自由状态
                            particle.connectionTime = 0;
                            particle.connectedBodyIndex = index;
                            particle.assimilatedGroup = colorIndex;
                            particle.groupId = `group_${colorIndex}_${Date.now()}`; // 分配唯一的组ID
                            refreshBodyGroup(colorIndex, particle);
                            console.log('自由粒子连接到身体节点，加入组:', particle.groupId);
                            triggerGreeting(particle, x, y);
                        }
                    } else {
                        particle.nearBodyStart.delete(index);
                    }

                    if (particle.connected && particle.connectedBodyIndex === index) {
                        // 稳定牵引，让连接保持贴合
                        if (distance > 2) {
                            const BODY_CONNECTION_FORCE = 0.028; // 身体节点对连接粒子的牵引力
                            particle.vx += (dx / distance) * BODY_CONNECTION_FORCE;
                            particle.vy += (dy / distance) * BODY_CONNECTION_FORCE;
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
                    // 自由粒子被不同颜色的身体节点排斥
                    particle.nearBodyStart.delete(index);

                    if (distance < repulsionDistance) {
                        const BASE_REPULSION_FORCE = 0.08; // 基础排斥力
                        const IMPACT_REPULSION_FORCE = 0.22; // 近距离冲击力
                        const baseForce = BASE_REPULSION_FORCE;
                        const impactForce = distance < 40 ? IMPACT_REPULSION_FORCE : 0;
                        const force = baseForce + impactForce;
                        particle.vx -= (dx / distance) * force;
                        particle.vy -= (dy / distance) * force;
                    }
                }
            } else {
                // 已连接的粒子不再被不同颜色的身体节点排斥
                // 只处理相同颜色的连接维护
                if (particle.color === bodyNodeColor && particle.connected && particle.connectedBodyIndex === index) {
                    // 稳定牵引，让连接保持贴合
                    if (distance > 2) {
                        const BODY_CONNECTION_FORCE = 0.028; // 身体节点对连接粒子的牵引力
                        particle.vx += (dx / distance) * BODY_CONNECTION_FORCE;
                        particle.vy += (dy / distance) * BODY_CONNECTION_FORCE;
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
            }

            // 限制速度 - 可调整此值来控制粒子最大移动速度
            const MAX_PARTICLE_SPEED = 1.05; // 最大速度限制，调大允许更快移动
            const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
            if (speed > MAX_PARTICLE_SPEED) {
                particle.vx = (particle.vx / speed) * MAX_PARTICLE_SPEED;
                particle.vy = (particle.vy / speed) * MAX_PARTICLE_SPEED;
            }
        });
    });

    // 连接的粒子与其他所有粒子保持轻微距离，避免重叠
    const connectedParticles = particles.filter(p => p.connected && !p.isFree);
    connectedParticles.forEach(anchor => {
        particles.forEach(other => {
            if (anchor === other) return;

            const dx = anchor.x - other.x;
            const dy = anchor.y - other.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;

            // 连接的粒子对所有其他粒子保持轻微排斥，避免重叠
            if (distance < 25) { // 轻微排斥距离
                const AVOIDANCE_FORCE = 0.015; // 轻微排斥力
                other.vx -= (dx / distance) * AVOIDANCE_FORCE;
                other.vy -= (dy / distance) * AVOIDANCE_FORCE;
            }

            // 限制速度
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
const GROUP_FADE_DELAY = 0; // 无延迟，连接后立即开始

// ===== 重生系统 =====
const RESPAWN_DELAY = 15 * 1000; // 15秒后允许新身体重生
let lastBodyDeathTime = 0; // 最后一次身体死亡的时间
let isRespawning = false; // 是否正在重生倒计时中

// 检查是否所有身体组都已消失（包括重生倒计时期间）
function areAllBodyGroupsDead() {
    return POSE_COLORS.every((_, index) => isGroupExpired(index));
}

// 手动触发身体死亡（调试按钮）
function forceBodyDeath() {
    if (!bodyTrackingEnabled) return;
    bodyTrackingEnabled = false;
    bodyDeadUntil = performance.now() + RESPAWN_DELAY;
    nameTagState.falling = true;
    if (currentUsername) addNameToDatabase(currentUsername);
    particles.forEach(p => {
        p.collapsing = true;
        p.connected = false;
        p.isFree = false;
        p.connectedBodyIndex = -1;
        p.assimilatedGroup = null;
        p.groupId = null;
        p.nearBodyStart.clear();
    });
    console.log('[ForceDeath] triggered, respawn in', RESPAWN_DELAY, 'ms');
}
const bodyGroupTimers = POSE_COLORS.map(() => ({
    lastRefresh: performance.now(),
    particles: new Set(),
    duration: 15000 + Math.random() * 10000, // 15-25秒随机持续时间
    started: false // 计时器是否已经启动（避免每帧重置）
}));

function refreshBodyGroup(colorIndex, particle) {
    const state = bodyGroupTimers[colorIndex];
    state.started = true;
    state.lastRefresh = performance.now();
    state.duration = 15000 + Math.random() * 10000; // 15-25秒
    if (particle) {
        state.particles.add(particle);
    }
}

function resetBodyGroupTimers() {
    const now = performance.now();
    bodyGroupTimers.forEach(state => {
        state.lastRefresh = now;
        state.particles.clear();
        state.duration = 15000 + Math.random() * 10000; // 重新生成随机持续时间
        state.started = false;
    });
}

function startNewBodySession() {
    resetBodyGroupTimers();
    POSE_COLORS = shuffleBodyColors(); // 每次身体生成随机颜色，但五个节点颜色互不重复
    // 循环 + 随机选择，确保不会一直重复同一预设
    currentPreset = BODY_PRESETS[presetIndex % BODY_PRESETS.length];
    presetIndex++;
    // 额外随机一次：有 1/2 概率打乱选择
    if (Math.random() < 0.5) {
        currentPreset = BODY_PRESETS[Math.floor(Math.random() * BODY_PRESETS.length)];
    }
    console.log('[Body Preset]', currentPreset);
    randomizeHandBlend();
    currentUsername = generateUsername();
    nameTagState = { x: 0, y: 0, vy: 0, active: false, falling: false };
    footOffset.left = (Math.random() * 50 - 25);  // -25~25 px
    footOffset.right = (Math.random() * 50 - 25); // -25~25 px
    if (!hasInitializedNameDb) {
        resetNameDatabase(); // 会话启动时清空数据库
        hasInitializedNameDb = true;
    }
    activeNameTags.clear();
    speechBubbles = [];
    lastHeadScreenPos = { x: 0, y: 0, valid: false };
}

// 判断组是否计时结束（用于逻辑判定，而非视觉透明度）
function isGroupExpired(colorIndex) {
    const state = bodyGroupTimers[colorIndex];
    if (!state.started) return false;
    const elapsed = performance.now() - state.lastRefresh;
    return elapsed >= state.duration;
}

// 初始化首个身体配置（确保 bodyGroupTimers 已声明后再调用）
startNewBodySession();

// 获取褪色后的颜色（向灰色#323232渐变）
function getGroupFadeColor(colorIndex) {
    const state = bodyGroupTimers[colorIndex];
    // 计时器未启动则保持原色
    if (!state.started) return POSE_COLORS[colorIndex];

    const elapsed = performance.now() - state.lastRefresh;
    if (elapsed <= 0) return POSE_COLORS[colorIndex];

    // 立即开始褪色（无延迟）
    if (elapsed <= GROUP_FADE_DELAY) return POSE_COLORS[colorIndex];

    // 开始褪色，持续时间为该组的随机持续时间
    const fadeElapsed = elapsed - GROUP_FADE_DELAY;
    const fadeDuration = state.duration; // 使用该组的随机持续时间

    if (fadeElapsed >= fadeDuration) return '#323232'; // 灰色

    // 计算褪色比例
    const fadeRatio = fadeElapsed / fadeDuration;

    // 直接在十六进制空间进行线性插值
    const originalHex = POSE_COLORS[colorIndex];
    const targetHex = '#323232';

    // 提取RGB分量
    const origR = parseInt(originalHex.slice(1, 3), 16);
    const origG = parseInt(originalHex.slice(3, 5), 16);
    const origB = parseInt(originalHex.slice(5, 7), 16);

    const targetR = 0x32; // 50 in decimal
    const targetG = 0x32; // 50 in decimal
    const targetB = 0x32; // 50 in decimal

    // 线性插值
    const r = Math.round(origR + (targetR - origR) * fadeRatio);
    const g = Math.round(origG + (targetG - origG) * fadeRatio);
    const b = Math.round(origB + (targetB - origB) * fadeRatio);

    // 转换回十六进制
    const hexR = r.toString(16).padStart(2, '0');
    const hexG = g.toString(16).padStart(2, '0');
    const hexB = b.toString(16).padStart(2, '0');

    return `#${hexR}${hexG}${hexB}`;
}

// 保持向后兼容的alpha函数（用于其他用途）
function getGroupFadeAlpha(colorIndex) {
    const state = bodyGroupTimers[colorIndex];
    // 计时器未启动则保持不透明
    if (!state.started) return 1;

    // 保持全程不透明，颜色用 getGroupFadeColor 处理
    return 1;
}

// 颜色明暗调整（amt: 正数提亮，负数加深，范围建议-1~1）
function shadeColor(hex, amt) {
    const r = Math.min(255, Math.max(0, parseInt(hex.slice(1, 3), 16) + 255 * amt));
    const g = Math.min(255, Math.max(0, parseInt(hex.slice(3, 5), 16) + 255 * amt));
    const b = Math.min(255, Math.max(0, parseInt(hex.slice(5, 7), 16) + 255 * amt));
    return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
}

// 绘制玻璃球体（柔和高光/阴影，避免过曝与透明孔洞）
function drawGlassSphere(ctx, x, y, r, color, alpha = 1, softShadow = true) {
    ctx.save();
    ctx.globalAlpha = alpha;

    // 更柔的光晕（降低，避免穿洞）
    ctx.shadowColor = "rgba(255,255,255,0.1)";
    ctx.shadowBlur = softShadow ? r * 0.18 : r * 0.12;

    // 先铺一层完整的不透明主体色，确保中心不被抠空
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // 叠加柔和高光/阴影
    const highlight = shadeColor(color, 0.12);
    const mid = shadeColor(color, 0.04);
    const shadow = shadeColor(color, -0.08);

    const grad = ctx.createRadialGradient(
        x - r * 0.24, y - r * 0.28, r * 0.2,
        x, y, r * 1.05
    );
    grad.addColorStop(0, "rgba(255,255,255,0.35)");
    grad.addColorStop(0.22, highlight);
    grad.addColorStop(0.55, mid);
    grad.addColorStop(1, shadow);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// 绘制黏液（goo）形状：根据节点动态拟合
function drawGooShape(ctx, points, color) {
    if (!points || points.length < 3) return;
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const sorted = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));

    ctx.save();
    const radGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(mainCanvas.width, mainCanvas.height) * 0.4);
    radGrad.addColorStop(0, shadeColor(color, 0.2));
    radGrad.addColorStop(0.6, color + "aa");
    radGrad.addColorStop(1, color + "55");

    ctx.fillStyle = radGrad;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;

    const getMid = (p1, p2) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
    ctx.beginPath();
    for (let i = 0; i < sorted.length; i++) {
        const p1 = sorted[i];
        const p2 = sorted[(i + 1) % sorted.length];
        const mid = getMid(p1, p2);
        if (i === 0) ctx.moveTo(mid.x, mid.y);
        ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y);
    }
    ctx.closePath();
    ctx.fill();

    // 边缘柔光
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
}

// 背景与地面渲染（深空+薄雾+地面反射）
function renderBackdrop(ctx) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const radGrad = ctx.createRadialGradient(
        w * 0.5, h * 0.4, Math.min(w, h) * 0.05,
        w * 0.5, h * 0.5, Math.max(w, h) * 0.8
    );
    radGrad.addColorStop(0, "rgba(30,40,60,0.35)");
    radGrad.addColorStop(0.5, "rgba(8,10,18,0.65)");
    radGrad.addColorStop(1, "rgba(2,4,8,0.95)");
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, w, h);

    // 轻微雾气
    // 地面反射面
    const floorH = h * 0.14;
    const floorY = h - floorH;
    const floorGrad = ctx.createLinearGradient(0, floorY, 0, h);
    floorGrad.addColorStop(0, "rgba(120,180,220,0.05)");
    floorGrad.addColorStop(1, "rgba(80,120,200,0.08)");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorY, w, floorH);
}

// 反射镜像：将节点与三角形在指定地面高度下方镜像
function drawBodyReflection(ctx, nodes, tris, planeY) {
    if ((!nodes || !nodes.length) && (!tris || !tris.length)) return;
    const h = ctx.canvas.height;
    const floorY = planeY ?? (h - h * 0.14);
    ctx.save();
    ctx.globalAlpha = 0.08; // 进一步降低叠加感
    ctx.globalCompositeOperation = "screen"; // 更柔和的叠加，避免覆盖自由粒子
    // 仅在地面以下绘制反射
    ctx.beginPath();
    ctx.rect(0, floorY, ctx.canvas.width, ctx.canvas.height - floorY);
    ctx.clip();

    if (nodes && nodes.length) {
        nodes.forEach(n => {
            const ry = floorY + (floorY - n.y);
            const grad = ctx.createRadialGradient(
                n.x - n.size * 0.25, ry - n.size * 0.25, n.size * 0.2,
                n.x, ry, n.size * 1.05
            );
            grad.addColorStop(0, "rgba(255,255,255,0.25)");
            grad.addColorStop(0.4, n.color);
            grad.addColorStop(1, "rgba(0,0,0,0.25)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(n.x, ry, n.size, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    if (tris && tris.length) {
        tris.forEach(t => {
            const rp1 = { x: t.p1.x, y: floorY + (floorY - t.p1.y) };
            const rp2 = { x: t.p2.x, y: floorY + (floorY - t.p2.y) };
            const rp3 = { x: t.p3.x, y: floorY + (floorY - t.p3.y) };
            const cx = (rp1.x + rp2.x + rp3.x) / 3;
            const cy = (rp1.y + rp2.y + rp3.y) / 3;
            const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 260);
            grad.addColorStop(0, "rgba(255,255,255,0.18)");
            grad.addColorStop(0.55, t.color);
            grad.addColorStop(1, "rgba(0,0,0,0.25)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(rp1.x, rp1.y);
            ctx.lineTo(rp2.x, rp2.y);
            ctx.lineTo(rp3.x, rp3.y);
            ctx.closePath();
            ctx.fill();
        });
    }

    ctx.restore();
}

function removeParticleFromGroups(particle) {
    bodyGroupTimers.forEach(state => state.particles.delete(particle));
}

function getColorIndexFromHex(color) {
    return POSE_COLORS.indexOf(color);
}

// 绘制身体特征点（透明背景，只显示指定的关键点）
function drawLandmarks(landmarks, isTrackingLost = false) {
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    renderBackdrop(mainCtx);

    if (!landmarks || landmarks.length === 0) {
        nameTagState.active = false;
        return;
    }

    // 为检测到的身体节点启动计时器（仅首次启动，不每帧刷新）
    Object.values(POSE_GROUPS).forEach(group => {
        const landmark = landmarks[group.indices[0]];
        // 只要检测到该关键点（无论可见度高低），就启动计时器
        if (landmark) {
            const state = bodyGroupTimers[group.colorIndex];
            if (!state.started) {
                state.started = true;
                state.lastRefresh = performance.now();
                state.duration = 15000 + Math.random() * 10000; // 15-25秒
            }
        }
    });



    const smoothedLandmarks = applySmoothing(landmarks);
    const MIN_NODE_SIZE = 18;

    // 计算姿势中心和放大中心（提前计算以避免重复声明）
    const poseCenter = calculatePoseCenter(smoothedLandmarks);
    const amplifiedCenterX = 0.5 + (poseCenter.x - 0.5) * POSE_TRANSLATION_MULTIPLIER;

    // 计算垂直偏移以确保脚部位于屏幕底部上方指定距离
    const calculateVerticalOffset = () => {
        // 计算左脚的当前位置（不包含最终的垂直偏移）
        const footLandmark = smoothedLandmarks[LANDMARK_INDEX.leftFoot];
        if (!footLandmark) return 0;

        const relativeX = footLandmark.x - poseCenter.x;
        const relativeY = footLandmark.y - poseCenter.y;
        const mirroredRelativeX = -relativeX;
        const amplifiedX = amplifiedCenterX + mirroredRelativeX;
        const offsetX = (amplifiedX - 0.5) * mainCanvas.width;
        const offsetY = (poseCenter.y + relativeY - 0.5) * mainCanvas.height;

        const dynamicScaleFactor = calculateBodyScaleFactor(smoothedLandmarks);
        const footX = mainCanvas.width / 2 + offsetX * dynamicScaleFactor;
        const footY = mainCanvas.height / 2 + offsetY * dynamicScaleFactor + LEFT_FOOT_ART_OFFSET;

        // 计算需要多少偏移才能让脚位于目标位置
        const targetFootY = mainCanvas.height - FEET_OFFSET_FROM_BOTTOM;
        return targetFootY - footY;
    };

    const verticalOffset = calculateVerticalOffset();

    const getPoint = (index) => {
        const landmark = smoothedLandmarks[index];
        if (!landmark) return null;
        const visibility = landmark.visibility ?? 1;
        if (visibility < 0.2) return null; // 放宽可见度阈值，避免短暂丢失导致标签/节点消失
        const artOffsetY = index === LANDMARK_INDEX.leftFoot ? LEFT_FOOT_ART_OFFSET : 0;

        // 应用身体缩放因子，让人物在近距离就能被完整采集
        const centerX = mainCanvas.width / 2;
        const centerY = mainCanvas.height / 2;

        // 计算相对于姿势中心的偏移（四肢移动保持正常），然后应用整体位移倍增
        const relativeX = landmark.x - poseCenter.x; // 相对于姿势中心的水平偏移
        const relativeY = landmark.y - poseCenter.y; // 相对于姿势中心的垂直偏移

        // 应用水平镜像和整体位移倍增
        const mirroredRelativeX = -relativeX; // 水平镜像
        const amplifiedX = amplifiedCenterX + mirroredRelativeX; // 应用整体位移倍增后的中心

        // 计算最终坐标
        const offsetX = (amplifiedX - 0.5) * mainCanvas.width;
        const offsetY = (poseCenter.y + relativeY - 0.5) * mainCanvas.height;

        const dynamicScaleFactor = calculateBodyScaleFactor(smoothedLandmarks);
        let scaledX = centerX + offsetX * dynamicScaleFactor;
        const scaledY = centerY + offsetY * dynamicScaleFactor + verticalOffset + artOffsetY;

        // 脚部水平随机偏移（像素）
        if (index === LANDMARK_INDEX.leftFoot) scaledX += footOffset.left;
        if (index === LANDMARK_INDEX.rightAnkle) scaledX += footOffset.right;

        // 调试：输出关键点坐标
        if (Math.random() < 0.01 && index === LANDMARK_INDEX.nose) { // 1%概率输出鼻子坐标
            const bodyHeight = (() => {
                let minY = 1, maxY = 0;
                const indices = [LANDMARK_INDEX.nose, LANDMARK_INDEX.leftShoulder, LANDMARK_INDEX.rightWrist, LANDMARK_INDEX.leftFoot, LANDMARK_INDEX.rightAnkle];
                indices.forEach(idx => {
                    const lm = smoothedLandmarks[idx];
                    if (lm && lm.visibility > 0.4) {
                        minY = Math.min(minY, lm.y);
                        maxY = Math.max(maxY, lm.y);
                    }
                });
                return maxY - minY;
            })();
            //console.log(`鼻子坐标: 原始(${landmark.x.toFixed(3)}, ${landmark.y.toFixed(3)}) -> 镜像+缩放后(${scaledX.toFixed(1)}, ${scaledY.toFixed(1)}), 身体高度: ${bodyHeight.toFixed(3)}, 动态缩放: ${dynamicScaleFactor.toFixed(2)}, 姿势位移倍增: ${POSE_TRANSLATION_MULTIPLIER}x, 脚部偏移: ${FEET_OFFSET_FROM_BOTTOM}px`);
        }

        return {
            x: scaledX,
            y: scaledY,
            visibility
        };
    };

    const nose = getPoint(LANDMARK_INDEX.nose);
    const leftShoulder = getPoint(LANDMARK_INDEX.leftShoulder);
    const rightWrist = getPoint(LANDMARK_INDEX.rightWrist);
    const leftFoot = getPoint(LANDMARK_INDEX.leftFoot);
    const rightAnkle = getPoint(LANDMARK_INDEX.rightAnkle);

    const drawEdgePreset = (p1, p2, color, preset) => {
        if (!p1 || !p2) return;
        const ctx = mainCtx;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len;
        const ny = dy / len;

        if (preset === "spring") {
            const segments = 12;
            const amp = 6;
            const stepX = dx / segments;
            const stepY = dy / segments;
            const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
            grad.addColorStop(0, `${color}cc`);
            grad.addColorStop(1, `${color}66`);
            ctx.save();
            ctx.strokeStyle = grad;
            ctx.lineWidth = 5;
            ctx.shadowColor = `${color}`;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const px = p1.x + stepX * i + Math.sin(t * Math.PI * segments) * amp * (1 - Math.abs(t - 0.5) * 1.2);
                const py = p1.y + stepY * i + Math.cos(t * Math.PI * segments) * amp * 0.25;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
            ctx.restore();
        } else if (preset === "tube") {
            ctx.save();
            const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
            grad.addColorStop(0, `${color}dd`);
            grad.addColorStop(1, `${color}88`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 10;
            ctx.shadowColor = `${color}`;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.restore();
        } else if (preset === "lightband") {
            ctx.save();
            const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
            grad.addColorStop(0, `${color}bb`);
            grad.addColorStop(1, `${color}44`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 6;
            ctx.shadowColor = `${color}`;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.restore();
        } else if (preset === "dots") {
            ctx.save();
            const dots = 14;
            for (let i = 0; i <= dots; i++) {
                const t = i / dots;
                const px = p1.x + dx * t;
                const py = p1.y + dy * t;
                const sz = 3 + Math.sin(t * Math.PI) * 2;
                ctx.globalAlpha = 0.4 + 0.6 * Math.sin(t * Math.PI);
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(px, py, sz, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        } else {
            // tri_glass 默认线（淡光）
            ctx.save();
            const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
            grad.addColorStop(0, `${color}aa`);
            grad.addColorStop(1, `${color}33`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 5;
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.restore();
        }
    };

    const drawTriangle = (p1, p2, p3, color) => {
        if (!p1 || !p2 || !p3) return;
        mainCtx.save();
        let triangleAlpha = 0.45;
        let shadowBlur = 6;

        if (isTrackingLost) {
            triangleAlpha *= 0.6;
            shadowBlur = 10;
        }

        // 玻璃质感：填充用径向渐变，带轻微折射色调
        const cx = (p1.x + p2.x + p3.x) / 3;
        const cy = (p1.y + p2.y + p3.y) / 3;
        const grad = mainCtx.createRadialGradient(cx, cy, 8, cx, cy, Math.hypot(p1.x - cx, p1.y - cy) * 1.2);
        grad.addColorStop(0, shadeColor(color, 0.18));
        grad.addColorStop(0.55, shadeColor(color, 0.04));
        grad.addColorStop(1, "rgba(255,255,255,0.08)");

        mainCtx.globalAlpha = triangleAlpha;
        mainCtx.beginPath();
        mainCtx.moveTo(p1.x, p1.y);
        mainCtx.lineTo(p2.x, p2.y);
        mainCtx.lineTo(p3.x, p3.y);
        mainCtx.closePath();
        mainCtx.fillStyle = grad;
        mainCtx.shadowColor = color;
        mainCtx.shadowBlur = shadowBlur;
        mainCtx.fill();

        // 玻璃边缘高光
        mainCtx.strokeStyle = "rgba(255,255,255,0.35)";
        mainCtx.lineWidth = 2;
        mainCtx.stroke();
        mainCtx.restore();
    };

    const refTris = [];
    const refNodes = [];
    // tri_glass：绘制三角；goo：绘制中心黏液形状；其他预设：绘制连线
    if (currentPreset === "tri_glass") {
        if (getGroupFadeAlpha(0) > 0 && getGroupFadeAlpha(1) > 0 && getGroupFadeAlpha(2) > 0) {
            const c = getGroupFadeColor(0);
            drawTriangle(nose, leftShoulder, rightWrist, c);
            refTris.push({ p1: nose, p2: leftShoulder, p3: rightWrist, color: c });
        }
        if (getGroupFadeAlpha(0) > 0 && getGroupFadeAlpha(1) > 0 && getGroupFadeAlpha(3) > 0) {
            const c = getGroupFadeColor(3);
            drawTriangle(nose, leftShoulder, leftFoot, c);
            refTris.push({ p1: nose, p2: leftShoulder, p3: leftFoot, color: c });
        }
        if (getGroupFadeAlpha(0) > 0 && getGroupFadeAlpha(2) > 0 && getGroupFadeAlpha(3) > 0) {
            const c = getGroupFadeColor(1);
            drawTriangle(nose, rightWrist, leftFoot, c);
            refTris.push({ p1: nose, p2: rightWrist, p3: leftFoot, color: c });
        }
        if (getGroupFadeAlpha(1) > 0 && getGroupFadeAlpha(2) > 0 && getGroupFadeAlpha(4) > 0) {
            const c = getGroupFadeColor(2);
            drawTriangle(leftShoulder, rightWrist, rightAnkle, c);
            refTris.push({ p1: leftShoulder, p2: rightWrist, p3: rightAnkle, color: c });
        }
    } else if (currentPreset === "goo") {
        const gooPoints = [nose, leftShoulder, rightWrist, leftFoot, rightAnkle].filter(Boolean);
        const gooColor = getGroupFadeColor(0);
        drawGooShape(mainCtx, gooPoints, gooColor);
    } else {
        const edges = [
            { p1: nose, p2: leftShoulder, color: getGroupFadeColor(0) },
            { p1: nose, p2: rightWrist,  color: getGroupFadeColor(2) },
            { p1: nose, p2: leftFoot,    color: getGroupFadeColor(3) },
            { p1: nose, p2: rightAnkle,  color: getGroupFadeColor(4) },
            { p1: leftShoulder, p2: rightWrist, color: getGroupFadeColor(1) },
            { p1: leftShoulder, p2: leftFoot,   color: getGroupFadeColor(3) },
            { p1: rightWrist, p2: leftFoot,     color: getGroupFadeColor(1) },
            { p1: rightWrist, p2: rightAnkle,   color: getGroupFadeColor(2) },
        ];
        edges.forEach(e => drawEdgePreset(e.p1, e.p2, e.color, currentPreset));
    }

    // 显示随机用户名标签（头顶）
    if (nose) {
        nameTagState.x = nose.x;
        nameTagState.y = nose.y - 40;
        nameTagState.vy = 0;
        nameTagState.active = true;
        nameTagState.falling = false;
        updateAndDrawNameTag(true);
        lastHeadScreenPos = { x: nose.x, y: nose.y, valid: true };
    }

    // 反射平面：基于脚底
    const planeY = Math.max(
        leftFoot ? leftFoot.y : mainCanvas.height * 0.9,
        rightAnkle ? rightAnkle.y : mainCanvas.height * 0.9
    ) + 4; // 以脚底为基准，向下偏移一点
    drawBodyReflection(mainCtx, refNodes, refTris, planeY);

    drawSpeechBubbles();

    // 使用全局计算的姿势中心和放大中心

    // 绘制关键点 - 仅保留五个节点，颜色与示例一致且更大
    for (const [groupName, group] of Object.entries(POSE_GROUPS)) {
        const originalColor = POSE_COLORS[group.colorIndex];
        const fadeColor = getGroupFadeColor(group.colorIndex);
        const fadeAlpha = getGroupFadeAlpha(group.colorIndex);

        if (fadeAlpha <= 0) {
            continue;
        }

        group.indices.forEach(index => {
            const landmark = smoothedLandmarks[index];
            if (!landmark) return;
            const visibility = landmark.visibility || 1;
            let blendedAlpha = visibility * fadeAlpha;

            // 如果跟踪丢失，降低透明度作为视觉提示
            if (isTrackingLost) {
                blendedAlpha *= 0.6; // 降低到60%的透明度
            }

            if (blendedAlpha > 0.4 * fadeAlpha) {
                // 应用身体缩放因子，让人物在近距离就能被完整采集
                const centerX = mainCanvas.width / 2;
                const centerY = mainCanvas.height / 2;

        // 计算相对于姿势中心的偏移（四肢移动保持正常），然后应用整体位移倍增
        const relativeX = landmark.x - poseCenter.x; // 相对于姿势中心的水平偏移
        const relativeY = landmark.y - poseCenter.y; // 相对于姿势中心的垂直偏移

        // 应用水平镜像和整体位移倍增
        const mirroredRelativeX = -relativeX; // 水平镜像
        const amplifiedX = amplifiedCenterX + mirroredRelativeX; // 应用整体位移倍增后的中心

        // 计算最终坐标
        const offsetX = (amplifiedX - 0.5) * mainCanvas.width;
        const offsetY = (poseCenter.y + relativeY - 0.5) * mainCanvas.height;

                const dynamicScaleFactor = calculateBodyScaleFactor(smoothedLandmarks);
                const x = centerX + offsetX * dynamicScaleFactor;
                const y = centerY + offsetY * dynamicScaleFactor + verticalOffset + (index === LANDMARK_INDEX.leftFoot ? LEFT_FOOT_ART_OFFSET : 0);
                const baseSize = Math.max(bodyNodeSizes[index] || BASE_BODY_NODE_SIZE, MIN_NODE_SIZE);
                const size = baseSize * 1.5; // 放大1.5倍

                // 使用统一的玻璃球体渲染
                drawGlassSphere(mainCtx, x, y, size, fadeColor, blendedAlpha, !isTrackingLost);
                refNodes.push({ x, y, size, color: fadeColor });
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

        // 使用褪色颜色
        const fadedColor = bodyColorIndex !== undefined ? getGroupFadeColor(bodyColorIndex) : color;

        particleCtx.globalAlpha = alpha * groupAlpha;

        if (currentPreset === "spring") {
            // 3D 弹簧：用波浪折线+渐变
            const baseSegments = 14;
            const len = Math.hypot(particleX - bodyX, particleY - bodyY) || 1;
            const segments = Math.max(baseSegments, Math.floor(len / 18));
            const dx = (particleX - bodyX) / segments;
            const dy = (particleY - bodyY) / segments;
            const amp = Math.min(26, Math.max(8, len * 0.06)); // 更大的幅度，随长度增加
            const grad = particleCtx.createLinearGradient(bodyX, bodyY, particleX, particleY);
            grad.addColorStop(0, `${fadedColor}cc`);
            grad.addColorStop(1, `${fadedColor}55`);
            particleCtx.strokeStyle = grad;
            particleCtx.lineWidth = 4.5;
            particleCtx.shadowColor = `${fadedColor}`;
            particleCtx.shadowBlur = 8;
            particleCtx.beginPath();
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const px = bodyX + dx * i + Math.sin(t * Math.PI * segments) * amp * (1 - Math.abs(t - 0.5) * 1.4);
                const py = bodyY + dy * i + Math.cos(t * Math.PI * segments) * amp * 0.3;
                if (i === 0) particleCtx.moveTo(px, py); else particleCtx.lineTo(px, py);
            }
            particleCtx.stroke();
            particleCtx.shadowBlur = 0;
        } else if (currentPreset === "tube") {
            // 玻璃管道：双层线（外层半透明、内层高光）
            const outerGrad = particleCtx.createLinearGradient(bodyX, bodyY, particleX, particleY);
            outerGrad.addColorStop(0, `${fadedColor}88`);
            outerGrad.addColorStop(1, `${fadedColor}44`);
            particleCtx.save();
            particleCtx.lineWidth = 14;
            particleCtx.strokeStyle = outerGrad;
            particleCtx.shadowColor = `${fadedColor}`;
            particleCtx.shadowBlur = 12;
            particleCtx.beginPath();
            particleCtx.moveTo(bodyX, bodyY);
            particleCtx.lineTo(particleX, particleY);
            particleCtx.stroke();

            const innerGrad = particleCtx.createLinearGradient(bodyX, bodyY, particleX, particleY);
            innerGrad.addColorStop(0, "rgba(255,255,255,0.55)");
            innerGrad.addColorStop(1, "rgba(255,255,255,0.15)");
            particleCtx.lineWidth = 6;
            particleCtx.strokeStyle = innerGrad;
            particleCtx.shadowBlur = 6;
            particleCtx.beginPath();
            particleCtx.moveTo(bodyX, bodyY);
            particleCtx.lineTo(particleX, particleY);
            particleCtx.stroke();
            particleCtx.restore();
        } else if (currentPreset === "goo") {
            // goo 预设下，不绘制单独边线（由中心 goo 渲染）
            // 但保留轻微节点高光提示端点
            particleCtx.save();
            particleCtx.fillStyle = fadedColor;
            particleCtx.globalAlpha = 0.4 * groupAlpha;
            particleCtx.beginPath();
            particleCtx.arc(bodyX, bodyY, 3.5, 0, Math.PI * 2);
            particleCtx.fill();
            particleCtx.beginPath();
            particleCtx.arc(particleX, particleY, 3.5, 0, Math.PI * 2);
            particleCtx.fill();
            particleCtx.restore();
        } else if (currentPreset === "dots") {
            // 点阵连线
            const dots = 18;
            for (let i = 0; i <= dots; i++) {
                const t = i / dots;
                const px = bodyX + (particleX - bodyX) * t;
                const py = bodyY + (particleY - bodyY) * t;
                const sz = 3 + Math.sin(t * Math.PI) * 2;
                particleCtx.beginPath();
                particleCtx.fillStyle = fadedColor;
                particleCtx.globalAlpha = (0.4 + 0.6 * Math.sin(t * Math.PI)) * groupAlpha;
                particleCtx.arc(px, py, sz, 0, Math.PI * 2);
                particleCtx.fill();
            }
            particleCtx.globalAlpha = alpha * groupAlpha;
        } else { // tri_glass 默认
            const gradient = particleCtx.createLinearGradient(bodyX, bodyY, particleX, particleY);
            gradient.addColorStop(0, `${fadedColor}aa`);
            gradient.addColorStop(1, `${fadedColor}00`);

            particleCtx.lineWidth = 6;
            particleCtx.strokeStyle = gradient;
            particleCtx.shadowColor = fadedColor;
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

            particleCtx.shadowBlur = 0;
            particleCtx.globalAlpha = alpha * groupAlpha;
        }
    });

    particleCtx.restore();
}

// 绘制头顶名称标签
function drawNameTag(x, y, name) {
    if (!name) return;
    mainCtx.save();
    const fontSize = 20;
    mainCtx.font = `${fontSize}px Arial, sans-serif`;
    const textWidth = mainCtx.measureText(name).width;
    const padding = 8;
    const rectX = x - textWidth / 2 - padding;
    const rectY = y - fontSize - padding * 1.2;
    const rectW = textWidth + padding * 2;
    const rectH = fontSize + padding * 1.2;

    // 背景
    mainCtx.fillStyle = "rgba(0, 0, 0, 0.55)";
    mainCtx.beginPath();
    mainCtx.roundRect(rectX, rectY, rectW, rectH, 6);
    mainCtx.fill();

    // 文本
    mainCtx.fillStyle = "#FFFFFF";
    mainCtx.fillText(name, x - textWidth / 2, rectY + rectH - padding * 0.6);
    mainCtx.restore();
}

function updateAndDrawNameTag(isTracking) {
    if (!nameTagState.active) return;

    if (!isTracking && nameTagState.falling) {
        // 简单重力下落
        nameTagState.vy += 0.35;
        nameTagState.y += nameTagState.vy;
        // 落地后停止显示
        if (nameTagState.y >= mainCanvas.height - 40) {
            nameTagState.active = false;
            return;
        }
    }

    drawNameTag(nameTagState.x, nameTagState.y, currentUsername);
}

// 绘制粒子名牌（用于带有 nameTag 的粒子）
function drawParticleNameTag(ctx, particle) {
    if (!particle.nameTag) return;
    const fontSize = 14;
    ctx.save();
    ctx.font = `${fontSize}px Arial, sans-serif`;
    const padding = 6;
    const textWidth = ctx.measureText(particle.nameTag).width;
    const rectW = textWidth + padding * 2;
    const rectH = fontSize + padding * 1.2;
    const rectX = particle.x - rectW / 2;
    const rectY = particle.y - particle.size - rectH - 4;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(rectX, rectY, rectW, rectH, 6);
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(particle.nameTag, rectX + padding, rectY + rectH - padding * 0.6);
    ctx.restore();
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
    particleCtx.globalCompositeOperation = "source-over"; // 避免叠加模式影响自由节点
    // 当身体追踪关闭时，清理主画布并绘制下落的名牌
    if (!bodyTrackingEnabled) {
        mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        updateAndDrawNameTag(false);
        drawSpeechBubbles();
    }

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
        drawParticleNameTag(particleCtx, particle);
    });

    // 调试信息：显示粒子数量（低频）
    if (Math.random() < 0.01) { // 1%的几率显示
        //console.log('当前粒子数量:', particles.length, '设置数量:', particleCount);
    }

    // 调试信息（减少频率）
    if (Math.random() < 0.01) { // 1%的几率输出调试信息
        const connectedCount = particles.filter(p => p.connected).length;
        //console.log(`粒子状态: 总数${particles.length}, 已连接${connectedCount}, 连线数量${bodyParticleConnections.length}`);
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

    const now = performance.now();

    // 身体死亡后的冷却期：关闭追踪，只绘制粒子
    if (!bodyTrackingEnabled) {
        if (now >= bodyDeadUntil) {
            // 冷却结束，重生身体
            bodyTrackingEnabled = true;
            startNewBodySession();
            currentLandmarks = [];
            lastKnownLandmarks = [];
            bodyParticleConnections = [];
            nameTagState.active = false;
            nameTagState.falling = false;
            nameTagState.vy = 0;
            console.log('身体重生，重新开启追踪');
        } else {
            // 冷却中，继续绘制粒子并跳过检测
            drawParticles();
            mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
            updateAndDrawNameTag(false);
            if (webcamRunning) {
                animationFrameId = window.requestAnimationFrame(predictWebcam);
            }
            return;
        }
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

                    const adjustedLandmarks = applyHandOffsets(result.landmarks[0]);
                    currentLandmarks = adjustedLandmarks;
                    currentWorldLandmarks = result.worldLandmarks ? result.worldLandmarks[0] : [];
                    lastKnownLandmarks = [...adjustedLandmarks]; // 保存最后检测到的关键点

                    if (Math.random() < 0.03) { // 3%的几率输出检测信息
                        console.log("检测到身体，关键点数量:", currentLandmarks.length);
                    }

                    // 检查互动
                    checkParticleInteractions(adjustedLandmarks);

                    // 绘制特征点
                    drawLandmarks(adjustedLandmarks, false);

                    // 检查身体是否全部消失，触发死亡与冷却
                    if (areAllBodyGroupsDead()) {
                        bodyTrackingEnabled = false;
                            bodyDeadUntil = performance.now() + RESPAWN_DELAY; // 恢复正常冷却
                            nameTagState.falling = true; // 名牌开始下落
                            if (currentUsername) addNameToDatabase(currentUsername); // 记录死亡用户名
                            // 全身死亡时，所有粒子统一坠落
                            particles.forEach(p => {
                                p.collapsing = true;
                                p.connected = false;
                                p.isFree = false;
                                p.connectedBodyIndex = -1;
                                p.assimilatedGroup = null;
                                p.groupId = null;
                                p.nearBodyStart.clear();
                            });
                        console.log('身体已死亡，关闭追踪，15秒后重生');
                    }

                } else {
                    // 没有检测到身体，保持最后已知的位置，继续绘制
                    if (lastKnownLandmarks.length > 0) {
                        if (Math.random() < 0.02) { // 2%的几率输出跟踪丢失信息
                            console.log("跟踪丢失，使用最后已知位置继续显示身体骨架");
                        }
                        // 检查互动（使用最后已知的位置）
                        checkParticleInteractions(lastKnownLandmarks);
                        // 绘制特征点（使用最后已知的位置，标记为跟踪丢失状态）
                        drawLandmarks(lastKnownLandmarks, true);
                    } else {
                        // 没有任何历史记录，清空画布
                        mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
                            nameTagState.active = false;
                    }
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

    // 颜色系统调试信息
    console.log('=== 颜色系统配置 ===');
    console.log('身体节点颜色 (5种):', POSE_COLORS);
    console.log('浮动粒子颜色 (10种):', particleColors);
    console.log('颜色系统验证:', particleColors.slice(0, 5).every(color => POSE_COLORS.includes(color)) ? '✓ 身体颜色已包含在粒子颜色中' : '✗ 颜色配置错误');

    // 交互效果调试信息
    console.log('=== 交互效果配置 ===');
    console.log('主Canvas镜像: 已禁用 (直接映射)');
    console.log('粒子Canvas镜像: 已禁用 (直接映射)');
    console.log('坐标计算: 使用水平镜像逻辑、非线性距离缩放(带平滑插值)、姿势位移倍增，脚部固定在底部，包含粒子状态系统和组崩溃行为');
    console.log('预览画布: 已完全移除');
    console.log('节点褪色: 30秒后开始，10秒内完成淡化');
    console.log('跟踪丢失: 保持最后已知位置，降低透明度显示');

    // 立即测试绘制
    console.log('执行初始粒子绘制...');
    drawParticles();
}, 1000);
