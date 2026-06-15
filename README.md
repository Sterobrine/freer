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

微事件实际执行的操作，当前支持：

| action_type | 名称 | 说明 |
|-------------|------|------|
| 1 | 左键单击 | 在识别到的坐标区域内随机点击 |
| 3 | 拖拽 | 从起点拖到终点，支持匀速移动 |
| 4 | 等待 | 暂停指定时间（可为区间，随机取值） |
| 5 | 文本输入 | 通过 ADB 逐字符输入文本 |

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

- **鼠标操作**：通过 `PostMessage` 向目标窗口发送 `WM_LBUTTONDOWN` / `WM_MOUSEMOVE` / `WM_LBUTTONUP`
- **坐标随机化**：在识别到的矩形区域内随机取点，降低被检测风险
- **间隔随机化**：动作间隔与事件间隔均在配置的 `[min, max]` 区间内随机

---

## 项目结构

```
freer/
├── main.py              # 运行入口：创建 EventEx 并启动任务
├── Control.py           # 核心引擎：事件树构建、调度、动作执行、数据管理
├── Models.py            # 数据模型：Event / GrandEvent / MicroEvent / Action
├── Tools.py             # 工具层：窗口查找、图像识别、文件读写、随机化
├── data/
│   ├── event.json       # 事件定义（需通过 GUI 或手动创建）
│   ├── action.json      # 动作定义
│   └── count.json       # 自增 ID 计数器
└── View/
    ├── AddEvent.py      # 添加事件 GUI
    ├── EditEvent.py     # 编辑/删除事件 GUI
    ├── AddEventUI.py    # 添加事件界面（Qt 生成）
    ├── EditEventUI.py   # 编辑事件界面（Qt 生成）
    ├── add_action.py    # 脚本：添加动作示例
    └── del_event.py     # 脚本：删除事件示例
```

---

## 环境要求

- **操作系统**：Windows（依赖 Win32 API）
- **Python 3**
- **Android 模拟器**：已配置 ADB，默认设备 ID 为 `emulator-5554`（雷电模拟器）
- **主要依赖**：
  - `PySide2` — GUI
  - `pywin32` — 窗口与消息操作
  - `opencv-python`（cv2）
  - `numpy`

---

## 快速开始

### 1. 准备数据文件

确保 `data/event.json` 存在（可为空数组 `[]`）。`data/action.json` 仓库中已包含示例动作。

### 2. 配置动作与事件

**方式 A — GUI（推荐）**

```bash
# 在 View 目录下运行
cd View
python AddEvent.py    # 添加事件
python EditEvent.py   # 编辑或删除事件
```

**方式 B — 脚本**

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
| `max_suc_run_time` | 全部 | 同一事件最大连续执行次数，超出后冷却 |
| `gap` | 微事件 | 动作完成后的随机等待区间 `[min, max]`（秒） |
| `default_position` | 微事件 | 固定坐标，`x1,y1\|x2,y2` 形式定义矩形 |
| `action` | 微事件 | 绑定的动作名称 |
| `event_list` | 宏事件 | 子事件列表，每项含 `event`、`should_run_time`、`max_run_time` |
| `exception_list` | 宏事件 | 异常事件名称列表 |
| `max_rotate_time` | 宏事件 | 找不到可执行子事件时的最大空转轮数 |
| `is_exception` | 全部 | 是否为异常处理事件 |

### 动作字段

| 字段 | 说明 |
|------|------|
| `name` | 动作名称 |
| `action_type` | 1=单击, 3=拖拽, 4=等待, 5=输入 |
| `run_time` | 动作重复次数 |
| `gap` | 每次重复之间的随机间隔 `[min, max]` |
| `duration` | 拖拽持续时间（秒） |
| `wait_time` | 等待时长，可为数值或 `[min, max]` 区间 |
| `text` | 输入动作的文本内容 |

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

### 添加事件（AddEvent.py）

1. 选择事件类型：微事件 / 宏事件 / 异常-微事件 / 异常-宏事件
2. 填写事件名、窗口名、识别精度、最大连续执行次数
3. **微事件**：选择动作、配置起始/结束特征图或默认坐标、设置间隔
4. **宏事件**：添加子事件（可设最少/最多执行次数）与异常事件，设置最大空转次数
5. 点击「添加事件」写入 `data/event.json`

默认窗口名为 `雷电模拟器|TheRender`。

### 编辑事件（EditEvent.py）

1. 按类型筛选并选择已有事件
2. 修改字段后点击「更新事件」
3. 可删除当前选中的事件

特征图默认从项目上级目录的 `img/` 文件夹选取（`.bmp` 格式）。

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

1. **平台**：引擎鼠标操作依赖 Windows（`pywin32`）；截屏与输入可走 ADB，跨平台能力仍在演进中。
2. **ADB 设备**：默认 `emulator-5554`，可在 `config.yaml` 或环境变量 `FREER_ADB_DEVICE` 中修改。
3. **子事件冲突**：相同 `symbol_start` 时可通过子事件 `priority` 字段区分（高优先级优先）。
4. **右键单击**：`action_type = 2` 尚未实现。
5. **GUI**：旧版 PySide2 界面仍可用；Phase 3 将交付 Tauri/React 新界面。

---

## 示例：action.json

```json
[
  {
    "name": "左键单击1次",
    "id": 1,
    "action_type": 1,
    "run_time": 1,
    "wait_time": null,
    "duration": null,
    "gap": [0.02, 0.03]
  },
  {
    "name": "等待1s",
    "id": 2,
    "action_type": 4,
    "run_time": 1,
    "wait_time": 1,
    "duration": null,
    "gap": [0.02, 0.03]
  }
]
```

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

- **Control.DataManager**：提供事件/动作的增删改查，GUI 与脚本共用
- **View/addwidget.py**、**View/LoadByUI.py**：Qt 布局实验代码，非正式功能入口
- IDE 配置位于 `.idea/`，项目模块名为 `Freer V0.1`

---

## 许可证

未指定开源许可证，使用前请自行确认授权范围。
