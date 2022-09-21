class Event:
    run_time = 0
    hwnd = None
    id = None

    def __init__(self, name, window_name, symbol_start, symbol_finish, max_suc_run_time, accuracy, event_type, is_exception):
        self.accuracy = accuracy
        self.name = name
        self.symbol_start = symbol_start
        self.symbol_finish = symbol_finish
        self.max_suc_run_time = max_suc_run_time
        self.event_type = event_type
        self.window_name = window_name
        self.is_exception = is_exception

    def SetByDict(self, data_dict):
        for key in data_dict:
            self.__dict__[key] = data_dict[key]


class GrandEvent(Event):
    event_list = None
    exception_list = None
    has_rotate_time = 0

    def __init__(self, name=None, window_name=None, symbol_start=None, symbol_finish=None, event_list=None, exception_list=None, accuracy=0.85, max_suc_run_time=5, max_rotate_time=5, is_exception=None):
        Event.__init__(self, name, window_name, symbol_start, symbol_finish, max_suc_run_time, accuracy, 0, is_exception)
        self.event_list = event_list
        self.exception_list = exception_list
        self.max_rotate_time = max_rotate_time


class MicroEvent(Event):
    action = None

    def __init__(self, name=None, window_name=None, action=None, symbol_start=None, symbol_finish=None, gap=None, accuracy=0.85, max_suc_run_time=5, default_position=None, is_exception=None):
        Event.__init__(self, name, window_name, symbol_start, symbol_finish, max_suc_run_time, accuracy, 1, is_exception)
        self.default_position = default_position
        self.action = action
        if gap is None:
            self.gap = [0.3, 0.5]
        else:
            self.gap = gap


class Action:
    hwnd = None
    id = None

    def __init__(self, name=None, action_type=None, run_time=None, wait_time=None, gap=None, duration=None, text=None):
        self.name = name
        self.action_type = action_type
        self.run_time = run_time  # 动作重复进行次数
        self.wait_time = wait_time  # 等待动作专用
        self.duration = duration  # 持续性动作专用
        self.text = text
        if gap is None:
            self.gap = [0.02, 0.03]
        else:
            self.gap = gap

    def SetByDict(self, data_dict):
        for key in data_dict:
            self.__dict__[key] = data_dict[key]
# 1.left_click 2.right_click 3.drag 4.wait