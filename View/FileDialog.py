from PySide2.QtWidgets import QApplication, QMainWindow, QFileDialog, QPushButton
import os


# class FileSelectDialog(QFileDialog):
#     def __init__(self, master, title=None, start_path=None, file_type='位图 (*.bmp)'):
#         super().__init__(master)
#         if title is None:
#             self.title = '选择文件'
#         else:
#             self.title = title
#         if start_path is not None:
#             self.start_path = start_path
#         self.file_type = file_type
#
#     def GetFilePath(self):

# app = QApplication([])
# root_path = os.path.abspath(os.path.join(os.getcwd(), '../')) + 'img'
# file_path = QFileDialog.getOpenFileNames(QMainWindow(), "选择文件", root_path, '位图 (*.bmp)')
# file_path = '|'.join(file_path[0])
# print(file_path)
# app.exec_()
