import os
import sys
import random
import json
import time

import paths
from recognition.adb_client import AdbClient
from recognition.types import AdbError

_WIN32 = sys.platform == 'win32'
if _WIN32:
    import win32gui
    import win32api
    import win32con
    import win32ui  # noqa: F401 — 保留供注释掉的 Win32 截屏代码引用


class ScreenshotError(Exception):
    """Raised when the screenshot file is missing or cannot be decoded."""


count = 0
_default_adb_client = AdbClient()


class WindowTool:
    @staticmethod
    def IsWindowValid(hwnd) -> bool:
        if not _WIN32:
            return False
        if hwnd in (None, 0):
            return False
        try:
            return bool(win32gui.IsWindow(hwnd))
        except Exception:
            return False

    @staticmethod
    def FindWindow(window_name):
        if not _WIN32:
            return 0
        return win32gui.FindWindow(None, window_name)

    @staticmethod
    def MoveWindow(hwnd, x, y):
        pass

    @staticmethod
    def GetWindowSize(hwnd):
        if not _WIN32:
            return [0, 0]
        left, top, right, bot = win32gui.GetClientRect(hwnd)
        return [right, bot]

    @staticmethod
    def IsTargetWindow(hwnd, args):
        title = win32gui.GetWindowText(hwnd)
        args[1].append(hwnd)
        if title == args[0]:
            return False
        return True

    @staticmethod
    def FindChildWindow(hwnd, name):
        if not _WIN32:
            return None
        window_list = [hwnd]
        while len(window_list) > 0:
            res = win32gui.EnumChildWindows(window_list[0], WindowTool.IsTargetWindow, [name, window_list])
            if not res:
                return window_list[-1]
            del window_list[0]
        return None


class ImageTool:
    @staticmethod
    def Capture(adb_client=None):
        client = adb_client or _default_adb_client
        try:
            raw = client.screencap()
        except AdbError as exc:
            raise ScreenshotError(str(exc)) from exc
        with open(paths.SCREENSHOT_PATH, 'wb') as f:
            f.write(raw)
        time.sleep(0.01)

    @staticmethod
    def FindImage(hwnd, target, accuracy):
        import cv2
        import numpy as np

        target = target.split('|')
        method = cv2.TM_CCOEFF_NORMED
        raw = cv2.imread(str(paths.SCREENSHOT_PATH))
        if raw is None:
            raise ScreenshotError(
                f'无法读取截图文件: {paths.SCREENSHOT_PATH}（请确认 ADB 截屏已成功）'
            )
        img = cv2.cvtColor(raw, cv2.COLOR_RGBA2RGB)
        pos = []
        for i in range(len(target)):
            template = cv2.imdecode(np.fromfile(target[i], dtype=np.uint8), -1)
            h, w = template.shape[:2]
            res = cv2.matchTemplate(img, template, method)
            min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)
            top_left = max_loc
            bottom_right = (top_left[0] + w, top_left[1] + h)
            if max_val >= accuracy:
                pos.append([i, top_left[0], top_left[1], bottom_right[0], bottom_right[1]])
        return pos

    @staticmethod
    def GetImageSize(img_path):
        import cv2
        import numpy as np

        img = cv2.imdecode(np.fromfile(img_path, dtype=np.uint8), -1)
        return [img.shape[1], img.shape[0]]


class FileTool:
    @staticmethod
    def ReadFile(file_path):
        file = open(file_path, mode='r', encoding='utf-8')
        res = file.readlines()
        file.close()
        return res

    @staticmethod
    def WriteFile(file_path, content, mode='w'):
        file = open(file_path, mode=mode, encoding='utf-8')
        file.writelines(content)
        file.close()

    @staticmethod
    def ReadJSON(file_path):
        file = open(file_path, mode='r', encoding='utf-8')
        res = json.load(file)
        file.close()
        return res

    @staticmethod
    def WriteJSON(file_path, content, mode='w', indent=None):
        file = open(file_path, mode=mode, encoding='utf-8')
        file.write(json.dumps(content, ensure_ascii=False, indent=indent))
        file.close()


class WindowsAction:
    @staticmethod
    def _down(button='left'):
        import win32con
        return {
            'left': (win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON),
            'right': (win32con.WM_RBUTTONDOWN, win32con.MK_RBUTTON),
            'middle': (win32con.WM_MBUTTONDOWN, win32con.MK_MBUTTON),
        }.get(button, (win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON))

    @staticmethod
    def _up(button='left'):
        import win32con
        return {
            'left': (win32con.WM_LBUTTONUP, win32con.MK_LBUTTON),
            'right': (win32con.WM_RBUTTONUP, 0),
            'middle': (win32con.WM_MBUTTONUP, 0),
        }.get(button, (win32con.WM_LBUTTONUP, win32con.MK_LBUTTON))

    @staticmethod
    def _pack(x, y):
        return y << 16 | x

    @staticmethod
    def pointer_down(x, y, hwnd, button='left'):
        if not _WIN32:
            print('Windows 按下需要 Win32 环境')
            return
        import win32api
        msg, wparam = WindowsAction._down(button)
        win32api.PostMessage(hwnd, msg, wparam, WindowsAction._pack(x, y))

    @staticmethod
    def pointer_up(x, y, hwnd, button='left'):
        if not _WIN32:
            print('Windows 抬起需要 Win32 环境')
            return
        import win32api
        msg, wparam = WindowsAction._up(button)
        win32api.PostMessage(hwnd, msg, wparam, WindowsAction._pack(x, y))

    @staticmethod
    def pointer_move(x, y, hwnd):
        if not _WIN32:
            return
        import win32api
        import win32con
        win32api.PostMessage(hwnd, win32con.WM_MOUSEMOVE, 0, WindowsAction._pack(x, y))

    @staticmethod
    def click(x, y, hwnd, button='left'):
        WindowsAction.pointer_down(x, y, hwnd, button)
        WindowsAction.pointer_up(x, y, hwnd, button)

    @staticmethod
    def perform_drag(hwnd, x1, y1, x2, y2, duration):
        WindowsAction.pointer_down(x1, y1, hwnd, 'left')
        if x1 == x2 and y1 == y2:
            time.sleep(duration)
            WindowsAction.pointer_up(x2, y2, hwnd, 'left')
        elif x1 == x2:
            speed = duration / abs(y1 - y2) if y1 != y2 else duration
            step = -1 if y1 > y2 else 1
            for y in range(y1, y2, step):
                WindowsAction.pointer_move(x1, y, hwnd)
                time.sleep(speed)
            WindowsAction.pointer_up(x2, y2, hwnd, 'left')
        elif y1 == y2:
            speed = duration / abs(x1 - x2) if x1 != x2 else duration
            step = -1 if x1 > x2 else 1
            for x in range(x1, x2, step):
                WindowsAction.pointer_move(x, y1, hwnd)
                time.sleep(speed)
            WindowsAction.pointer_up(x2, y2, hwnd, 'left')
        else:
            k = (y1 - y2) / (x1 - x2)
            b = y1 - k * x1
            speed = duration / abs(x1 - x2) if x1 != x2 else duration
            step = -1 if x1 > x2 else 1
            for x in range(x1, x2, step):
                y = int(k * x + b)
                WindowsAction.pointer_move(x, y, hwnd)
                time.sleep(speed)
            WindowsAction.pointer_up(x2, y2, hwnd, 'left')

    @staticmethod
    def key_press(key, hwnd):
        if not _WIN32:
            return
        import win32api
        import win32con
        vk = int(key) if str(key).isdigit() else getattr(win32con, str(key), None)
        if vk is None:
            print(f'未知按键: {key}')
            return
        win32api.PostMessage(hwnd, win32con.WM_KEYDOWN, vk, 0)
        win32api.PostMessage(hwnd, win32con.WM_KEYUP, vk, 0)


class AdbAction:
    @staticmethod
    def tap(x, y):
        _default_adb_client.tap(x, y)

    @staticmethod
    def swipe(x1, y1, x2, y2, duration_sec):
        ms = max(int(duration_sec * 1000), 50)
        _default_adb_client.swipe(x1, y1, x2, y2, ms)

    @staticmethod
    def key_press(key):
        _default_adb_client.keyevent(str(key))

    @staticmethod
    def input_char(c):
        _default_adb_client.input_text(c)


class MacAction:
    @staticmethod
    def unsupported(op):
        print(f'macOS 操作「{op}」尚未实现，请在 Mac 上接入 Quartz/CGEvent 后使用')


class ActionTool:
    @staticmethod
    def doClick(x, y, hwnd):
        if _WIN32:
            WindowsAction.click(x, y, hwnd, 'left')
        else:
            AdbAction.tap(x, y)

    @staticmethod
    def LeftDown(x, y, hwnd):
        if _WIN32:
            WindowsAction.pointer_down(x, y, hwnd, 'left')

    @staticmethod
    def MoveTo(x, y, hwnd):
        if _WIN32:
            WindowsAction.pointer_move(x, y, hwnd)

    @staticmethod
    def LeftUp(x, y, hwnd):
        if _WIN32:
            WindowsAction.pointer_up(x, y, hwnd, 'left')

    @staticmethod
    def RightClick(x, y, hwnd):
        if _WIN32:
            WindowsAction.click(x, y, hwnd, 'right')
        else:
            AdbAction.tap(x, y)

    @staticmethod
    def DoubleClick(x, y, hwnd):
        if _WIN32:
            WindowsAction.click(x, y, hwnd, 'left')
            time.sleep(0.05)
            WindowsAction.click(x, y, hwnd, 'left')
        else:
            AdbAction.tap(x, y)
            time.sleep(0.05)
            AdbAction.tap(x, y)

    @staticmethod
    def MiddleClick(x, y, hwnd):
        if _WIN32:
            WindowsAction.click(x, y, hwnd, 'middle')
        else:
            AdbAction.tap(x, y)

    @staticmethod
    def Scroll(x, y, hwnd, notches):
        delta = int(notches * 120)
        if _WIN32:
            import win32api
            import win32con
            long_position = y << 16 | x
            wparam = (delta & 0xFFFF) << 16
            win32api.PostMessage(hwnd, win32con.WM_MOUSEWHEEL, wparam, long_position)
        else:
            dy = -40 if notches > 0 else 40
            steps = abs(int(notches)) or 1
            for _ in range(steps):
                AdbAction.swipe(x, y, x, y + dy, 0.1)
                time.sleep(0.05)

    @staticmethod
    def LongPress(x, y, hwnd, duration_sec):
        if _WIN32:
            WindowsAction.perform_drag(hwnd, x, y, x, y, duration_sec)
        else:
            AdbAction.swipe(x, y, x, y, duration_sec)

    @staticmethod
    def KeyPress(key, hwnd):
        if _WIN32:
            WindowsAction.key_press(key, hwnd)
        else:
            AdbAction.key_press(key)

    @staticmethod
    def InputCharacter(c):
        AdbAction.input_char(c)


class RandomTool:
    @staticmethod
    def getRandomPosition(position):
        return [random.randint(position[0][0], position[1][0]), random.randint(position[0][1], position[1][1])]

    @staticmethod
    def getRandomGap(ranges):
        return random.uniform(ranges[0], ranges[1])