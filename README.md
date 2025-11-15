# Ephemeral-IP - 抽象身体网络互动艺术

基于 MediaPipe Tasks Vision API 实现的交互式身体网络可视化项目。将身体特征点与漂浮粒子系统结合，创造独特的互动体验。

## 🎨 项目特色

- **全屏沉浸式体验**：纯黑色背景，营造神秘氛围
- **抽象身体可视化**：只显示身体关键点和连接线，背景为黑色
- **动态漂浮粒子系统**：20种颜色的粒子在屏幕中漂浮
- **实时互动**：身体节点与漂浮粒子产生碰撞和连接效果
- **艺术化标题**：屏幕中央隐约显示 "Ephemeral-IP" 文字

## 📚 官方文档参考

- [MediaPipe Pose Landmarker Web JS 指南](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js?hl=zh-cn#video)
- [MediaPipe Web 设置指南](https://ai.google.dev/edge/mediapipe/solutions/setup_web?hl=zh-cn)

## 🚀 快速开始

### 1. 启动本地服务器

由于使用了 ES6 模块 (`import`)，需要通过 HTTP 服务器运行，不能直接打开 HTML 文件。

**使用 Python 启动服务器：**

```bash
# Python 3
python3 -m http.server 8000

# 或 Python 2
python -m SimpleHTTPServer 8000
```

**使用 Node.js 启动服务器：**

```bash
# 安装 http-server
npm install -g http-server

# 启动服务器
http-server -p 8000
```

### 2. 访问应用

在浏览器中打开：
```
http://localhost:8000
```

## 📋 功能说明

### 游戏界面
- **全屏黑色背景**：营造沉浸式体验
- **背景文字**：屏幕中央隐约显示 "Ephemeral-IP"，带有呼吸动画效果
- **漂浮粒子**：80个彩色粒子在屏幕中自由漂浮，使用20种不同颜色

### 身体检测与互动
- **抽象可视化**：只显示身体关键点和连接线，背景保持黑色
- **实时检测**：使用摄像头实时检测身体姿势
- **粒子互动**：
  - 当身体关键点靠近漂浮粒子时，粒子会被吸引
  - 连接的粒子会发光并跟随身体节点移动
  - 距离过远时连接会断开，粒子恢复自由漂浮
  - 未连接的粒子会逐渐衰减并重生

### 操作方式
1. 点击"启动摄像头"按钮
2. 允许浏览器访问摄像头权限
3. 站在摄像头前，移动身体与漂浮粒子互动
4. 观察身体节点与粒子的连接效果

## 🔧 技术实现

### 使用的库

1. **MediaPipe Tasks Vision** (v0.10.0)
   - 从 CDN 加载：`https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0`
   - 提供 `PoseLandmarker`、`FilesetResolver` 等类

### 核心功能实现

#### 1. 双画布系统
- **主画布 (mainCanvas)**：显示身体特征点和连接线
- **粒子画布 (particleCanvas)**：显示漂浮粒子系统
- 两个画布叠加，实现分层渲染

#### 2. 漂浮粒子系统
```javascript
class Particle {
    // 20种颜色的粒子
    // 自动移动、边界反弹
    // 生命周期管理（衰减和重生）
    // 与身体节点的互动检测
}
```

#### 3. 身体节点与粒子互动
- **距离检测**：计算身体关键点与粒子的距离
- **连接机制**：距离小于60像素时建立连接
- **物理效果**：连接的粒子被吸引向身体节点
- **视觉效果**：连接的粒子发光并增大

#### 4. 抽象可视化
- 只绘制身体关键点和连接线
- 背景保持纯黑色
- 关键点使用绿色发光效果
- 重要节点（头部、肩膀、臀部）更大更亮

## 📝 重要说明

### 1. 模块类型
- 代码使用 ES6 模块 (`import/export`)
- HTML 中必须使用 `<script type="module">` 标签
- 必须通过 HTTP 服务器运行，不能使用 `file://` 协议

### 2. 模型加载
- 模型文件从 Google Cloud Storage 加载
- 首次加载可能需要一些时间
- 需要稳定的网络连接

### 3. 浏览器兼容性
- 需要支持 ES6 模块的现代浏览器
- 推荐使用 Chrome、Firefox、Edge 最新版本
- 摄像头功能需要 HTTPS 环境（本地 localhost 除外）

### 4. 性能优化
- 使用 GPU 加速（`delegate: "GPU"`）
- 视频模式使用 `detectForVideo` 而非 `detect`
- 通过 `requestAnimationFrame` 优化渲染循环

## 🐛 常见问题

### Q: 页面显示空白？
A: 检查浏览器控制台是否有错误。确保：
- 使用 HTTP 服务器运行（不是直接打开文件）
- 网络连接正常（需要加载 CDN 资源）
- 浏览器支持 ES6 模块

### Q: 摄像头无法访问？
A: 
- 确保允许浏览器访问摄像头权限
- 检查是否有其他应用占用摄像头
- 本地开发时 localhost 可以使用 HTTP，生产环境需要 HTTPS

### Q: 模型加载失败？
A:
- 检查网络连接
- 确认 CDN 地址可访问
- 查看浏览器控制台的错误信息

### Q: 检测结果不准确？
A:
- 确保光线充足
- 人物在画面中清晰可见
- 尝试调整摄像头角度和距离

## 📖 学习资源

- [MediaPipe 官方文档](https://ai.google.dev/edge/mediapipe)
- [MediaPipe GitHub](https://github.com/google/mediapipe)
- [Web API 文档](https://developer.mozilla.org/zh-CN/docs/Web/API)

## 📄 许可证

本项目基于 Apache License 2.0 许可证，与 MediaPipe 官方示例保持一致。

## 🔧 故障排除

如果页面显示空白、摄像头启动后黑屏或出现检测错误，请按以下步骤排查：

### 1. 基本功能测试
- **测试粒子**: 点击"测试粒子"按钮，确认粒子系统正常（屏幕应该显示彩色圆点）
- **测试检测**: 点击"测试检测"按钮，确认MediaPipe检测功能正常

### 2. 常见错误及解决方案

#### 检测错误 (Detection Error)
```
检测错误: WebGL context lost
```
**原因**: WebGL上下文丢失，通常是内存不足
**解决**: 关闭其他浏览器标签页，释放内存

#### 视频未准备好
```
视频未准备好，跳过检测
```
**原因**: 摄像头权限问题或视频流未就绪
**解决**:
- 确保允许浏览器访问摄像头
- 检查摄像头是否被其他应用占用
- 刷新页面重试

#### PoseLandmarker未初始化
```
PoseLandmarker未初始化，跳过检测
```
**原因**: MediaPipe库加载失败
**解决**:
- 检查网络连接
- 刷新页面重新加载库
- 检查浏览器控制台是否有CDN加载错误

#### 连续错误自动停止
```
检测错误次数过多(5)，停止摄像头检测
```
**原因**: 连续检测失败5次，应用自动停止保护
**解决**:
- 检查上述常见错误原因
- 刷新页面重新开始
- 查看控制台详细错误信息

### 3. 浏览器设置

#### 启用硬件加速
- **Chrome**: 设置 → 高级 → 系统 → ✅ 使用硬件加速模式
- **Firefox**: about:config → `webgl.force-enabled` → 设置为 true
- **Edge**: 设置 → 系统 → ✅ 使用硬件加速

#### 摄像头权限
- **Chrome**: 点击地址栏🔒图标 → 摄像头 → 允许
- **Firefox**: 点击🛡️图标 → 允许摄像头
- **Edge**: 权限图标 → 允许摄像头访问

### 4. 兼容性检查
- 访问 `webgl-test.html` 检查WebGL支持
- 访问 `camera-test.html` 检查摄像头功能
- 使用现代浏览器（Chrome、Firefox、Edge最新版本）

### 5. 调试步骤
1. 打开浏览器控制台（F12）
2. 刷新页面，观察加载过程
3. 点击测试按钮确认各功能状态
4. 查看控制台错误信息
5. 根据具体错误进行针对性修复

## 🔄 更新日志

- **v1.0.0** (2024)
  - 基于官方 MediaPipe Tasks Vision API 实现
  - 支持图片和视频实时检测
  - 完整的中文界面和错误处理
  - 粒子系统和身体互动功能
