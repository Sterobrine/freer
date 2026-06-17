use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::{App, Manager};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct SidecarState {
    child: Option<Child>,
}

#[tauri::command]
fn sidecar_status(state: tauri::State<'_, Mutex<SidecarState>>) -> bool {
    let mut guard = state.lock().expect("sidecar lock");
    guard
        .child
        .as_mut()
        .is_some_and(|c| c.try_wait().ok().flatten().is_none())
}

fn engine_file_name() -> &'static str {
    if cfg!(windows) {
        "freer-engine.exe"
    } else {
        "freer-engine"
    }
}

fn app_work_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

fn sibling_engine_path() -> Option<PathBuf> {
    let dir = app_work_dir()?;
    let engine = dir.join(engine_file_name());
    engine.is_file().then_some(engine)
}

fn engine_log_file() -> Option<PathBuf> {
    let dir = app_work_dir()?;
    let logs = dir.join("logs");
    let _ = create_dir_all(&logs);
    Some(logs.join("engine.log"))
}

fn append_engine_log(message: &str) {
    if let Some(path) = engine_log_file() {
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{message}");
        }
    }
}

fn hide_console(cmd: &mut Command) {
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
}

fn spawn_sidecar(_app: &App) -> Result<Child, String> {
    let work_dir = app_work_dir();

    if let Some(engine) = sibling_engine_path() {
        append_engine_log(&format!("启动引擎: {}", engine.display()));
        let mut cmd = Command::new(engine);
        hide_console(&mut cmd);
        cmd.stdin(Stdio::null()).stdout(Stdio::null());
        if let Some(log_path) = engine_log_file() {
            let stderr = OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_path)
                .map_err(|e| format!("打开引擎日志失败: {e}"))?;
            cmd.stderr(stderr);
        } else {
            cmd.stderr(Stdio::null());
        }
        if let Some(dir) = &work_dir {
            cmd.current_dir(dir);
        }
        return cmd
            .spawn()
            .map_err(|e| format!("启动 freer-engine 失败: {e}"));
    }

    append_engine_log("未找到 freer-engine，回退到系统 Python");
    let mut cmd = Command::new(if cfg!(windows) { "python" } else { "python3" });
    hide_console(&mut cmd);
    cmd.args(["-m", "freer_api"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if let Some(dir) = work_dir {
        cmd.current_dir(dir);
    }
    cmd.spawn()
        .map_err(|e| format!("启动 freer_api 失败: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(SidecarState { child: None }))
        .setup(|app| {
            let state = app.handle().state::<Mutex<SidecarState>>();
            let mut guard = state.lock().expect("sidecar lock");
            match spawn_sidecar(app) {
                Ok(child) => guard.child = Some(child),
                Err(err) => eprintln!("{err}"),
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.app_handle().state::<Mutex<SidecarState>>();
                let mut guard = state.lock().expect("sidecar lock");
                if let Some(mut child) = guard.child.take() {
                    let _ = child.kill();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![sidecar_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
