# LovePet -- 恋爱专属桌面宠物即时通讯系统

一款专为情侣/纪念日定制的 **双端桌面互动宠物与即时聊天伴侣**。基于 Electron 框架与腾讯云即时通信 IM（Tencent Cloud IM）构建，无需 VPN 即可进行桌面端实时聊天与宠物互动。

> **核心概念**：
> - **你的桌面上**：展示的是**对方**形象的 Q 版小人。收到对方消息时，小人会欢快跳跃并弹出对话气泡。
> - **对方的桌面上**：展示的是**你**形象的 Q 版小人。

---

## 功能概览

### 桌面宠物
- 双形象切换（男生/女生各一套立绘，根据配置自动加载）
- 五大状态机：待机、发呆、睡觉、高兴、闭眼
- 收到消息时自动跳跃 + 弹出气泡
- 桌面右下角常驻，可拖拽移动
- 缺失动作图片自动回退到主立绘，不会黑屏

### 飞鸽传书聊天
- 毛玻璃风格控制面板，内置聊天卡片
- 基于腾讯云 IM 的双向即时通讯
- 离线消息自动拉取
- 消息气泡区分"我"和"对方"

### 恋爱纪念册
- 纪念日倒计时
- 待办事项备忘录

### 安全性
- `SecretKey` 仅存在于开发机器，**绝不进入分发的 EXE**
- UserSig 采用腾讯官方 `tls-sig-api-v2` 库生成
- 敏感文件已加入 `.gitignore`，不会提交到代码仓库

---

## 项目结构

```
wzq/
├── assets/
│   ├── characters/
│   │   ├── char_boy/              # 男生立绘（对方桌面展示）
│   │   └── char_girl/             # 女生立绘（你的桌面展示）
│   ├── icon.png                   # 托盘图标
│   └── pet_walk_sheet.png         # 行走雪碧图（备用）
├── scripts/
│   └── build.js                   # 安全构建脚本（预生成 UserSig，SecretKey 不打包）
├── main.js                        # 主进程：窗口管理、托盘、IM 路由
├── preload.js                     # 预加载：IM SDK 连接、安全 IPC 接口
├── index.html                     # 宠物悬浮窗页面
├── pet.js                         # 宠物逻辑：状态机、Canvas 渲染、消息监听
├── pet.css                        # 宠物样式：气泡、呼吸、跳跃动画
├── dashboard.html                 # 控制面板页面
├── dashboard.js                   # 控制面板逻辑：聊天、倒计时、备忘录
├── dashboard.css                  # 控制面板样式
├── secret.json                    # 本地密钥配置（仅开发用，git 忽略）
├── package.json
└── .gitignore
```

---

## 快速开始（开发调试）

### 第一步：获取腾讯云 IM 凭证

1. 登录 [腾讯云即时通信 IM 控制台](https://console.cloud.tencent.com/im)
2. 创建应用，获取 **SDKAppID**
3. 应用详情 → 基本信息 → 获取 **SecretKey**
4. 账号管理 → 创建两个账号（如 `UserA`、`UserB`）

### 第二步：创建本地密钥配置

在项目根目录创建 `secret.json`（此文件已被 `.gitignore` 忽略）：

```json
{
  "SDKAppID": 1400xxxxxx,
  "SecretKey": "你的腾讯云 SecretKey",
  "selfID": "UserA",
  "partnerID": "UserB",
  "partnerCharacter": "char_girl"
}
```

### 第三步：安装依赖并启动

```bash
npm install
npm start
```

启动后终端会显示 IM 登录状态：
```
IM config loaded (secret.json). selfID=UserA, partnerID=UserB
[IM] UserA 登录成功
```

### 第四步：本地双开联调

在同一台电脑上模拟双方对话：

```bash
# 复制项目
cp -r wzq wzq_partner

# 编辑 wzq_partner/secret.json，将 selfID/partnerID 互换：
#   "selfID": "UserB",
#   "partnerID": "UserA",
#   "partnerCharacter": "char_boy"

# 终端 1
cd wzq && npm start

# 终端 2
cd wzq_partner && npm start
```

在任意一方的控制面板（托盘右键 → 打开控制面板 → 飞鸽传书）发送消息，对方的宠物会跳跃并弹出气泡。

> **注意**：如果第二个实例出现 `ERROR:cache_util_win.cc` 缓存报错，不影响功能，可忽略。若想消除，启动时加 `--user-data-dir` 参数指定不同的临时目录。

---

## 安全分发（打包）

**核心设计**：构建脚本在打包时用 `SecretKey` 预生成 180 天有效期的 `UserSig`，只有过期 Token 进入 EXE，`SecretKey` 绝不离开你的开发机器。

### 打包

你只需要维护一份 `secret.json`（你自己的身份）。打包时会自动把身份换成对方的。

```bash
npm run build
```

脚本会：
1. 读取你的 `secret.json`
2. 自动交换 `selfID` ↔ `partnerID`，翻转角色形象
3. 为对方身份生成 180 天有效的 UserSig
4. 打包为 EXE（`SecretKey` 不进入分发包）

把 `dist/` 下的 EXE 发给对方，她双击运行即可，**零配置**。

### UserSig 过期

180 天后 UserSig 过期，重新运行 `npm run build` 打包发给对方即可。

---

## 调试技巧

### 开启 DevTools

```bash
LOVEPET_DEVTOOLS=1 npm start
```

### 终端诊断日志

启动后终端会输出关键 IM 事件：

| 日志 | 含义 |
|------|------|
| `IM config loaded (secret.json)...` | 使用本地 secret.json，开发模式 |
| `IM config loaded (built-in)...` | 使用内置配置，生产模式 |
| `[IM] UserX 登录成功` | IM 连接正常 |
| `[IM] UserX 登录失败: ...` | IM 登录出错，后面会附错误原因和错误码 |
| `[IM] 发送消息失败: ...` | 消息发送失败，附原因 |
| `No IM configuration found. Running in offline mode.` | 无配置，离线模式运行 |

---

## 常见问题

### 对方收不到消息

1. 确认双方的终端都显示 `[IM] xxx 登录成功`
2. 确认双方已同时在运行
3. 确认 `secret.json` 中 `selfID`/`partnerID` 正确对应

### 错误码 70003（UserSig 非法）

检查 `SDKAppID` 和 `SecretKey` 是否填写正确。本项目使用腾讯官方 `tls-sig-api-v2` 库生成签名，确保格式正确。

### 启动报错 "Unable to move the cache"

GPU 缓存锁冲突（双开时常见），不影响功能，可忽略。消除方法：
```bash
npx electron . --user-data-dir="%TEMP%/electron-pet-alt"
```
