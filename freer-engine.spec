# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules

hiddenimports = ['ssl', 'uvicorn', 'fastapi', 'cv2', 'freer_api', 'freer_api.app', 'config', 'paths', 'freer_log', 'serialization', 'Tools', 'Control', 'Models']
hiddenimports += collect_submodules('freer_api')
hiddenimports += collect_submodules('recognition')


a = Analysis(
    ['C:\\Project\\cursor\\freer\\freer_api\\__main__.py'],
    pathex=['C:\\Project\\cursor\\freer'],
    binaries=[('C:\\envs\\miniConda\\envs\\freer\\Library\\bin\\libssl-3-x64.dll', '.'), ('C:\\envs\\miniConda\\envs\\freer\\Library\\bin\\libcrypto-3-x64.dll', '.')],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='freer-engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
