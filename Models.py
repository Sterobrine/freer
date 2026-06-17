class Event:
    def __init__(self, name, window_name, symbol_start, symbol_finish, max_suc_run_time, accuracy, event_type, is_exception):
        self.run_time = 0
        self.hwnd = None
        self.id = None
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
    def __init__(self, name=None, window_name=None, symbol_start=None, symbol_finish=None, event_list=None, exception_list=None, accuracy=0.85, max_suc_run_time=5, max_rotate_time=5, is_exception=None):
        Event.__init__(self, name, window_name, symbol_start, symbol_finish, max_suc_run_time, accuracy, 0, is_exception)
        self.event_list = event_list if event_list is not None else []
        self.exception_list = exception_list if exception_list is not None else []
        self.inactive_list = []
        self.has_rotate_time = 0
        self.max_rotate_time = max_rotate_time


class MicroEvent(Event):
    def __init__(self, name=None, window_name=None, action=None, symbol_start=None, symbol_finish=None, gap=None, accuracy=0.85, max_suc_run_time=5, default_position=None, is_exception=None):
        Event.__init__(self, name, window_name, symbol_start, symbol_finish, max_suc_run_time, accuracy, 1, is_exception)
        self.default_position = default_position
        self.action = action
        if gap is None:
            self.gap = [0.3, 0.5]
        else:
            self.gap = gap


class Action:
    def __init__(self, name=None, run_time=None, gap=None, steps=None, platform=None, **kwargs):
        self.hwnd = None
        self.id = None
        self.name = name
        self.platform = platform or 'windows'
        self.run_time = run_time if run_time is not None else 1
        self.steps = steps if steps is not None else []
        if gap is None:
            self.gap = [0.02, 0.03]
        else:
            self.gap = gap

    def SetByDict(self, data_dict):
        for key in data_dict:
            self.__dict__[key] = data_dict[key]
        if not self.steps and ('action_type' in data_dict or 'steps' in data_dict):
            from action_steps import get_action_steps, normalize_platform
            self.platform = normalize_platform(data_dict.get('platform', self.platform))
            self.steps = get_action_steps(data_dict)