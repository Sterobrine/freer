from PySide2.QtWidgets import QApplication, QMainWindow
from PySide2.QtUiTools import QUiLoader


class LoadGui(object):

    def __init__(self):
        self.ui = QUiLoader().load('../添加事件.ui')

        
app = QApplication([])
gui = LoadGui()
gui.ui.show()
app.exec_()