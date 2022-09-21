from PySide2.QtWidgets import *
from PySide2.QtGui import *





app = QApplication([])
main = QMainWindow()
main.resize(640, 480)
vbox = QVBoxLayout()
vbox.setAlignment(Qt.AlignTop)
sa = QScrollArea(main)
sa.resize(200, 200)
sa.setMinimumSize(400, 400)
# frame = QFrame(main)
# frame.resize(200,200)
# frame.setBackgroundRole(QPalette.Light)
# gbox = QGroupBox(main)
# gbox.setLayout(vbox)
# frame.setLayout(vbox)
widget = QWidget()
widget.setLayout(vbox)
sa.setWidget(widget)

btn = QPushButton('添加', main)
btn.move(250, 90)


count = 0

event_name_list = []


def deleteItemsOfLayout(layout):
    global count
    if layout is not None:
        while layout.count():
            item = layout.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.setParent(None)
            else:
                deleteItemsOfLayout(item.layout())


def boxdelete(box):
    for i in range(vbox.count()):
        layout_item = vbox.itemAt(i)
        if layout_item.layout() == box:
            deleteItemsOfLayout(layout_item.layout())
            vbox.removeItem(layout_item)
            break



def AddLable():
    global count
    hbox = QHBoxLayout()
    hbox.setObjectName(str(count))
    label = QLabel(str(count))
    label.resize(100, 20)
    button = QPushButton('btn')
    button.resize(40, 20)
    button.clicked.connect(lambda: boxdelete(hbox))
    hbox.addWidget(label)
    hbox.addWidget(button)
    vbox.addLayout(hbox)
    count += 1
    widget.resize(400, count*40)
    print(hbox.count())


btn.clicked.connect(AddLable)

main.show()
app.exec_()