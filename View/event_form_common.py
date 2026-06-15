import os

from PySide2.QtWidgets import QFileDialog, QMainWindow

import Tools
import paths


def LoadData(ui):
    ui.event_data = Tools.FileTool.ReadJSON(str(paths.EVENT_JSON))
    ui.action_data = Tools.FileTool.ReadJSON(str(paths.ACTION_JSON))


def GetEventNameList(ui, event_type):
    names = []
    if event_type == 2:
        event_list = ui.action_data
    else:
        event_list = ui.event_data
    for event in event_list:
        if event_type == 2:
            names.append(event['name'])
        elif event_type == 3 and event['is_exception'] and event['event_type'] == 0:
            names.append(event['name'])
        elif event_type == 4 and event['is_exception'] and event['event_type'] == 1:
            names.append(event['name'])
        elif event_type == 0 and event['is_exception'] is not True and event['event_type'] == 0:
            names.append(event['name'])
        elif event_type == 1 and event['is_exception'] is not True and event['event_type'] == 1:
            names.append(event['name'])
    return names


def GetComboboxTypeCode(box):
    if box.currentText() == '宏事件':
        return 0
    if box.currentText() == '微事件':
        return 1
    if box.currentText() == '异常-宏事件':
        return 3
    if box.currentText() == '异常-微事件':
        return 4
    return 1


def GetImagePath():
    root_path = str(paths.IMG_DIR)
    file_path = QFileDialog.getOpenFileNames(QMainWindow(), '选择文件', root_path, '位图 (*.bmp)')
    return '|'.join(file_path[0])


def SetStartImagePath(ui):
    ui.text_start_path.setText(GetImagePath())


def SetFinishImagePath(ui):
    ui.text_finish_path.setText(GetImagePath())


def LimitGapInput(ui):
    if ui.text_gap1.value() >= ui.text_gap2.value():
        ui.text_gap2.setValue(ui.text_gap1.value() + 0.2)


def deleteItemsOfLayout(layout):
    if layout is not None:
        while layout.count():
            item = layout.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.setParent(None)
            else:
                deleteItemsOfLayout(item.layout())


def DelRow(ui, row, event_name, event_type):
    if event_type == 0:
        vbox = ui.child_v_box
        event_list = ui.child_list
    else:
        vbox = ui.exception_v_box
        event_list = ui.exception_list
    for i in range(vbox.count()):
        layout_item = vbox.itemAt(i)
        if layout_item.layout() == row:
            deleteItemsOfLayout(layout_item.layout())
            vbox.removeItem(layout_item)
            break
    i = len(event_list) - 1
    while i >= 0:
        if type(event_list[i]).__name__ == 'dict' and event_list[i]['event'] == event_name:
            del event_list[i]
            break
        if type(event_list[i]).__name__ == 'str' and event_list[i] == event_name:
            del event_list[i]
            break
        i -= 1


def ChangeChildNum(ui, event_name, num1, num2):
    if num1.value() > num2.value():
        num2.setValue(num1.value())
    for i in range(len(ui.child_list)):
        if ui.child_list[i]['event'] == event_name:
            ui.child_list[i]['should_run_time'] = num1.value()
            ui.child_list[i]['max_run_time'] = num2.value()
