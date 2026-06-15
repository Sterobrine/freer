from PySide2.QtWidgets import QApplication, QMainWindow, QFileDialog, QHBoxLayout, QVBoxLayout, QLabel, QSpinBox, \
    QPushButton, QWidget
from PySide2.QtGui import QPalette, Qt
from View.AddEventUI import Ui_MainWindow
import Tools
import Control
import Models
import paths
from View import event_form_common as efc


class LoadGui(QMainWindow, Ui_MainWindow):

    def __init__(self):
        super(LoadGui, self).__init__()
        self.setupUi(self)


def LoadData(ui):
    efc.LoadData(ui)


def GetEventNameList(event_type):
    return efc.GetEventNameList(gui, event_type)


def InitData(ui):
    # ui = gui
    ui.comboBox_event_type.addItems(['微事件', '宏事件', '异常-微事件', '异常-宏事件'])
    ui.comboBox_child_type.addItems(['微事件', '宏事件', '异常-微事件', '异常-宏事件'])
    ui.comboBox_exception_type.addItems(['微事件', '宏事件', '异常-微事件', '异常-宏事件'])
    ui.comboBox_action.addItems(GetEventNameList(2))
    ui.text_window_name.setText('雷电模拟器|TheRender')
    ui.text_accuracy.setValue(0.85)
    ui.text_max_suc_run_time.setValue(5)
    ui.text_gap1.setValue(0.4)
    ui.text_gap2.setValue(0.6)
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


def GetComboboxTypeCode(box):
    return efc.GetComboboxTypeCode(box)


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
    else:
        box.clear()
        box.addItems(GetEventNameList(mode))


def SetStartImagePath():
    efc.SetStartImagePath(gui)


def SetFinishImagePath():
    efc.SetFinishImagePath(gui)


def LimitGapInput():
    efc.LimitGapInput(gui)


def ResetData():
    ui = gui
    ui.text_event_name.setText('')
    ui.text_start_path.setText('')
    ui.text_finish_path.setText('')
    ui.text_default_position.setText('')
    ui.comboBox_event_type.clear()
    ui.comboBox_action.clear()
    ui.comboBox_select_child.clear()
    ui.comboBox_select_exception.clear()
    LoadData(ui)
    InitData(ui)
    SwitchEventType(box=ui.comboBox_select_child, mode=GetComboboxTypeCode(ui.comboBox_child_type))
    SwitchEventType(box=ui.comboBox_select_exception, mode=GetComboboxTypeCode(ui.comboBox_exception_type))


def DelRow(row, event_name, event_type):
    efc.DelRow(gui, row, event_name, event_type)


def deleteItemsOfLayout(layout):
    efc.deleteItemsOfLayout(layout)


def ChangeChildNum(event_name, num1, num2):
    efc.ChangeChildNum(gui, event_name, num1, num2)


def GenerateRow(event_name, event_type):
    ui = gui
    label = QLabel(event_name)
    label.setMinimumWidth(120)
    label.setMaximumWidth(120)
    if event_type == 0:
        num = QSpinBox()
        num.setMinimumWidth(40)
        num.setMaximumWidth(40)
        num.setValue(1)
        num.setMinimum(0)
        num.setMaximum(99999)
        num1 = QSpinBox()
        num1.setMinimumWidth(40)
        num1.setMaximumWidth(40)
        num1.setValue(1)
        num1.setMinimum(1)
        num1.setMaximum(99999)
        num.valueChanged.connect(lambda: ChangeChildNum(event_name=event_name, num1=num, num2=num1))
        num1.valueChanged.connect(lambda: ChangeChildNum(event_name=event_name, num1=num, num2=num1))
        ui.child_list.append({'event': event_name, 'should_run_time': 1, 'has_run_time': 0, 'max_run_time': 1})
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


def AddRow(event_name, event_type):
    ui = gui
    if event_type == 0:
        vbox = ui.child_v_box
        event_list = ui.child_list
        widget = ui.child_widget
    else:
        vbox = ui.exception_v_box
        event_list = ui.exception_list
        widget = ui.exception_widget
    row = GenerateRow(event_name, event_type)
    vbox.addLayout(row)
    widget.resize(270, 40 * (len(event_list) + 1))


def AddEvent():
    event = {}
    ui = gui
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
    count = Tools.FileTool.ReadJSON(str(paths.COUNT_JSON))
    event['id'] = count['event']
    obj.SetByDict(event)
    Control.DataManager.AddObj(obj, 0)
    count['event'] += 1
    Tools.FileTool.WriteJSON(str(paths.COUNT_JSON), count)
    ResetData()
    print(obj.__dict__)


def InitSlot(ui):
    # ui = gui
    ui.comboBox_event_type.currentIndexChanged.connect(lambda: SwitchEventType(box=ui.comboBox_event_type, mode=-1))
    ui.comboBox_child_type.currentTextChanged.connect(lambda: SwitchEventType(box=ui.comboBox_select_child, mode=GetComboboxTypeCode(ui.comboBox_child_type)))
    ui.comboBox_exception_type.currentTextChanged.connect(lambda: SwitchEventType(box=ui.comboBox_select_exception, mode=GetComboboxTypeCode(ui.comboBox_exception_type)))
    ui.btn_select_start.clicked.connect(SetStartImagePath)
    ui.btn_select_finish.clicked.connect(SetFinishImagePath)
    ui.text_gap1.valueChanged.connect(LimitGapInput)
    ui.text_gap2.valueChanged.connect(LimitGapInput)
    ui.btn_reset.clicked.connect(ResetData)
    ui.btn_add_child.clicked.connect(lambda: AddRow(event_name=ui.comboBox_select_child.currentText(), event_type=0))
    ui.btn_add_exception.clicked.connect(
        lambda: AddRow(event_name=ui.comboBox_select_exception.currentText(), event_type=1))
    ui.btn_add_event.clicked.connect(AddEvent)


def Init(ui):
    LoadData(ui)
    InitData(ui)
    InitSlot(ui)
    SwitchEventType(box=ui.comboBox_event_type, mode=-1)
    SwitchEventType(box=ui.comboBox_select_child, mode=GetComboboxTypeCode(ui.comboBox_child_type))
    SwitchEventType(box=ui.comboBox_select_exception, mode=GetComboboxTypeCode(ui.comboBox_exception_type))


app = QApplication([])
gui = LoadGui()
Init(gui)
gui.show()
app.exec_()
