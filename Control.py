import Tools
import Models
import time
import copy
import threading

import paths
from action_steps import get_action_steps, normalize_platform
from recognition.adb_client import AdbClient
from recognition.frame import FrameContext, ScreenshotError
from recognition.parse import parse_symbol
from recognition.position_utils import default_position_to_rects
from recognition.router import MatcherRouter
from recognition.types import FINISH_DEBOUNCE_FRAMES, TaskPausedError
from freer_log import get_logger

logger = get_logger('freer.engine')


def _interruptible_sleep(seconds: float, runner: 'EventEx | None' = None) -> None:
    """Sleep in slices so pause/stop can interrupt long waits."""
    end = time.monotonic() + max(seconds, 0.0)
    while time.monotonic() < end:
        if runner is not None and (runner._stop_requested or runner._pause_requested):
            return
        remaining = end - time.monotonic()
        time.sleep(min(0.1, remaining))


class _PointerSession:
    """Within one steps[] pass: reuse coordinates after pointer_down until pointer_up."""

    __slots__ = ('active', 'x', 'y', 'button', 'pos_index')

    def __init__(self):
        self.active = False
        self.x = None
        self.y = None
        self.button = 'left'
        self.pos_index = None

    def lock(self, x, y, button, pos_index):
        self.active = True
        self.x, self.y = x, y
        self.button = button
        self.pos_index = pos_index

    def update(self, x, y, pos_index):
        self.x, self.y = x, y
        self.pos_index = pos_index

    def clear(self):
        self.active = False
        self.x = self.y = None
        self.pos_index = None
        self.button = 'left'

    def point_for(self, pos_index):
        if self.active and self.x is not None and pos_index == self.pos_index:
            return self.x, self.y
        return None


class ActionEx:
    @staticmethod
    def _resolve_point(position, pos_index):
        if pos_index >= len(position):
            return None
        slot = position[pos_index]
        if len(slot) < 5:
            return None
        work = [0, slot[1], slot[2], slot[3], slot[4]]
        site = EventEx.GetRandomPosition([work])[0]
        if len(site) == 0:
            return None
        return site[0], site[1]

    @staticmethod
    def _resolve_pointer_point(position, step, session, op):
        pos_index = int(step.get('pos', 0))
        if op == 'pointer_down':
            pt = ActionEx._resolve_point(position, pos_index)
            if pt is not None:
                session.lock(pt[0], pt[1], step.get('button', 'left'), pos_index)
            return pt
        if op in ('pointer_move', 'pointer_up'):
            cached = session.point_for(pos_index)
            if cached is not None:
                return cached
            pt = ActionEx._resolve_point(position, pos_index)
            if pt is not None and op == 'pointer_move':
                session.update(pt[0], pt[1], pos_index)
            return pt
        return ActionEx._resolve_point(position, pos_index)

    @staticmethod
    def _resolve_gesture_points(position, step):
        from_pos = int(step.get('from_pos', 0))
        start = ActionEx._resolve_point(position, from_pos)
        if start is None:
            return None, None
        offset = step.get('offset')
        if offset is not None:
            return start, (start[0] + int(offset[0]), start[1] + int(offset[1]))
        to_pos = int(step.get('to_pos', from_pos + 1))
        if to_pos == from_pos:
            return start, start
        end = ActionEx._resolve_point(position, to_pos)
        if end is None:
            return start, start
        return start, end

    @staticmethod
    def _run_gesture(platform, hwnd, position, step):
        if len(position) == 0:
            print('未设置手势目标')
            return
        start, end = ActionEx._resolve_gesture_points(position, step)
        if start is None:
            print('未设置手势目标')
            return
        duration = float(step.get('duration', 1.0))
        if platform == 'adb':
            Tools.AdbAction.swipe(start[0], start[1], end[0], end[1], duration)
        elif platform == 'windows':
            Tools.WindowsAction.perform_drag(hwnd, start[0], start[1], end[0], end[1], duration)
        else:
            Tools.MacAction.unsupported(step['op'])

    @staticmethod
    def execute_step(step, position, hwnd, default_gap, platform, session=None, runner=None):
        if session is None:
            session = _PointerSession()
        op = step['op']
        step_gap = step.get('gap', default_gap)
        button = step.get('button', 'left')

        if platform == 'windows':
            if op == 'click':
                pt = ActionEx._resolve_point(position, int(step.get('pos', 0)))
                if pt is None:
                    print('未设定点击目标')
                    return
                Tools.WindowsAction.click(pt[0], pt[1], hwnd, button)
            elif op == 'pointer_down':
                pt = ActionEx._resolve_pointer_point(position, step, session, op)
                if pt is None:
                    print('未设定按下目标')
                    return
                button = session.button
                Tools.WindowsAction.pointer_down(pt[0], pt[1], hwnd, button)
            elif op == 'pointer_up':
                pt = ActionEx._resolve_pointer_point(position, step, session, op)
                if pt is None:
                    print('未设定抬起目标')
                    return
                button = session.button if session.active else step.get('button', 'left')
                Tools.WindowsAction.pointer_up(pt[0], pt[1], hwnd, button)
                session.clear()
            elif op == 'pointer_move':
                pt = ActionEx._resolve_pointer_point(position, step, session, op)
                if pt is None:
                    print('未设定移动目标')
                    return
                Tools.WindowsAction.pointer_move(pt[0], pt[1], hwnd)
            elif op == 'drag':
                ActionEx._run_gesture(platform, hwnd, position, step)
            elif op == 'wait':
                seconds = step.get('seconds', 1.0)
                if isinstance(seconds, list):
                    _interruptible_sleep(Tools.RandomTool.getRandomGap(seconds), runner)
                else:
                    _interruptible_sleep(float(seconds), runner)
            elif op == 'key':
                value = step.get('value', '')
                if not value:
                    print('未设置按键')
                    return
                Tools.WindowsAction.key_press(value, hwnd)
            elif op == 'text':
                for c in step.get('value', ''):
                    Tools.AdbAction.input_char(c)
                    time.sleep(Tools.RandomTool.getRandomGap(default_gap))
            else:
                print(f'Windows 不支持步骤: {op}')
                return

        elif platform == 'adb':
            if op == 'tap':
                pt = ActionEx._resolve_point(position, int(step.get('pos', 0)))
                if pt is None:
                    print('未设定点击目标')
                    return
                Tools.AdbAction.tap(pt[0], pt[1])
            elif op == 'swipe':
                ActionEx._run_gesture(platform, hwnd, position, step)
            elif op == 'wait':
                seconds = step.get('seconds', 1.0)
                if isinstance(seconds, list):
                    _interruptible_sleep(Tools.RandomTool.getRandomGap(seconds), runner)
                else:
                    _interruptible_sleep(float(seconds), runner)
            elif op == 'key':
                value = step.get('value', '')
                if not value:
                    print('未设置按键')
                    return
                Tools.AdbAction.key_press(value)
            elif op == 'text':
                for c in step.get('value', ''):
                    Tools.AdbAction.input_char(c)
                    time.sleep(Tools.RandomTool.getRandomGap(default_gap))
            else:
                print(f'ADB 不支持步骤: {op}')
                return

        elif platform == 'mac':
            Tools.MacAction.unsupported(op)
            return
        else:
            print(f'未知平台: {platform}')
            return

        _interruptible_sleep(Tools.RandomTool.getRandomGap(step_gap), runner)

    @staticmethod
    def GetFirstPosition(position):
        for item in position:
            if len(item) > 0:
                return item
        return None

    @staticmethod
    def doAction(action, position, event_gap, runner=None):
        print('开始执行操作：' + action.name)
        platform = normalize_platform(getattr(action, 'platform', 'windows'))
        steps = get_action_steps(action.__dict__)
        default_gap = action.gap if action.gap is not None else [0.02, 0.03]
        run_time = action.run_time if action.run_time is not None else 1
        for _ in range(run_time):
            session = _PointerSession()
            for step in steps:
                ActionEx.execute_step(step, position, action.hwnd, default_gap, platform, session, runner)
            _interruptible_sleep(Tools.RandomTool.getRandomGap(event_gap), runner)


class EventEx:
    def __init__(self, event_name, repeat_time=1):
        self.event_tree_template = None
        self.event_info = None
        self.action_info = None
        self.stack = []
        self.cursor = None
        self.pre_cursor = None
        self.run_time = 0
        self.repeat_time = repeat_time
        self.has_repeat_time = 0
        self.tmp_position = None
        self.event_name = event_name
        try:
            from config import get_config
            cfg = get_config()
            self.router = MatcherRouter(ttl_frames=cfg.recognition.last_known_ttl_frames)
            self._max_consecutive_miss = cfg.recognition.max_consecutive_miss_frames
            self._on_task_pause = cfg.recognition.on_task_pause
        except Exception:
            self.router = MatcherRouter()
            self._max_consecutive_miss = 30
            self._on_task_pause = 'none'
        self._consecutive_miss_frames = 0
        self.adb_client = AdbClient()
        self.frame = None
        self._hwnd_cache = {}
        self._finish_streak = 0
        self._finish_debounce_frames = FINISH_DEBOUNCE_FRAMES
        self._stop_requested = False
        self._pause_requested = False
        self._paused = False
        self._pause_lock = threading.Condition()
        self._end_reason = 'completed'
        self._end_message: str | None = None
        self.InitInfo()
        logger.info('开始创建事件树: %s', event_name)
        self.event_tree_template = self.InitEventTree(self.event_name)
        logger.info('事件树创建完成: %s', event_name)

    def request_stop(self):
        self._stop_requested = True
        self._end_reason = 'stopped'
        with self._pause_lock:
            self._paused = False
            self._pause_requested = False
            self._pause_lock.notify_all()
        self.stack.clear()

    def request_pause(self):
        self._pause_requested = True

    def request_resume(self):
        with self._pause_lock:
            self._paused = False
            self._pause_requested = False
            self._pause_lock.notify_all()

    @property
    def pause_pending(self) -> bool:
        return self._pause_requested and not self._paused

    @property
    def is_paused(self) -> bool:
        return self._paused

    def _wait_if_paused(self):
        with self._pause_lock:
            if self._pause_requested and not self._paused:
                self._paused = True
                self._pause_requested = False
                self._save_pause_debug_screenshot()
                logger.info('任务在帧边界暂停')
            while self._paused and not self._stop_requested:
                self._pause_lock.wait(timeout=0.5)

    def _save_pause_debug_screenshot(self) -> None:
        if self._on_task_pause != 'save_screenshot':
            return
        try:
            import cv2

            if self.frame is None:
                self.frame = FrameContext.capture(self.adb_client)
            debug_dir = paths.LOG_DIR / 'debug'
            debug_dir.mkdir(parents=True, exist_ok=True)
            out = debug_dir / f'pause_{int(time.time())}.png'
            cv2.imwrite(str(out), self.frame.image)
            logger.info('暂停调试截图: %s', out)
        except Exception as exc:
            logger.warning('保存暂停截图失败: %s', exc)

    def _note_miss_frame(self) -> None:
        self._consecutive_miss_frames += 1
        threshold = self._max_consecutive_miss
        if threshold > 0 and self._consecutive_miss_frames >= threshold:
            raise TaskPausedError(f'连续 {threshold} 帧未命中，任务暂停')

    def _note_hit_frame(self) -> None:
        self._consecutive_miss_frames = 0

    def _accuracy_for_kind(self, kind: str) -> float:
        if kind == 'finish':
            return getattr(self.cursor, 'accuracy_finish', None) or self.cursor.accuracy
        return getattr(self.cursor, 'accuracy_start', None) or self.cursor.accuracy

    def InitInfo(self):
        print('正在加载事件信息···')
        self.event_info = Tools.FileTool.ReadJSON(str(paths.EVENT_JSON))
        print('正在加载动作信息···')
        self.action_info = Tools.FileTool.ReadJSON(str(paths.ACTION_JSON))

    @staticmethod
    def FindInfo(info_list, name):
        for i in range(len(info_list)):
            if info_list[i]['name'] == name:
                return info_list[i]
        return None

    def CreateObject(self, name, obj_type):
        if obj_type == 0:
            info_list = self.event_info
        else:
            info_list = self.action_info
        info = self.FindInfo(info_list, name)
        if info is None:
            return None
        if obj_type == 0:
            if info['event_type'] == 0:
                obj = Models.GrandEvent()
            else:
                obj = Models.MicroEvent()
        else:
            obj = Models.Action()
        obj.SetByDict(info)
        return obj

    def InitEventTree(self, event_name):
        print('正在创建"' + event_name + '"事件的实例···')
        event = self.CreateObject(event_name, 0)
        if event is None:
            print('错误：未找到事件"' + event_name + '"的信息')
            return None
        if event.event_type == 0:
            print('正在向事件树添加宏事件"' + event_name + '"···')
            event_list = event.event_list
            exception_list = event.exception_list
            start_list = []
            for i in range(len(event_list)):
                child_name = event_list[i]['event']
                child = self.InitEventTree(child_name)
                if child is None:
                    raise ValueError(f'子事件不存在: {child_name}')
                event_list[i]['event'] = child
                if event_list[i]['event'].symbol_start is not None:
                    start_list.append(event_list[i]['event'].symbol_start)
            event.symbol_start = '|'.join(start_list)
            event.inactive_list = []
            for i in range(len(exception_list)):
                exc_name = exception_list[i]
                exc = self.InitEventTree(exc_name)
                if exc is None:
                    raise ValueError(f'异常事件不存在: {exc_name}')
                exception_list[i] = exc
        else:
            print('正在向事件树添加微事件"' + event_name + '"···')
            action = self.CreateObject(event.action, 1)
            if action is None:
                print('错误：微事件"' + event_name + '"未设置要执行的动作')
                return None
            print('正在向微事件"' + event_name + '"绑定"' + action.name + '"动作···')
            event.action = action
        return event

    def GetPosition(self, target, accuracy=None, *, kind='start'):
        if target is None or target == '':
            return []
        if self.frame is None:
            return []
        acc = self._accuracy_for_kind(kind) if accuracy is None else accuracy
        spec = parse_symbol(target, accuracy=acc, kind=kind, event=self.cursor)
        rects = self.router.resolve_for_action(self.frame, spec, event=self.cursor)
        return self.router.to_legacy_positions(rects)

    @staticmethod
    def GetRandomPosition(position):
        random_position = []
        for i in range(len(position)):
            seq = position[i][0]
            delta = seq - len(random_position)
            for j in range(delta):
                random_position.append([])
            random_position.append(Tools.RandomTool.getRandomPosition([position[i][1:3], position[i][3:5]]))
        return random_position

    def GetEventRoute(self):
        if len(self.stack) == 0:
            return '无'
        res = ''
        for i in range(len(self.stack) - 1):
            res += self.stack[i].name + '>'
        res += self.stack[len(self.stack) - 1].name
        return res

    def _finish_condition_met(self):
        if self.cursor.symbol_finish is None:
            if self.cursor.event_type == 0:
                for event in self.cursor.event_list:
                    if event['has_run_time'] < event['should_run_time']:
                        return False
                return True
            target_pos = self.GetPosition(self.cursor.symbol_start, kind='start')
            print(self.cursor.name, target_pos)
            return len(target_pos) == 0
        target_pos = self.GetPosition(self.cursor.symbol_finish, kind='finish')
        return len(target_pos) > 0

    def EventIsFinish(self):
        if self._finish_condition_met():
            self._finish_streak += 1
        else:
            self._finish_streak = 0
        return self._finish_streak >= self._finish_debounce_frames

    def EventIsCold(self, event):
        if self.pre_cursor is None:
            return False
        if event.name == self.pre_cursor.name and self.run_time >= event.max_suc_run_time:
            print('事件"' + event.name + '"已达到最大连续执行次数')
            return True
        return False

    def AddNextEvent(self, event_list):
        if len(event_list) == 0:
            return False
        if type(event_list[0]).__name__ == 'dict':
            print('正在查找子事件···')
            ordered = sorted(event_list, key=lambda e: e.get('priority', 0), reverse=True)
            i = 0
            while i < len(ordered):
                child_entry = ordered[i]
                if 'max_run_time' in child_entry and child_entry.get('has_run_time', 0) >= child_entry['max_run_time']:
                    i += 1
                    continue
                print('正在查询子事件' + child_entry['event'].name + '的状态')
                if self.EventIsCold(child_entry['event']):
                    print('该子事件正冷却中···')
                    i += 1
                    continue
                if child_entry['event'].symbol_start is None or child_entry['event'].symbol_start == '':
                    child_entry['event']._has_acted = False
                    self.stack.append(child_entry['event'])
                    return True
                target_pos = self.GetPosition(child_entry['event'].symbol_start, kind='start')
                if len(target_pos) > 0:
                    child_entry['event']._has_acted = False
                    self.stack.append(child_entry['event'])
                    return True
                i += 1
                time.sleep(0.05)
        else:
            for i in range(len(event_list)):
                if self.EventIsCold(event_list[i]):
                    print('该子事件正冷却中···')
                    continue
                if event_list[i].symbol_start is None or event_list[i].symbol_start == '':
                    self.stack.append(event_list[i])
                    return True
                target_pos = self.GetPosition(event_list[i].symbol_start, kind='start')
                if len(target_pos) > 0:
                    self.stack.append(event_list[i])
                    return True
                time.sleep(0.05)
        return False

    def GetWindowHwnd(self):
        key = self.cursor.window_name
        cached = self._hwnd_cache.get(key)
        if Tools.WindowTool.IsWindowValid(cached):
            self.cursor.hwnd = cached
            if self.cursor.event_type == 1:
                self.cursor.action.hwnd = cached
            return

        windows = key.split('|')
        parent = Tools.WindowTool.FindWindow(windows[0])
        hwnd = parent
        if len(windows) > 1 and parent != 0:
            hwnd = Tools.WindowTool.FindChildWindow(parent, windows[1])
        if hwnd is None or hwnd == 0:
            missing = windows[1] if hwnd is None and len(windows) > 1 else windows[0]
            print('错误：未找到窗口"' + missing + '"，任务暂停')
            raise TaskPausedError('未找到窗口: ' + key)

        self._hwnd_cache[key] = hwnd
        self.cursor.hwnd = hwnd
        if self.cursor.event_type == 1:
            self.cursor.action.hwnd = hwnd

    def CountAndClearRedundant(self):
        stack_len = len(self.stack)
        if stack_len > 1:
            # 如果不是根节点，找到父节点
            parent = self.stack[stack_len - 2]
            for i in range(len(parent.event_list)):
                child = parent.event_list[i]
                if child['event'].name == self.cursor.name:
                    child['has_run_time'] += 1
                    if child['has_run_time'] >= child['max_run_time']:
                        if child['has_run_time'] < child['should_run_time']:
                            print(
                                '警告：子事件"' + child['event'].name + '"已达 max_run_time='
                                + str(child['max_run_time']) + '，但未满足 should_run_time='
                                + str(child['should_run_time']) + '，父宏事件不会提前完成'
                            )
                            if child not in parent.inactive_list:
                                parent.inactive_list.append(child)
                        else:
                            for j in range(i + 1):
                                parent.inactive_list.append(parent.event_list[j])
                            del parent.event_list[:i + 1]
                    break

    def DoMicroEvent(self):
        if self.cursor.default_position is not None:
            rects = default_position_to_rects(self.cursor.default_position)
            position = self.router.to_legacy_positions(rects)
        else:
            position = self.GetPosition(self.cursor.symbol_start, kind='start')
        if not position:
            logger.warning(
                '微事件 "%s" 无可用坐标，跳过执行（symbol_start=%s, default_position=%s）',
                self.cursor.name,
                self.cursor.symbol_start,
                self.cursor.default_position,
            )
            self._note_miss_frame()
            return
        logger.debug('微事件 %s 坐标: %s', self.cursor.name, position)
        ActionEx.doAction(self.cursor.action, position, self.cursor.gap, runner=self)
        self.cursor._has_acted = True
        self._note_hit_frame()
        logger.info('微事件 "%s" 已执行', self.cursor.name)

    def DoGrandEvent(self):
        if self.cursor.has_rotate_time > self.cursor.max_rotate_time:
            print('宏事件"' + self.cursor.name + '"超出最大空转次数')
            print('宏事件"' + self.cursor.name + '"结束')
            self.cursor.has_rotate_time = 0
            self.CountAndClearRedundant()
            self.RecoverExceptionEvent()
            self._pop_event()  # 结束当前宏事件
            return
        print('查找将要执行的子事件···')
        add_event = self.AddNextEvent(self.cursor.event_list)  # 从宏事件的事件队列中寻找并向栈内添加下一个事件
        if add_event:  # 添加成功，前往执行
            print('找到事件"' + self.stack[-1].name + '"')
            self._note_hit_frame()
            return
        print('***未找到符合条件的事件，进行异常检测***')
        add_exception = self.AddNextEvent(self.cursor.exception_list)  # 添加失败，在宏事件的异常事件队列中寻找并添加下一个事件
        if add_exception:
            print('***发现异常：' + self.stack[-1].name)
            self._note_hit_frame()
            return
        add_inactive_event = self.AddNextEvent(self.cursor.inactive_list)
        print('***未找到异常，查找不活跃事件')
        if add_inactive_event:
            self._note_hit_frame()
            return
        self._note_miss_frame()
        self.cursor.has_rotate_time += 1  # 未找到异常，空转次数+1
        _interruptible_sleep(0.5, self)
        print('***本轮空转')

    def ColdEventCape(self):
        if self.EventIsCold(self.cursor):
            self._pop_event()
            if len(self.stack) == 0:
                return True
            self.cursor = self.stack[-1]
            print('***正在执行异常检测')
            add_exception = self.AddNextEvent(self.cursor.exception_list)
            if add_exception:
                print('***发现异常：' + self.stack[-1].name)
                return True
            add_event = self.AddNextEvent(self.cursor.event_list)
            if add_event:
                return True
            add_inactive_event = self.AddNextEvent(self.cursor.inactive_list)
            if add_inactive_event:
                return True
            print('***找不到符合条件的不活跃事件，执行冷却中的事件')
            self.stack.append(self.pre_cursor)
            if self.EventIsFinish():
                self.CountAndClearRedundant()
                self.RecoverExceptionEvent()
                self._pop_event()
            else:
                self.run_time = max(0, self.run_time - 1)
            return True
        return False

    def SuccessiveRunCount(self):
        if self.cursor.event_type == 0 and self.cursor.has_rotate_time > 0:  # 宏事件空转中，不做连续执行计数
            pass
        elif self.pre_cursor is not None and self.pre_cursor.name == self.cursor.name:
            self.run_time += 1  # 如果当前事件和上一个执行事件相同，连续执行计数+1
        else:
            self.pre_cursor = self.cursor
            self.run_time = 1  # 如果不相同，将当前事件设为上一个执行事件

    def RecoverExceptionEvent(self):
        if not self.cursor.is_exception:
            return
        target = self.cursor
        if target.event_type == 1 and len(self.stack) >= 2:
            target = self.stack[-2]
        if target.event_type != 0:
            return
        event_list = []
        for i in range(len(target.inactive_list)):
            target.inactive_list[i]['has_run_time'] = 0
            event_list.append(target.inactive_list[i])
        target.event_list = event_list + target.event_list
        target.inactive_list = []

    def _pop_event(self):
        self.router.last_known.clear()
        self.stack.pop()

    def EventDispatch(self):
        self._end_reason = 'completed'
        self._end_message = None
        while len(self.stack) > 0:
            if self._stop_requested:
                logger.info('任务收到停止请求')
                self._end_reason = 'stopped'
                return
            self._wait_if_paused()
            if self._stop_requested:
                logger.info('任务收到停止请求')
                self._end_reason = 'stopped'
                return
            try:
                self.frame = FrameContext.capture(self.adb_client)
            except (TaskPausedError, ScreenshotError) as exc:
                logger.warning('任务暂停: %s', exc)
                self._end_reason = 'paused'
                self._end_message = str(exc)
                self.stack.clear()
                return

            logger.debug('正在执行: %s', self.GetEventRoute())
            self.cursor = self.stack[-1]
            if self.ColdEventCape():
                continue
            self.SuccessiveRunCount()
            try:
                self.GetWindowHwnd()
            except TaskPausedError as exc:
                logger.warning('任务暂停: %s', exc)
                self._end_reason = 'paused'
                self._end_message = str(exc)
                self.stack.clear()
                return
            try:
                if self.EventIsFinish():
                    logger.info('事件完成: %s', self.cursor.name)
                    self.CountAndClearRedundant()
                    self.RecoverExceptionEvent()
                    self._pop_event()
                    continue
                if type(self.cursor).__name__ == 'GrandEvent':
                    logger.debug(
                        '宏事件 %s 空转(%s/%s)',
                        self.cursor.name, self.cursor.has_rotate_time, self.cursor.max_rotate_time,
                    )
                    self.DoGrandEvent()
                else:
                    logger.debug(
                        '微事件 %s (%s/%s)',
                        self.cursor.name, self.run_time, self.cursor.max_suc_run_time,
                    )
                    if getattr(self.cursor, '_has_acted', False) and not self.EventIsFinish():
                        continue
                    self.DoMicroEvent()
            except TaskPausedError as exc:
                logger.warning('任务暂停: %s', exc)
                self._end_reason = 'paused'
                self._end_message = str(exc)
                self.stack.clear()
                return

    def Reset(self):
        self.run_time = 0
        self.pre_cursor = None
        self._finish_streak = 0
        self._stop_requested = False
        self._pause_requested = False
        self._paused = False
        self.frame = None
        root = copy.deepcopy(self.event_tree_template)
        self.stack.append(root)

    def Start(self):
        for i in range(self.repeat_time):
            print('==========任务循环(' + str(self.has_repeat_time + 1) + '/' + str(self.repeat_time) + ')===========')
            self.Reset()
            self.EventDispatch()
            self.has_repeat_time += 1


class DataManager:
    @staticmethod
    def ReadFile(obj_type):
        from serialization import sanitize_action_dict, sanitize_event_dict
        if obj_type == 0:
            return Tools.FileTool.ReadJSON(str(paths.EVENT_JSON))
        return Tools.FileTool.ReadJSON(str(paths.ACTION_JSON))

    @staticmethod
    def WriteFile(obj_type, content):
        from serialization import sanitize_action_dict, sanitize_event_dict
        if obj_type == 0:
            cleaned = [sanitize_event_dict(item) for item in content]
            Tools.FileTool.WriteJSON(str(paths.EVENT_JSON), cleaned, indent=2)
        else:
            cleaned = [sanitize_action_dict(item) for item in content]
            Tools.FileTool.WriteJSON(str(paths.ACTION_JSON), cleaned, indent=2)

    @staticmethod
    def _serialize_obj(obj, obj_type):
        from serialization import ACTION_FIELDS, GRAND_EVENT_FIELDS, MICRO_EVENT_FIELDS, sanitize_action_dict, sanitize_event_dict
        data = dict(obj.__dict__)
        if obj_type == 0:
            fields = GRAND_EVENT_FIELDS if data.get('event_type', 1) == 0 else MICRO_EVENT_FIELDS
            return sanitize_event_dict({k: v for k, v in data.items() if k in fields or k in data})
        return sanitize_action_dict(data)

    @staticmethod
    def AddObj(obj, obj_type):
        obj_list = DataManager.ReadFile(obj_type)
        for item in obj_list:
            if obj.name == item['name']:
                print('提示：事件名已存在')
                return 0
        obj_list.append(DataManager._serialize_obj(obj, obj_type))
        DataManager.WriteFile(obj_type, obj_list)
        logger.info('事件"%s"添加成功', obj.name)

    @staticmethod
    def DelObj(obj, obj_type):
        obj_list = DataManager.ReadFile(obj_type)
        for i in range(len(obj_list)):
            if obj.name == obj_list[i]['name']:
                del obj_list[i]
                DataManager.WriteFile(obj_type, obj_list)
                print('事件"' + obj.name + '"删除成功')
                return 1
        print('错误：未找到目标事件，删除失败')
        return 0

    @staticmethod
    def UpdateObj(obj, obj_type):
        step = DataManager.DelObj(obj, obj_type)
        if step == 0:
            print('错误：事件"' + obj.name + '"更新失败')
            return 0
        step = DataManager.AddObj(obj, obj_type)
        if step == 0:
            print('错误：事件"' + obj.name + '"更新失败')
            return 0
        print('事件"' + obj.name + '"更新成功')
        return 1

    @staticmethod
    def FindObj(obj,obj_type):
        obj_list = DataManager.ReadFile(obj_type)
        for i in range(len(obj_list)):
            if obj.name == obj_list[i]['name']:
                print('事件"' + obj.name + '"查找成功')
                return 1
        print('错误：未找到目标事件，查找失败')
        return 0