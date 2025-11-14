// 全局变量
let bodyNodes = [];
let floatingNodes = [];
let connections = [];
let bodyPosition = { x: 400, y: 300 };
let bodyVelocity = { x: 0, y: 0 };
let lastSpawnTime = 0;

// 姿势检测相关
let video;
let poseNet;
let poses = [];
let poseReady = false;

// 颜色定义
const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];

// PoseNet关键点索引
const POSE_KEYPOINTS = {
    nose: 0,
    leftEye: 1,
    rightEye: 2,
    leftEar: 3,
    rightEar: 4,
    leftShoulder: 5,
    rightShoulder: 6,
    leftElbow: 7,
    rightElbow: 8,
    leftWrist: 9,
    rightWrist: 10,
    leftHip: 11,
    rightHip: 12,
    leftKnee: 13,
    rightKnee: 14,
    leftAnkle: 15,
    rightAnkle: 16
};

// 人体关键点映射到我们的身体节点系统
const BODY_NODE_MAPPING = [
    { poseIndex: POSE_KEYPOINTS.nose, label: '头部', colorIndex: 0 },
    { poseIndex: POSE_KEYPOINTS.leftShoulder, label: '左肩', colorIndex: 2 },
    { poseIndex: POSE_KEYPOINTS.rightShoulder, label: '右肩', colorIndex: 3 },
    { poseIndex: POSE_KEYPOINTS.leftElbow, label: '左肘', colorIndex: 2 },
    { poseIndex: POSE_KEYPOINTS.rightElbow, label: '右肘', colorIndex: 3 },
    { poseIndex: POSE_KEYPOINTS.leftWrist, label: '左手', colorIndex: 2 },
    { poseIndex: POSE_KEYPOINTS.rightWrist, label: '右手', colorIndex: 3 },
    { poseIndex: POSE_KEYPOINTS.leftHip, label: '左髋', colorIndex: 4 },
    { poseIndex: POSE_KEYPOINTS.rightHip, label: '右髋', colorIndex: 5 },
    { poseIndex: POSE_KEYPOINTS.leftKnee, label: '左膝', colorIndex: 4 },
    { poseIndex: POSE_KEYPOINTS.rightKnee, label: '右膝', colorIndex: 5 },
    { poseIndex: POSE_KEYPOINTS.leftAnkle, label: '左脚', colorIndex: 4 },
    { poseIndex: POSE_KEYPOINTS.rightAnkle, label: '右脚', colorIndex: 5 }
];

// 人体节点类
class BodyNode {
    constructor(x, y, label, color) {
        this.x = x;
        this.y = y;
        this.originalX = x;
        this.originalY = y;
        this.label = label;
        this.color = color;
        this.size = 8;
        this.connectedNodes = [];
        this.poseIndex = -1; // PoseNet关键点索引
        this.confidence = 0; // 检测置信度
        this.isPoseNode = false; // 是否为姿势节点
    }

    // 更新为PoseNet数据
    updateFromPose(poseKeypoint, scaleX = 1, scaleY = 1, offsetX = 0, offsetY = 0) {
        if (poseKeypoint && poseKeypoint.confidence > 0.3) { // 置信度阈值
            this.x = poseKeypoint.x * scaleX + offsetX;
            this.y = poseKeypoint.y * scaleY + offsetY;
            this.confidence = poseKeypoint.confidence;
            this.isPoseNode = true;
        } else {
            // 如果检测不到，保持当前位置但降低置信度
            this.confidence *= 0.95;
            this.isPoseNode = false;
        }
    }

    // 传统的位置更新（备用）
    update(position) {
        if (!this.isPoseNode) {
            this.x = position.x + this.originalX;
            this.y = position.y + this.originalY;
        }
    }

    display() {
        // 根据置信度调整透明度
        let alpha = this.isPoseNode ? this.confidence * 255 : 150;
        let c = color(this.color);
        c.setAlpha(alpha);

        fill(c);
        noStroke();
        ellipse(this.x, this.y, this.size * 1.5, this.size * 1.5);

        // 显示标签（只有在高置信度时）
        if (this.confidence > 0.5 || !this.isPoseNode) {
            fill(255, alpha);
            noStroke();
            textAlign(CENTER);
            textSize(10);
            text(this.label, this.x, this.y - 20);
        }
    }
}

// 浮动节点类
class FloatingNode {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = random(-1, 1);
        this.vy = random(-1, 1);
        this.color = random(colors);
        this.size = random(8, 16); // 随机大小
        this.shape = floor(random(5)); // 0:圆形, 1:椭圆, 2:三角形, 3:方形, 4:五边形
        this.timer = random(15, 25) * 1000; // 毫秒
        this.maxTimer = this.timer;
        this.connected = false;
        this.bodyNode = null;
        this.connectionTime = 0; // 连接开始时间
        this.beingAbsorbed = false; // 是否正在被吸收
    }

    update() {
        // 检查是否需要被吸收（连接超过5秒）
        if (this.connected && !this.beingAbsorbed && this.bodyNode) {
            let connectedDuration = millis() - this.connectionTime;
            if (connectedDuration > 5000) { // 5秒
                this.beingAbsorbed = true;
            }
        }

        // 如果正在被吸收，向身体节点移动
        if (this.beingAbsorbed && this.bodyNode) {
            let dx = this.bodyNode.x - this.x;
            let dy = this.bodyNode.y - this.y;
            let distance = sqrt(dx * dx + dy * dy);

            if (distance < 5) {
                // 到达身体节点，融合
                this.absorbIntoBodyNode();
                return; // 立即返回，不再执行其他逻辑
            } else {
                // 向身体节点移动
                let speed = 0.1;
                this.x += dx * speed;
                this.y += dy * speed;
            }
        } else if (!this.beingAbsorbed) {
            // 正常游走逻辑
            this.vx += random(-0.1, 0.1);
            this.vy += random(-0.1, 0.1);

            // 限制速度
            this.vx = constrain(this.vx, -2, 2);
            this.vy = constrain(this.vy, -2, 2);

            // 更新位置
            this.x += this.vx;
            this.y += this.vy;

            // 边界检查
            if (this.x < 0 || this.x > width) this.vx *= -1;
            if (this.y < 0 || this.y > height) this.vy *= -1;
        }

        // 更新timer
        if (!this.connected) {
            this.timer -= deltaTime;
        }

        // 如果timer结束，消失
        if (this.timer <= 0) {
            let index = floatingNodes.indexOf(this);
            if (index > -1) {
                floatingNodes.splice(index, 1);
            }
        }
    }

    applyForce(force) {
        this.vx += force.x;
        this.vy += force.y;
    }

    // 融合到身体节点
    absorbIntoBodyNode() {
        if (this.bodyNode) {
            // 增大身体节点的大小
            this.bodyNode.size += 1; // 每次融合增大1像素

            // 从身体节点的连接列表中移除
            let indexInBody = this.bodyNode.connectedNodes.indexOf(this);
            if (indexInBody > -1) {
                this.bodyNode.connectedNodes.splice(indexInBody, 1);
            }

            // 从浮动节点数组中移除
            let indexInFloating = floatingNodes.indexOf(this);
            if (indexInFloating > -1) {
                floatingNodes.splice(indexInFloating, 1);
            }
        }
    }

    display() {
        // 根据timer计算透明度
        let alpha = map(this.timer, 0, this.maxTimer, 50, 255);
        let c = color(this.color);
        c.setAlpha(alpha);

        fill(c);
        noStroke();

        // 根据形状类型绘制不同的图形
        switch(this.shape) {
            case 0: // 圆形
                ellipse(this.x, this.y, this.size, this.size);
                break;
            case 1: // 椭圆形
                ellipse(this.x, this.y, this.size * 1.2, this.size * 0.8);
                break;
            case 2: // 三角形
                triangle(
                    this.x, this.y - this.size/2,
                    this.x - this.size/2, this.y + this.size/2,
                    this.x + this.size/2, this.y + this.size/2
                );
                break;
            case 3: // 方形
                rectMode(CENTER);
                square(this.x, this.y, this.size);
                break;
            case 4: // 五边形
                this.drawPentagon(this.x, this.y, this.size/2);
                break;
        }
    }

    // 绘制五边形
    drawPentagon(x, y, radius) {
        beginShape();
        for (let i = 0; i < 5; i++) {
            let angle = TWO_PI / 5 * i - HALF_PI;
            let px = x + cos(angle) * radius;
            let py = y + sin(angle) * radius;
            vertex(px, py);
        }
        endShape(CLOSE);
    }
}

// 创建人体结构
// 创建基于PoseNet的真实身体结构
function createPoseBasedBodyStructure() {
    bodyNodes = [];

    // 根据BODY_NODE_MAPPING创建身体节点
    for (let mapping of BODY_NODE_MAPPING) {
        let node = new BodyNode(0, 0, mapping.label, colors[mapping.colorIndex]);
        node.poseIndex = mapping.poseIndex;
        bodyNodes.push(node);
    }
}

// 创建默认的虚拟身体结构（备用）
function createDefaultBodyStructure() {
    bodyNodes = [];

    // 头部
    bodyNodes.push(new BodyNode(0, -80, '头部', colors[0]));

    // 躯干
    bodyNodes.push(new BodyNode(0, -40, '躯干', colors[1]));

    // 左臂
    bodyNodes.push(new BodyNode(-30, -50, '左臂', colors[2]));
    bodyNodes.push(new BodyNode(-50, -30, '左手', colors[2]));

    // 右臂
    bodyNodes.push(new BodyNode(30, -50, '右臂', colors[3]));
    bodyNodes.push(new BodyNode(50, -30, '右手', colors[3]));

    // 左腿
    bodyNodes.push(new BodyNode(-15, 20, '左腿', colors[4]));
    bodyNodes.push(new BodyNode(-15, 60, '左脚', colors[4]));

    // 右腿
    bodyNodes.push(new BodyNode(15, 20, '右腿', colors[5]));
    bodyNodes.push(new BodyNode(15, 60, '右脚', colors[5]));
}

// 兼容性函数
function createBodyStructure() {
    if (poseReady && poses.length > 0) {
        createPoseBasedBodyStructure();
    } else {
        createDefaultBodyStructure();
    }
}

// 创建浮动节点
function createFloatingNodes() {
    for (let i = 0; i < 20; i++) {
        let x = random(width);
        let y = random(height);
        floatingNodes.push(new FloatingNode(x, y));
    }
}

// 计算距离
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// 更新身体节点基于PoseNet数据
function updateBodyNodesFromPose() {
    if (!poseReady || poses.length === 0 || !poses[0].pose) {
        return;
    }

    let pose = poses[0].pose;

    // 计算缩放和偏移以适应屏幕
    let scaleX = width / 320;  // 视频宽度320
    let scaleY = height / 240; // 视频高度240
    let offsetX = 0;
    let offsetY = 0;

    // 更新每个身体节点
    for (let node of bodyNodes) {
        if (node.poseIndex >= 0 && node.poseIndex < pose.keypoints.length) {
            let keypoint = pose.keypoints[node.poseIndex];
            node.updateFromPose(keypoint, scaleX, scaleY, offsetX, offsetY);
        }
    }
}

// 绘制背景文字
function drawBackgroundText() {
    // 设置文字样式
    textAlign(CENTER, CENTER);
    textSize(min(width, height) * 0.15); // 文字大小根据屏幕大小调整

    // 使用半透明的白色
    fill(255, 255, 255, 30); // 白色，30/255的透明度
    noStroke();

    // 在屏幕中心绘制文字
    text('Ephemeral-IP', width/2, height/2);

    // 可选：添加轻微的模糊效果（通过绘制多个层）
    for (let i = 0; i < 3; i++) {
        fill(255, 255, 255, 15 - i * 3); // 越来越透明
        textSize(min(width, height) * (0.15 + i * 0.02)); // 稍微不同的尺寸
        text('Ephemeral-IP', width/2, height/2);
    }
}

// 检查交互
function checkInteractions() {
    for (let bodyNode of bodyNodes) {
        for (let floatingNode of floatingNodes) {
            let d = distance(bodyNode.x, bodyNode.y, floatingNode.x, floatingNode.y);

            if (d < 50) { // 交互距离
                if (bodyNode.color === floatingNode.color) {
                    // 相同颜色：吸引
                    let force = {
                        x: (bodyNode.x - floatingNode.x) * 0.01,
                        y: (bodyNode.y - floatingNode.y) * 0.01
                    };
                    floatingNode.applyForce(force);

                    // 如果足够近，连接
                    if (d < 20 && !floatingNode.connected) {
                        floatingNode.connected = true;
                        floatingNode.bodyNode = bodyNode;
                        floatingNode.connectionTime = millis(); // 记录连接时间
                        bodyNode.connectedNodes.push(floatingNode);
                        floatingNode.timer = floatingNode.maxTimer; // 重置timer
                    }
                } else {
                    // 不同颜色：排斥
                    let force = {
                        x: (floatingNode.x - bodyNode.x) * 0.02,
                        y: (floatingNode.y - bodyNode.y) * 0.02
                    };
                    floatingNode.applyForce(force);
                }
            }
        }
    }
}

// 检查连接距离，如果过远则断开连接
function checkConnectionDistance() {
    const maxConnectionDistance = 500; // 最大连接距离

    for (let bodyNode of bodyNodes) {
        for (let i = bodyNode.connectedNodes.length - 1; i >= 0; i--) {
            let connectedNode = bodyNode.connectedNodes[i];

            // 跳过正在被吸收的节点
            if (connectedNode.beingAbsorbed) {
                continue;
            }

            let d = distance(bodyNode.x, bodyNode.y, connectedNode.x, connectedNode.y);

            if (d > maxConnectionDistance) {
                // 断开连接
                connectedNode.connected = false;
                connectedNode.bodyNode = null;
                bodyNode.connectedNodes.splice(i, 1);

                // 开始慢慢消失 - 设置一个较短的消失时间
                connectedNode.timer = min(connectedNode.timer, 3000); // 最多3秒后消失
            }
        }
    }
}

// PoseNet模型加载完成回调
function modelLoaded() {
    console.log('PoseNet model loaded!');
    document.getElementById('status').textContent = 'Model loaded, starting detection...';
}

// 姿势检测结果回调
function gotPoses(results) {
    poses = results;
    if (poses.length > 0 && poses[0].pose) {
        poseReady = true;
        document.getElementById('status').textContent = `Pose detected: ${poses[0].pose.keypoints.length} keypoints`;
    } else {
        poseReady = false;
        document.getElementById('status').textContent = 'No pose detected';
    }
}

function setup() {
    createCanvas(windowWidth, windowHeight);

    // 初始化摄像头
    video = createCapture(VIDEO);
    video.size(320, 240);
    video.hide();

    // 将视频元素添加到HTML容器中
    let videoElement = document.getElementById('video');
    if (videoElement) {
        videoElement.srcObject = video.elt.srcObject;
    }

    // 初始化PoseNet
    poseNet = ml5.poseNet(video, modelLoaded);
    poseNet.on('pose', gotPoses);

    // 设置身体初始位置在屏幕中心
    bodyPosition = { x: width/2, y: height/2 };
    createDefaultBodyStructure();
    createFloatingNodes();

    document.getElementById('status').textContent = 'Initializing camera...';
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    // 调整身体位置确保在新的窗口范围内
    bodyPosition.x = constrain(bodyPosition.x, 100, width - 100);
    bodyPosition.y = constrain(bodyPosition.y, 100, height - 100);
}

function draw() {
    background(0);

    // 绘制背景文字
    drawBackgroundText();

    // 更新身体节点基于PoseNet数据
    updateBodyNodesFromPose();

    // 如果没有姿势检测，使用WASD控制
    if (!poseReady) {
        // 更新人体位置 - 支持同时按多个键进行斜向运动
        let moveX = 0;
        let moveY = 0;

        if (keyIsDown(87) || keyIsDown(119)) moveY -= 0.48; // W 或 w
        if (keyIsDown(83) || keyIsDown(115)) moveY += 0.48; // S 或 s
        if (keyIsDown(65) || keyIsDown(97)) moveX -= 0.48;  // A 或 a
        if (keyIsDown(68) || keyIsDown(100)) moveX += 0.48; // D 或 d

        bodyVelocity.x += moveX;
        bodyVelocity.y += moveY;

        // 应用摩擦力
        bodyVelocity.x *= 0.92;
        bodyVelocity.y *= 0.92;

        // 更新位置
        bodyPosition.x += bodyVelocity.x;
        bodyPosition.y += bodyVelocity.y;

        // 限制边界
        bodyPosition.x = constrain(bodyPosition.x, 100, width - 100);
        bodyPosition.y = constrain(bodyPosition.y, 100, height - 100);

        // 更新人体节点
        for (let node of bodyNodes) {
            node.update(bodyPosition);
        }
    } else {
        // 如果有姿势检测，确保所有节点都更新为最新姿势
        for (let node of bodyNodes) {
            if (!node.isPoseNode) {
                node.update(bodyPosition);
            }
        }
    }

    // 检查交互
    checkInteractions();

    // 检查连接距离
    checkConnectionDistance();

    // 更新浮动节点（注意：在循环中删除元素需要小心）
    for (let i = floatingNodes.length - 1; i >= 0; i--) {
        floatingNodes[i].update();
    }

    // 定期生成新节点
    if (millis() - lastSpawnTime > 2000 && floatingNodes.length < 25) {
        let x = random(width);
        let y = random(height);
        floatingNodes.push(new FloatingNode(x, y));
        lastSpawnTime = millis();
    }

    // 渲染连接线
    for (let bodyNode of bodyNodes) {
        for (let connectedNode of bodyNode.connectedNodes) {
            // 根据连接的颜色绘制线条
            let c = color(connectedNode.color);
            c.setAlpha(150);
            stroke(c);
            strokeWeight(2);
            line(bodyNode.x, bodyNode.y, connectedNode.x, connectedNode.y);

            // 添加脉动效果
            let pulse = sin(millis() * 0.01) * 0.5 + 0.5;
            strokeWeight(1 + pulse);
            stroke(255, 100);
            line(bodyNode.x, bodyNode.y, connectedNode.x, connectedNode.y);
        }
    }

    // 渲染节点
    for (let node of bodyNodes) {
        node.display();
    }

    for (let node of floatingNodes) {
        node.display();
    }

    // 显示信息
    fill(255);
    noStroke();
    textAlign(LEFT);
    textSize(12);
    text(`bodyNodes: ${bodyNodes.length}`, 10, height - 55);
    text(`floatingNodes: ${floatingNodes.length}`, 10, height - 40);
    text(`connectedNodes: ${bodyNodes.reduce((sum, node) => sum + node.connectedNodes.length, 0)}`, 10, height - 25);
    text(`poseReady: ${poseReady}`, 10, height - 10);
}

function keyPressed() {
    // 可以添加其他控制
}
