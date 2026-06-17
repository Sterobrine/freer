# Freer

Freer 是一个面向 Windows 平台的游戏/模拟器自动化框架（V0.1）。它通过**图像识别**判断当前界面状态，再按预设的**事件树**自动执行点击、拖拽、等待、输入等操作，适用于雷电模拟器等 Android 模拟器场景。

---

## 核心概念

### 事件（Event）

自动化逻辑的基本单元，分为两类：

| 类型 | 代码标识 | 说明 |
|------|----------|------|
| **宏事件**（GrandEvent） | `event_type = 0` | 容器节点，包含子事件队列与异常事件队列，负责调度 |
| **微事件**（MicroEvent） | `event_type = 1` | 叶子节点，绑定一个具体动作并执行 |

此外，事件还可标记为**异常事件**（`is_exception = true`），用于处理弹窗、网络错误等意外情况。

### 动作（Action）

微事件绑定的操作序列，由 **平台**（`platform`）与 **步骤列表**（`steps`）组成。同一动作名称可被多个微事件复用。

#### 平台与原子步骤

| 平台 | 原子步骤 | 执行通道 |
|------|----------|----------|
| `windows` | `click`、`pointer_down`、`pointer_up`、`pointer_move`、`drag`、`wait`、`key`、`text` | Win32 `PostMessage` → 模拟器子窗口 |
| `adb` | `tap`、`swipe`、`wait`、`key`、`text` | `adb shell input` |
| `mac` | 同 Windows schema | **未实现**（预留） |

跨平台共享：`wait`（短延迟）、`key`、`text`。

**说明**：

- 双击、长按、滑动等由多步组合实现，不再使用 `action_type` 枚举。
- Windows 平台 `text` 步骤当前仍经 **ADB** 逐字符输入（与指针通道分离）。
- `pointer_down` → `pointer_move` → `pointer_up` 在同一次步骤执行内会锁定坐标，避免每步重新随机取点。

#### 坐标索引（`pos` / `from_pos` / `to_pos`）

微事件通过 `symbol_start`（多张图用 `|` 分隔）或 `default_position` 提供矩形区域。动作步骤用 **位置索引** 引用：

- 索引 `0`：第一张图 / 第一对坐标
- 索引 `1`：第二张图 / 第二对坐标
- `swipe` / `drag` 可用 `offset` 在单区域内滑动，仅需索引 `0`

保存微事件时，API 校验会警告位置槽位不足、缺 `window_name`（Windows 指针动作）等配置问题。

### 事件树

宏事件可嵌套子宏事件或微事件，形成树形结构。运行时引擎用**栈**深度优先遍历事件树：

```
根宏事件
├── 子事件 A（微事件：点击按钮）
├── 子事件 B（宏事件）
│   ├── 子事件 B1
│   └── 子事件 B2
└── 异常事件（处理弹窗等）
```

---

## 工作原理

### 1. 加载与构建

启动时从 `data/event.json` 和 `data/action.json` 读取配置，`EventEx` 根据根事件名递归实例化整棵事件树。

### 2. 状态识别

- 通过 ADB 截取模拟器屏幕，保存为 `sc.bmp`
- 使用 OpenCV 模板匹配（`TM_CCOEFF_NORMED`）在截图中查找特征图
- 每个事件可配置：
  - **起始标志**（`symbol_start`）：子事件/微事件的触发条件（屏幕上出现该图像）
  - **结束标志**（`symbol_finish`）：事件完成的判定条件
  - **默认可点击区域**（`default_position`）：不依赖图像识别时的固定坐标

多张特征图用 `|` 分隔，匹配时返回序号与坐标范围。

### 3. 事件调度

主循环 `EventDispatch` 持续执行，直到栈为空：

1. **截屏** → 更新当前画面
2. **过热检测**：同一微事件连续执行超过 `max_suc_run_time` 次时进入冷却，转而尝试异常/其他子事件
3. **窗口定位**：按 `window_name`（格式：`父窗口|子窗口`）查找 Win32 句柄
4. **完成检测**：
   - 微事件：起始标志消失，或结束标志出现
   - 宏事件：所有子事件的 `has_run_time` 达到 `should_run_time`
5. **宏事件调度**：按顺序扫描子事件队列，匹配起始标志后入栈；若无匹配则检查异常队列；仍无则空转（`max_rotate_time` 上限）
6. **微事件执行**：调用绑定的 Action 完成操作

### 4. 动作执行

- **指针操作**：Windows 经 `PostMessage` 发送 `WM_LBUTTONDOWN` / `WM_MOUSEMOVE` / `WM_LBUTTONUP`；ADB 经 `input tap` / `input swipe`
- **坐标随机化**：在识别矩形内随机取点；`pointer_down` 后同索引的 `move`/`up` 复用已锁定坐标
- **间隔随机化**：见下文「等待与间隔」

#### 等待与间隔

| 配置 | 作用时机 | 典型用途 |
|------|----------|----------|
| `event.gap` | 微事件整套动作执行**之后** | 两次调度之间的节奏（秒级） |
| `action.gap` | 动作各步骤**之间**（默认） | 步骤链节奏；可被单步 `gap` 覆盖 |
| `step.gap` | 单步执行**之后** | 覆盖动作默认步骤间隔 |
| `wait` 步骤 | 步骤链**内部** | 短延迟（如双击间隔 &lt;1s） |
| `action.run_time` | 单次触发内重复**整套** steps | 默认 `1`；双击请用步骤编排 |
| `event.max_suc_run_time` | 调度循环中同一微事件连续触发上限 | 过热冷却，与 `run_time` 不同 |

等界面变化应依赖 `symbol_finish` 或单独微事件，不宜用长 `wait` 或过大 `event.gap` 代替。

---

## 项目结构

```
freer/
├── main.py              # 运行入口：创建 EventEx 并启动任务
├── Control.py           # 核心引擎：事件树构建、调度、动作执行、数据管理
├── Models.py            # 数据模型：Event / GrandEvent / MicroEvent / Action
├── Tools.py             # 工具层：窗口查找、图像识别、文件读写、随机化
├── recognition/         # 多 Matcher 识别路由
├── freer_api/           # FastAPI sidecar（事件/动作/任务/日志）
├── gui/                 # Tauri + React 前端
├── data/
│   ├── event.json       # 事件定义
│   ├── action.json      # 动作定义
│   └── count.json       # 自增 ID 计数器
└── config.yaml          # 运行配置
```

---

## 环境要求

- **操作系统**：Windows（依赖 Win32 API）
- **Python 3**
- **Android 模拟器**：已配置 ADB，默认设备 ID 为 `emulator-5554`（雷电模拟器）
- **主要依赖**（见 `requirements.txt`）：
  - `opencv-python`、`numpy` — 图像识别
  - `fastapi`、`uvicorn` — HTTP API sidecar
  - `pywin32` — Windows 窗口与消息操作
- **前端**：Node 18+、pnpm（见 `gui/package.json`）

---

## 快速开始

### 1. 准备数据文件

确保 `data/event.json` 存在（可为空数组 `[]`）。`data/action.json` 仓库中已包含示例动作。

### 2. 配置动作与事件

**方式 A — Web GUI（推荐）**

```bash
pnpm install
pnpm start            # 启动 freer_api + 前端 http://localhost:5173
```

**方式 B — 脚本 / API**

```python
import Control
import Models

action = Models.Action('输入maple', 5, 1, None, None, None, 'maple')
Control.DataManager.AddObj(action, 1)
```

### 3. 运行自动化任务

编辑 `main.py` 中的根事件名与重复次数，然后执行：

```python
import Control

test = Control.EventEx('龙讨伐', 100)  # 事件名, 重复次数
test.Start()
```

```bash
python main.py
```

---

## 配置说明

### 事件字段

| 字段 | 适用类型 | 说明 |
|------|----------|------|
| `name` | 全部 | 事件名称（唯一） |
| `window_name` | 全部 | 目标窗口，格式 `父窗口标题\|子窗口标题` |
| `symbol_start` | 微事件 | 起始特征图路径，多张用 `\|` 分隔 |
| `symbol_finish` | 全部 | 结束特征图路径，可为 `null` |
| `accuracy` | 全部 | 图像匹配置信度阈值（0.6–1.0，默认 0.85） |
| `max_suc_run_time` | 全部 | 调度循环中同一微事件最大连续执行次数，超出后冷却（与动作 `run_time` 不同） |
| `gap` | 微事件 | 整套动作完成后的随机等待 `[min, max]`（秒） |
| `default_position` | 微事件 | 固定坐标，`x1,y1\|x2,y2` 形式定义矩形 |
| `action` | 微事件 | 绑定的动作名称 |
| `event_list` | 宏事件 | 子事件列表，每项含 `event`、`should_run_time`、`max_run_time` |
| `exception_list` | 宏事件 | 异常事件名称列表 |
| `max_rotate_time` | 宏事件 | 找不到可执行子事件时的最大空转轮数 |
| `is_exception` | 全部 | 是否为异常处理事件 |

### 动作字段

| 字段 | 说明 |
|------|------|
| `name` | 动作名称（唯一） |
| `platform` | `windows` / `adb` / `mac` |
| `steps` | 步骤数组，每步含 `op` 及参数（见下表） |
| `run_time` | 单次微事件触发内，整套 `steps` 重复次数（默认 `1`） |
| `gap` | 步骤间默认随机间隔 `[min, max]`（秒），可被单步 `gap` 覆盖 |

#### 常用步骤参数

| `op` | 主要参数 |
|------|----------|
| `click` / `tap` | `pos`, `button`（Windows） |
| `pointer_down` / `pointer_up` / `pointer_move` | `pos`, `button` |
| `drag` / `swipe` | `from_pos`, `to_pos` 或 `offset`, `duration` |
| `wait` | `seconds`（可为 `[min, max]` 区间） |
| `key` | `value`（如 `KEYCODE_BACK`） |
| `text` | `value` |

### 宏事件子事件项

```json
{
  "event": "子事件名称",
  "should_run_time": 1,
  "has_run_time": 0,
  "max_run_time": 1
}
```

- `should_run_time`：至少需要执行的次数
- `max_run_time`：最多允许执行的次数；达到后，该子事件及之前所有子事件会从队列中移除并移入 `inactive_list`

---

## GUI 使用说明

启动 `pnpm start` 后，在浏览器打开 `http://localhost:5173`。界面包含：**事件库**、**动作**、**任务**、**模板/ROI**、**设置**。事件与动作经 `freer_api` 读写 `data/event.json` / `data/action.json`。

默认窗口名为 `雷电模拟器|TheRender`。

### 事件库

事件库用于浏览、编排与编辑全部事件，支持**列表**与**画布**两种视图（左下角切换）。

#### 列表模式（经典三栏）

三栏均可拖拽分隔条调节宽度（宽度保存在浏览器 `localStorage`）：

```
┌─────────────┬──────────────────────┬─────────────────┐
│ 事件目录     │  编排树（当前宏事件）   │  属性面板        │
│ 搜索 / 新建  │  子事件 / 异常分支     │  字段编辑 / 保存  │
│ 列表 / 画布  │  DnD 排序 / 嵌套展开   │                 │
└─────────────┴──────────────────────┴─────────────────┘
```

| 栏 | 默认宽度 | 可调范围 | 说明 |
|----|----------|----------|------|
| 事件目录 | 224px | 160–420px | 搜索、新建宏/微事件、切换视图 |
| 编排树 | 352px | 220–640px | 仅宏事件；管理 `event_list` / `exception_list` |
| 属性面板 | 剩余空间 | 最小 280px | 编辑当前事件字段；支持面包屑深入子事件 |

**编排树交互**：

- 点击**事件名** → 深入编辑该子事件（面包屑导航）
- 点击**标题栏其他区域** → 编辑子事件的编排参数（`should_run_time` / `max_run_time` / `priority`）
- 拖拽排序子事件；下拉添加子事件或异常分支

#### 画布模式（树形可视化）

右侧两栏合并为一块可缩放、可平移的树形画布（类似工作流编辑器）：

- **滚轮**缩放，**拖拽空白区域**平移；左上角工具栏可放大 / 缩小 / 适应视图
- **单击节点** → 右侧滑出属性面板，直接编辑该节点对应的事件（**不会跳转或切换画布根**）
- 宏事件为蓝色节点，微事件为绿色，异常分支为琥珀色虚线连接
- 选中宏事件后进入画布；微事件显示单节点预览 + 底部属性区
- 保存 / 删除作用于右栏当前选中的节点；编辑子节点不会影响左侧选中的根宏

#### 其他页面

| 页面 | 功能 |
|------|------|
| 动作 | 按平台编排 `steps`；事件属性面板展示平台徽章与步骤摘要 |
| 任务 | 选择根宏事件、循环次数、启动/停止、WebSocket 日志 |
| 模板/ROI | ADB 截屏、拖拽选 ROI、模板预览 |
| 设置 | `config.yaml`、数据目录、ADB 设备等 |

---

## 调度机制详解

### 子事件选择

宏事件按 `event_list` 顺序扫描：第一个起始标志出现在屏幕上的子事件入栈执行。若无匹配，依次尝试 `exception_list` 和 `inactive_list`。

### 异常恢复

异常宏事件执行完毕后，会将 `inactive_list` 中的子事件重新合并回 `event_list`，并重置执行计数。

### 任务重复

`EventEx(event_name, repeat_time)` 的第二个参数控制整棵事件树完整跑完后的重复次数。每轮开始前会深拷贝事件树模板并重置栈。

---

## 已知限制

1. **平台**：引擎指针操作依赖 Windows（`pywin32`）；ADB 用于截屏与 `adb` 平台动作；macOS 动作 schema 已有、执行器未实现。
2. **ADB 设备**：默认 `emulator-5554`，可在 `config.yaml` 或环境变量 `FREER_ADB_DEVICE` 中修改。
3. **子事件冲突**：相同 `symbol_start` 时可通过子事件 `priority` 字段区分（高优先级优先）。
4. **Windows text**：`platform=windows` 时 `text` 步骤仍经 ADB 输入，与 Win32 指针通道分离。
5. **GUI**：Tauri + React（`gui/`）；事件库支持列表三栏与画布树形两种模式；桌面打包见 `UPGRADE_PLAN.md` §4.4.8.5。

---

## 示例：action.json

```json
[
  {
    "name": "左键单击1次",
    "id": 1,
    "platform": "windows",
    "run_time": 1,
    "gap": [0.02, 0.03],
    "steps": [{ "op": "click", "pos": 0, "button": "left" }]
  },
  {
    "name": "双击",
    "id": 2,
    "platform": "windows",
    "run_time": 1,
    "gap": [0.02, 0.03],
    "steps": [
      { "op": "click", "pos": 0 },
      { "op": "wait", "seconds": 0.05 },
      { "op": "click", "pos": 0 }
    ]
  },
  {
    "name": "等待1s",
    "id": 3,
    "platform": "windows",
    "run_time": 1,
    "gap": [0.02, 0.03],
    "steps": [{ "op": "wait", "seconds": 1 }]
  },
  {
    "name": "ADB上滑",
    "id": 4,
    "platform": "adb",
    "run_time": 1,
    "gap": [0.02, 0.03],
    "steps": [{ "op": "swipe", "from_pos": 0, "offset": [0, -300], "duration": 0.3 }]
  }
]
```

旧版 `action_type` 字段在加载时会自动迁移为 `platform` + `steps`（见 `action_steps.py`）。

---

## 配置（V0.3+）

项目根目录的 `config.yaml` 统一管理路径与运行参数：

```yaml
adb_device: emulator-5554
data_dir: data
log_level: INFO
api:
  host: 127.0.0.1
  port: 17890
recognition:
  max_consecutive_miss_frames: 30
```

无论从哪个工作目录启动 `main.py` 或 `python -m freer_api`，都会解析**项目根目录**下的 `config.yaml` 与 `data/`。

## HTTP API（freer_api）

启动 sidecar：

```bash
python -m freer_api
```

常用端点：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET/PUT | `/config` | 读写配置 |
| GET/POST/PUT/DELETE | `/events` | 事件 CRUD |
| GET/POST/PUT/DELETE | `/actions` | 动作 CRUD |
| POST | `/task/start` | 启动任务 `{"event_name":"...", "repeat_time":1}` |
| POST | `/task/stop` | 停止任务 |
| GET | `/task/status` | 任务状态 |
| WS | `/logs` | 结构化日志流 |

响应格式：`{"ok": true, "data": ...}` / `{"ok": false, "error": {"code", "message"}}`

OpenAPI 文档：启动后访问 `http://127.0.0.1:17890/docs`

## 故障排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 任务立即暂停，日志含 ADB | 设备未连接或 `adb_device` 错误 | `adb devices` 检查；修改 `config.yaml` 的 `adb_device` |
| 找不到事件/动作 JSON | `data_dir` 配置错误或 cwd 误用 | 确认 `config.yaml` 中 `data_dir` 相对项目根；或直接调用 API 读写 |
| 窗口未找到任务暂停 | 模拟器标题与 `window_name` 不一致 | 检查事件配置中 `雷电模拟器|TheRender` 等窗口名 |
| OCR/UI 识别无效果 | 可选依赖未安装 | `pip install -r requirements-optional.txt` |
| API 无法连接 | sidecar 未启动或端口占用 | `python -m freer_api`；修改 `api.port` |
| 日志无输出 | 日志级别过高 | 将 `log_level` 设为 `DEBUG`；查看 `logs/freer.log` |

---

## 开发说明

- **Control.DataManager**：提供事件/动作的增删改查，API 与脚本共用
- 开发启动：`pnpm start`（Web）或 `pnpm start:tauri`（桌面壳）

---

## 许可证

未指定开源许可证，使用前请自行确认授权范围。

---

## 截屏通道说明 (V2)

当前版本中，**识别用的截屏仅有 ADB 一条通道**：

| 能力 | 实现方式 | 说明 |
|------|----------|------|
| **截屏** | `adb exec-out screencap -p` | 仅 ADB。无 Win32 窗口截图、无 GDI/BitBlt/DXGI 实现 |
| **Windows 点击** | `PostMessage` → 子窗口 hwnd | 通过窗口消息模拟 |
| **ADB 点击** | `adb shell input tap/swipe/text` | 按设备像素坐标 |
| **坐标系** | ADB 截图像素 = 设备分辨率 | Win32 点击坐标依赖模拟器 1:1 映射，无校准层 |

配置项 `capture_mode` 当前仅支持 `adb_pipe`（设置页已改为单选下拉框）。在不支持 ADB 的环境下，截图将失败并触发任务暂停。

**Win32 窗口截图不在 V2 排期中**（参见 [UPGRADE_PLAN_V2.md](./UPGRADE_PLAN_V2.md) §1.3.1 与 §5C-8）。
