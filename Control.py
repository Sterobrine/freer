import Tools
import Models
import time
import copy

import paths
from recognition.adb_client import AdbClient
from recognition.frame import FrameContext, ScreenshotError
from recognition.parse import parse_symbol
from recognition.router import MatcherRouter
from recognition.types import FINISH_DEBOUNCE_FRAMES, TaskPausedError
from freer_log import get_logger

logger = get_logger('freer.engine')


class ActionEx:
    @staticmethod
    def LeftClick(position, action, event_gap):
        if len(position) == 0:
            print('未设定左键单击目标')
            return
        for i in range(len(position)):
            position[i][0] = 0
            for j in range(action.run_time):
                site = EventEx.GetRandomPosition([position[i]])[0]
                if len(site) == 0:
                    continue
                Tools.ActionTool.doClick(site[0], site[1], action.hwnd)
                time.sleep(Tools.RandomTool.getRandomGap(action.gap))
            time.sleep(Tools.RandomTool.getRandomGap(event_gap))


    @staticmethod
    def Drag(position, action, event_gap):
        if len(position) == 0:
            print('未设置拖拽目标')
            return
        i = 0
        while i + 1 < len(position):
            for j in range(action.run_time):
                site = EventEx.GetRandomPosition([position[i], position[i + 1]])
                if len(site[0]) == 0 or len(site[1]) == 0:
                    continue
                x1 = site[0][0]
                y1 = site[0][1]
                x2 = site[1][0]
                y2 = site[1][1]
                Tools.ActionTool.LeftDown(x1, y1, action.hwnd)
                if x1 == x2 and y1 == y2:
                    Tools.ActionTool.LeftUp(x2, y2, action.hwnd)
                elif x1 == x2:
                    speed = action.duration / abs(y1 - y2)
                    step = -1 if y1 > y2 else 1
                    for y in range(y1, y2, step):
                        Tools.ActionTool.MoveTo(x1, y, action.hwnd)
                        time.sleep(speed)
                    Tools.ActionTool.LeftUp(x2, y2, action.hwnd)
                elif y1 == y2:
                    speed = action.duration / abs(x1 - x2)
                    step = -1 if x1 > x2 else 1
                    for x in range(x1, x2, step):
                        Tools.ActionTool.MoveTo(x, y1, action.hwnd)
                        time.sleep(speed)
                    Tools.ActionTool.LeftUp(x2, y2, action.hwnd)
                else:
                    k = (y1 - y2) / (x1 - x2)
                    b = y1 - k * x1
                    speed = action.duration / abs(x1 - x2)
                    step = -1 if x1 > x2 else 1
                    for x in range(x1, x2, step):
                        y = int(k * x + b)
                        Tools.ActionTool.MoveTo(x, y, action.hwnd)
                        time.sleep(speed)
                    Tools.ActionTool.LeftUp(x2, y2, action.hwnd)
                time.sleep(Tools.RandomTool.getRandomGap(action.gap))
            i += 2
            time.sleep(Tools.RandomTool.getRandomGap(event_gap))

    @staticmethod
    def Input(action, event_gap):
        for c in action.text:
            Tools.ActionTool.InputCharacter(c)
            time.sleep(Tools.RandomTool.getRandomGap(action.gap))
        time.sleep(Tools.RandomTool.getRandomGap(event_gap))

    @staticmethod
    def Wait(action):
        if type(action.wait_time).__name__ == 'list':
            wait_time = Tools.RandomTool.getRandomGap(action.wait_time)
        else:
            wait_time = action.wait_time
        time.sleep(wait_time)

    @staticmethod
    def GetFirstPosition(position):
        for item in position:
            if len(item) > 0:
                return item
        return None

    @staticmethod
    def doAction(action, position, event_gap):
        print('开始执行操作：' + action.name)
        action_type = action.action_type
        if action_type == 1:
            ActionEx.LeftClick(position, action, event_gap)
        elif action_type == 3:
            ActionEx.Drag(position, action, event_gap)
        elif action_type == 4:
            ActionEx.Wait(action)
        elif action_type == 5:
            ActionEx.Input(action, event_gap)


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
        self.router = MatcherRouter()
        self.adb_client = AdbClient()
        self.frame = None
        self._hwnd_cache = {}
        self._finish_streak = 0
        self._finish_debounce_frames = FINISH_DEBOUNCE_FRAMES
        self._stop_requested = False
        self.InitInfo()
        logger.info('开始创建事件树: %s', event_name)
        self.event_tree_template = self.InitEventTree(self.event_name)
        logger.info('事件树创建完成: %s', event_name)

    def request_stop(self):
        self._stop_requested = True
        self.stack.clear()

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
                event_list[i]['event'] = self.InitEventTree(event_list[i]['event'])
                if event_list[i]['event'].symbol_start is not None:
                    start_list.append(event_list[i]['event'].symbol_start)
            event.symbol_start = '|'.join(start_list)
            event.inactive_list = []
            for i in range(len(exception_list)):
                exception_list[i] = self.InitEventTree(exception_list[i])
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
        acc = self.cursor.accuracy if accuracy is None else accuracy
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
                    self.stack.append(child_entry['event'])
                    return True
                target_pos = self.GetPosition(child_entry['event'].symbol_start, kind='start')
                if len(target_pos) > 0:
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
            position = self.cursor.default_position  # 如果默认点击位置不为空，使用默认点击位置
            tmp = []
            i = 0
            while i < len(position):
                tmp.append([0, position[i][0], position[i][1], position[i+1][0], position[i+1][1]])
                i += 2
            position = tmp
        else:
            position = self.GetPosition(self.cursor.symbol_start, kind='start')
        print(self.cursor.name, position)
        ActionEx.doAction(self.cursor.action, position, self.cursor.gap)
        print('微事件"' + self.cursor.name + '"已执行')

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
            return
        print('***未找到符合条件的事件，进行异常检测***')
        add_exception = self.AddNextEvent(self.cursor.exception_list)  # 添加失败，在宏事件的异常事件队列中寻找并添加下一个事件
        if add_exception:
            print('***发现异常：' + self.stack[-1].name)
            return
        add_inactive_event = self.AddNextEvent(self.cursor.inactive_list)
        print('***未找到异常，查找不活跃事件')
        if add_inactive_event:
            return
        self.cursor.has_rotate_time += 1  # 未找到异常，空转次数+1
        time.sleep(0.5)
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
                self.run_time -= 1
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
        if self.cursor.is_exception and self.cursor.event_type == 0:
            event_list = []
            for i in range(len(self.cursor.inactive_list)):
                self.cursor.inactive_list[i]['has_run_time'] = 0
                event_list.append(self.cursor.inactive_list[i])
            self.cursor.event_list = event_list + self.cursor.event_list
            self.cursor.inactive_list = []

    def _pop_event(self):
        self.router.last_known.clear()
        self.stack.pop()

    def EventDispatch(self):
        while len(self.stack) > 0:
            if self._stop_requested:
                logger.info('任务收到停止请求')
                return
            try:
                self.frame = FrameContext.capture(self.adb_client)
            except (TaskPausedError, ScreenshotError) as exc:
                logger.warning('任务暂停: %s', exc)
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
                    self.DoMicroEvent()
            except TaskPausedError as exc:
                logger.warning('任务暂停: %s', exc)
                self.stack.clear()
                return

    def Reset(self):
        self.run_time = 0
        self.pre_cursor = None
        self._finish_streak = 0
        self._stop_requested = False
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