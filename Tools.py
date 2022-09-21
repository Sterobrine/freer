import win32gui
import win32api
import win32con
import os
import win32ui
import cv2
import random
import json
import numpy as np
import time


count = 0


class WindowTool:
    @staticmethod
    def FindWindow(window_name):
        return win32gui.FindWindow(None, window_name)

    @staticmethod
    def MoveWindow(hwnd, x, y):
        pass

    @staticmethod
    def GetWindowSize(hwnd):
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
        window_list = [hwnd]
        while len(window_list) > 0:
            res = win32gui.EnumChildWindows(window_list[0], WindowTool.IsTargetWindow, [name, window_list])
            if not res:
                return window_list[-1]
            del window_list[0]
        return None


class ImageTool:
    # @staticmethod
    # def Capture(hwnd):
    #     hwndDC = win32gui.GetWindowDC(hwnd)
    #     mfcDC = win32ui.CreateDCFromHandle(hwndDC)
    #     saveDC = mfcDC.CreateCompatibleDC()
    #     saveBitMap = win32ui.CreateBitmap()
    #     rctA = win32gui.GetWindowRect(hwnd)
    #     w = rctA[2] - rctA[0]
    #     h = rctA[3] - rctA[1]
    #     saveBitMap.CreateCompatibleBitmap(mfcDC, w, h)
    #     saveDC.SelectObject(saveBitMap)
    #     saveDC.BitBlt((0, 0), (w, h), mfcDC, (0, 0), win32con.SRCCOPY)
    #     signedIntsArray = saveBitMap.GetBitmapBits(True)
    #     img = np.frombuffer(signedIntsArray, dtype="uint8")
    #     img.shape = (h, w, 4)
    #     win32gui.DeleteObject(saveBitMap.GetHandle())
    #     mfcDC.DeleteDC()
    #     saveDC.DeleteDC()
    #     return cv2.cvtColor(img, cv2.COLOR_RGBA2RGB)
    @staticmethod
    def Capture():
        os.system('adb -s emulator-5554 exec-out screencap -p > sc.bmp')
        time.sleep(0.01)

    @staticmethod
    def FindImage(hwnd, target, accuracy):
        target = target.split('|')
        method = cv2.TM_CCOEFF_NORMED
        # img = ImageTool.Capture(hwnd)
        # ImageTool.Capture()
        img = cv2.cvtColor(cv2.imread('sc.bmp'), cv2.COLOR_RGBA2RGB)
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
    def WriteJSON(file_path, content, mode='w'):
        file = open(file_path, mode=mode, encoding='utf-8')
        file.write(json.dumps(content))
        file.close()


class ActionTool:
    # @staticmethod
    # def ADBClick(x, y):
    @staticmethod
    def doClick(x, y, hwnd):
        long_position = y << 16 | x
        win32api.PostMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, long_position)
        win32api.PostMessage(hwnd, win32con.WM_LBUTTONUP, win32con.MK_LBUTTON, long_position)

    @staticmethod
    def LeftDown(x, y, hwnd):
        long_position = y << 16 | x
        win32api.PostMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, long_position)

    @staticmethod
    def MoveTo(x, y, hwnd):
        long_position = y << 16 | x
        win32api.PostMessage(hwnd, win32con.WM_MOUSEMOVE, 0, long_position)

    @staticmethod
    def LeftUp(x, y, hwnd):
        long_position = y << 16 | x
        win32api.PostMessage(hwnd, win32con.WM_LBUTTONUP, win32con.MK_LBUTTON, long_position)

    @staticmethod
    def InputCharacter(c):
        os.system('adb -s emulator-5554 shell input text ' + c)


class RandomTool:
    @staticmethod
    def getRandomPosition(position):
        return [random.randint(position[0][0], position[1][0]), random.randint(position[0][1], position[1][1])]

    @staticmethod
    def getRandomGap(ranges):
        return random.uniform(ranges[0], ranges[1])