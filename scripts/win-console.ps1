# Windows 控制台 UTF-8（供 start.ps1 / start-desktop.ps1 引用）
if ($env:OS -match 'Windows') {
  try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::InputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
    chcp 65001 | Out-Null
  } catch {
    # ignore
  }
}
