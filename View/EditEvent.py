from PySide2.QtWidgets import QApplication, QMainWindow, QFileDialog, QHBoxLayout, QVBoxLayout, QLabel, QSpinBox, \
    QPushButton, QWidget
from PySide2.QtGui import QPalette, Qt
from View.EditEventUI import Ui_MainWindow
import Tools
import Control
import Models
import os


class LoadGui(QMainWindow, Ui_MainWindow):

    def __init__(self):
        super(LoadGui, self).__init__()
        self.setupUi(self)


def LoadData(ui):
    ui.event_data = Tools.FileTool.ReadJSON('../data/event.json')
    ui.action_data = Tools.FileTool.ReadJSON('../data/action.json')


def GetEventNameList(event_type):
    ui = gui
    list = []
    if event_type == 2:
        event_list = ui.action_data
    else:
        event_list = ui.event_data
    for event in event_list:
        if event_type == 2:
            list.append(event['name'])
        elif event_type == 3 and event['is_exception'] and event['event_type'] == 0:
            list.append(event['name'])
        elif event_type == 4 and event['is_exception'] and event['event_type'] == 1:
            list.append(event['name'])
        elif event_type == 0 and event['is_exception'] is not True and event['event_type'] == 0:
            list.append(event['name'])
        elif event_type == 1 and event['is_exception'] is not True and event['event_type'] == 1:
            list.append(event['name'])
    return list


def ResetChildAndException():
    ui = gui
    ui.child_widget = QWidget()
    ui.scrollArea_child.setWidget(ui.child_widget)
    ui.exception_widget = QWidget()
    ui.scrollArea_exception.setWidget(ui.exception_widget)
    ui.child_v_box = QVBoxLayout()
    ui.child_v_box.setAlignment(Qt.AlignTop)
    ui.child_widget.setLayout(ui.child_v_box)
    ui.child_list = []
    ui.exception_v_box = QVBoxLayout()
    ui.exception_v_box.setAlignment(Qt.AlignTop)
    ui.exception_widget.setLayout(ui.exception_v_box)
    ui.exception_list = []
    ui.child_menu = QHBoxLayout()
    ui.child_menu.setAlignment(Qt.AlignLeft)
    ui.child_menu_column1 = QLabel('事件名')
    ui.child_menu_column1.setMinimumWidth(120)
    ui.child_menu_column1.setMaximumWidth(120)
    ui.child_menu_column2 = QLabel('至少')
    ui.child_menu_column2.setMinimumWidth(40)
    ui.child_menu_column2.setMaximumWidth(40)
    ui.child_menu_column4 = QLabel('最多')
    ui.child_menu_column4.setMinimumWidth(40)
    ui.child_menu_column4.setMaximumWidth(40)
    ui.child_menu_column3 = QLabel('操作')
    ui.child_menu_column3.setMinimumWidth(40)
    ui.child_menu.addWidget(ui.child_menu_column1)
    ui.child_menu.addWidget(ui.child_menu_column2)
    ui.child_menu.addWidget(ui.child_menu_column4)
    ui.child_menu.addWidget(ui.child_menu_column3)
    ui.child_v_box.addLayout(ui.child_menu)
    ui.exception_menu = QHBoxLayout()
    ui.exception_menu.setAlignment(Qt.AlignLeft)
    ui.exception_menu_column1 = QLabel('异常名')
    ui.exception_menu_column1.setMinimumWidth(120)
    ui.exception_menu_column1.setMaximumWidth(120)
    ui.exception_menu_column2 = QLabel('操作')
    ui.exception_menu_column2.setMinimumWidth(40)
    ui.exception_menu.addWidget(ui.exception_menu_column1)
    ui.exception_menu.addWidget(ui.exception_menu_column2)
    ui.exception_v_box.addLayout(ui.exception_menu)
    ui.child_widget.resize(270, 40)
    ui.exception_widget.resize(270, 40)


def InitData(ui):
    # ui = gui
    ui.comboBox_event_type.addItems(['微事件', '宏事件', '异常-微事件', '异常-宏事件'])
    ui.comboBox_child_type.addItems(['微事件', '宏事件', '异常-微事件', '异常-宏事件'])
    ui.comboBox_exception_type.addItems(['微事件', '宏事件', '异常-微事件', '异常-宏事件'])
    ui.comboBox_action.addItems(GetEventNameList(2))
    ResetChildAndException()


def GetComboboxTypeCode(box):
    if box.currentText() == '宏事件':
        return 0
    elif box.currentText() == '微事件':
        return 1
    elif box.currentText() == '异常-宏事件':
        return 3
    elif box.currentText() == '异常-微事件':
        return 4


def SwitchEventType(box, mode=-1):
    ui = gui
    if mode == -1:
        if box.currentText() == '宏事件' or box.currentText() == '异常-宏事件':
            ui.groupBox_micro_event_attri.setEnabled(False)
            ui.groupBox_grand_event_attri.setEnabled(True)
            ui.scrollArea_child.setBackgroundRole(QPalette.Light)
            ui.scrollArea_exception.setBackgroundRole(QPalette.Light)
        else:
            ui.groupBox_micro_event_attri.setEnabled(True)
            ui.groupBox_grand_event_attri.setEnabled(False)
            ui.scrollArea_child.setBackgroundRole(QPalette.Button)
            ui.scrollArea_exception.setBackgroundRole(QPalette.Button)
        ui.comboBox_event_name.clear()
        ui.comboBox_event_name.addItems(GetEventNameList(GetComboboxTypeCode(ui.comboBox_event_type)))
    else:
        box.clear()
        box.addItems(GetEventNameList(mode))


def SwitchEventName():
    ResetBaseInfo()
    ResetChildAndException()
    ShowEvent()


def ShowEvent():
    ui = gui
    event_name = ui.comboBox_event_name.currentText()
    for event in ui.event_data:
        if event['name'] == event_name:
            ui.current_event = event
    ui.current_event_name = event_name
    ui.text_event_name.setText(ui.current_event['name'])
    ui.text_window_name.setText(ui.current_event['window_name'])
    ui.text_accuracy.setValue(ui.current_event['accuracy'])
    ui.text_max_suc_run_time.setValue(ui.current_event['max_suc_run_time'])
    if ui.current_event['symbol_finish'] is not None:
        ui.text_finish_path.setText(ui.current_event['symbol_finish'])
    if ui.current_event['event_type'] == 1:
        ui.text_gap1.setValue(ui.current_event['gap'][0])
        ui.text_gap2.setValue(ui.current_event['gap'][1])
        ui.comboBox_action.setCurrentText(ui.current_event['action'])
        if ui.current_event['symbol_start'] is not None:
            ui.text_start_path.setText(ui.current_event['symbol_start'])
        if ui.current_event['default_position'] is not None:
            default_position = []
            for line in ui.current_event['default_position']:
                default_position.append(','.join([str(line[0]), str(line[1])]))
            ui.text_default_position.setText('|'.join(default_position))
    else:
        ui.text_max_rotate_time.setValue(ui.current_event['max_rotate_time'])
        for event in ui.current_event['event_list']:
            AddRow(0, event['event'], 0, event['should_run_time'], event['max_run_time'])
        for event in ui.current_event['exception_list']:
            AddRow(0, event, 1, 0, 0)


def GetImagePath():
    root_path = os.path.abspath(os.path.join(os.getcwd(), '../')) + '\\img'
    file_path = QFileDialog.getOpenFileNames(QMainWindow(), "选择文件", root_path, '位图 (*.bmp)')
    file_path = '|'.join(file_path[0])
    return file_path


def SetStartImagePath():
    ui = gui
    file_path = GetImagePath()
    ui.text_start_path.setText(file_path)


def SetFinishImagePath():
    ui = gui
    file_path = GetImagePath()
    ui.text_finish_path.setText(file_path)


def LimitGapInput():
    ui = gui
    if ui.text_gap1.value() >= ui.text_gap2.value():
        ui.text_gap2.setValue(ui.text_gap1.value() + 0.2)


def ResetBaseInfo():
    ui = gui
    ui.text_event_name.setText('')
    ui.text_window_name.setText('')
    ui.text_start_path.setText('')
    ui.text_finish_path.setText('')
    ui.text_default_position.setText('')
    ui.text_max_rotate_time.setValue(1)


def ResetSelectCombobox():
    ui = gui
    LoadData(ui)
    SwitchEventType(box=ui.comboBox_event_type, mode=-1)
    SwitchEventType(box=ui.comboBox_select_child, mode=GetComboboxTypeCode(ui.comboBox_child_type))
    SwitchEventType(box=ui.comboBox_select_exception, mode=GetComboboxTypeCode(ui.comboBox_exception_type))


def ResetData():
    ui = gui


def DelRow(row, event_name, event_type):
    ui = gui
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


def deleteItemsOfLayout(layout):
    if layout is not None:
        while layout.count():
            item = layout.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.setParent(None)
            else:
                deleteItemsOfLayout(item.layout())


def ChangeChildNum(event_name, num1, num2):
    ui = gui
    if num1.value() > num2.value():
        num2.setValue(num1.value())
    for i in range(len(ui.child_list)):
        if ui.child_list[i]['event'] == event_name:
            ui.child_list[i]['should_run_time'] = num1.value()
            ui.child_list[i]['max_run_time'] = num2.value()


def GenerateRow(event_name, event_type, num1_value, num2_value):
    ui = gui
    label = QLabel(event_name)
    label.setMinimumWidth(120)
    label.setMaximumWidth(120)
    if event_type == 0:
        num = QSpinBox()
        num.setMinimumWidth(40)
        num.setMaximumWidth(40)
        num.setValue(num1_value)
        num.setMinimum(0)
        num.setMaximum(99999)
        num1 = QSpinBox()
        num1.setMinimumWidth(40)
        num1.setMaximumWidth(40)
        num1.setValue(num2_value)
        num1.setMinimum(1)
        num1.setMaximum(99999)
        num.valueChanged.connect(lambda: ChangeChildNum(event_name=event_name, num1=num, num2=num1))
        num1.valueChanged.connect(lambda: ChangeChildNum(event_name=event_name, num1=num, num2=num1))
        ui.child_list.append({'event': event_name, 'should_run_time': num.value(), 'has_run_time': 0, 'max_run_time': num1.value()})
    else:
        ui.exception_list.append(event_name)
    del_btn = QPushButton('移除')
    del_btn.setMinimumWidth(40)
    del_btn.resize(40, 20)
    row = QHBoxLayout()
    row.setAlignment(Qt.AlignLeft)
    row.addWidget(label)
    if event_type == 0:
        row.addWidget(num)
        row.addWidget(num1)
    row.addWidget(del_btn)
    del_btn.clicked.connect(lambda: DelRow(row=row, event_name=event_name, event_type=event_type))
    return row


def AddRow(arg=None, event_name=None, event_type=None, num1=0, num2=1):
    ui = gui
    if event_type == 0:
        vbox = ui.child_v_box
        event_list = ui.child_list
        widget = ui.child_widget
    else:
        vbox = ui.exception_v_box
        event_list = ui.exception_list
        widget = ui.exception_widget
    row = GenerateRow(event_name, event_type, num1, num2)
    vbox.addLayout(row)
    widget.resize(270, 40 * (len(event_list) + 1))


def DelEvent(name):
    obj = Models.MicroEvent(name)
    ResetBaseInfo()
    ResetChildAndException()
    ResetSelectCombobox()
    return Control.DataManager.DelObj(obj, 0)


def UpdateEvent():
    event = {}
    ui = gui
    pre_name = ui.current_event['name']
    name = ui.text_event_name.text()
    finish_path = ui.text_finish_path.text()
    window_name = ui.text_window_name.text()
    if name == '' or window_name == '':
        return
    event['name'] = name
    event['window_name'] = window_name
    if finish_path == '':
        event['symbol_finish'] = None
    else:
        event['symbol_finish'] = finish_path
    event['accuracy'] = ui.text_accuracy.value()
    event['max_suc_run_time'] = ui.text_max_suc_run_time.value()
    event_type = ui.comboBox_event_type.currentText()
    if event_type == '宏事件' or event_type == '异常-宏事件':
        obj = Models.GrandEvent()
        event['event_type'] = 0
        event['max_rotate_time'] = ui.text_max_rotate_time.value()
        event['event_list'] = ui.child_list
        event['exception_list'] = ui.exception_list
    else:
        obj = Models.MicroEvent()
        event['gap'] = [ui.text_gap1.value(), ui.text_gap2.value()]
        event['action'] = ui.comboBox_action.currentText()
        start_path = ui.text_start_path.text()
        default_position = ui.text_default_position.text()
        if start_path == '' and default_position == '':
            return
        if start_path == '':
            event['symbol_start'] = None
        else:
            event['symbol_start'] = start_path
        if default_position == '':
            event['default_position'] = None
        else:
            default_position = default_position.split('|')
            for i in range(len(default_position)):
                default_position[i] = default_position[i].split(',')
                default_position[i][0] = int(default_position[i][0])
                default_position[i][1] = int(default_position[i][1])
            event['default_position'] = default_position
    if event_type == '宏事件' or event_type == '微事件':
        event['is_exception'] = False
    else:
        event['is_exception'] = True
    event['id'] = ui.current_event['id']
    if DelEvent(pre_name):
        obj.SetByDict(event)
        Control.DataManager.AddObj(obj, 0)
        ResetBaseInfo()
        ResetChildAndException()
        ResetSelectCombobox()
        ui.comboBox_event_name.setCurrentText(event['name'])
        print(obj.__dict__)


def InitSlot(ui):
    # ui = gui
    ui.comboBox_event_type.currentIndexChanged.connect(lambda: SwitchEventType(box=ui.comboBox_event_type, mode=-1))
    ui.comboBox_child_type.currentTextChanged.connect(lambda: SwitchEventType(box=ui.comboBox_select_child, mode=GetComboboxTypeCode(ui.comboBox_child_type)))
    ui.comboBox_exception_type.currentTextChanged.connect(lambda: SwitchEventType(box=ui.comboBox_select_exception, mode=GetComboboxTypeCode(ui.comboBox_exception_type)))
    ui.comboBox_event_name.currentTextChanged.connect(SwitchEventName)
    ui.btn_select_start.clicked.connect(SetStartImagePath)
    ui.btn_select_finish.clicked.connect(SetFinishImagePath)
    ui.text_gap1.valueChanged.connect(LimitGapInput)
    ui.text_gap2.valueChanged.connect(LimitGapInput)
    ui.btn_reset.clicked.connect(SwitchEventName)
    ui.btn_add_child.clicked.connect(lambda: AddRow(event_name=ui.comboBox_select_child.currentText(), event_type=0))
    ui.btn_add_exception.clicked.connect(
        lambda: AddRow(event_name=ui.comboBox_select_exception.currentText(), event_type=1))
    ui.btn_add_event.clicked.connect(UpdateEvent)
    ui.btn_del_event.clicked.connect(lambda: DelEvent(name=ui.current_event['name']))


def Init(ui):
    LoadData(ui)
    InitData(ui)
    InitSlot(ui)
    SwitchEventType(box=ui.comboBox_event_type, mode=-1)
    SwitchEventType(box=ui.comboBox_select_child, mode=GetComboboxTypeCode(ui.comboBox_child_type))
    SwitchEventType(box=ui.comboBox_select_exception, mode=GetComboboxTypeCode(ui.comboBox_exception_type))
    SwitchEventName()


app = QApplication([])
gui = LoadGui()
Init(gui)
gui.show()
app.exec_()
