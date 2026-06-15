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


class ActionTool:
    @staticmethod
    def doClick(x, y, hwnd):
        if _WIN32:
            long_position = y << 16 | x
            win32api.PostMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, long_position)
            win32api.PostMessage(hwnd, win32con.WM_LBUTTONUP, win32con.MK_LBUTTON, long_position)
        else:
            _default_adb_client.tap(x, y)

    @staticmethod
    def LeftDown(x, y, hwnd):
        if _WIN32:
            long_position = y << 16 | x
            win32api.PostMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, long_position)

    @staticmethod
    def MoveTo(x, y, hwnd):
        if _WIN32:
            long_position = y << 16 | x
            win32api.PostMessage(hwnd, win32con.WM_MOUSEMOVE, 0, long_position)

    @staticmethod
    def LeftUp(x, y, hwnd):
        if _WIN32:
            long_position = y << 16 | x
            win32api.PostMessage(hwnd, win32con.WM_LBUTTONUP, win32con.MK_LBUTTON, long_position)
        else:
            _default_adb_client.tap(x, y)

    @staticmethod
    def InputCharacter(c):
        _default_adb_client.input_text(c)


class RandomTool:
    @staticmethod
    def getRandomPosition(position):
        return [random.randint(position[0][0], position[1][0]), random.randint(position[0][1], position[1][1])]

    @staticmethod
    def getRandomGap(ranges):
        return random.uniform(ranges[0], ranges[1])