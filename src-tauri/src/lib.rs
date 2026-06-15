use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

struct SidecarState {
    child: Option<Child>,
}

#[tauri::command]
fn sidecar_status(state: tauri::State<'_, Mutex<SidecarState>>) -> bool {
    let guard = state.lock().expect("sidecar lock");
    guard.child.as_ref().is_some_and(|c| c.try_wait().ok().flatten().is_none())
}

fn spawn_sidecar() -> Result<Child, String> {
    let python = if cfg!(windows) { "python" } else { "python3" };
    Command::new(python)
        .args(["-m", "freer_api"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("启动 freer_api 失败: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(SidecarState { child: None }))
        .setup(|app| {
            let state = app.state::<Mutex<SidecarState>>();
            let mut guard = state.lock().expect("sidecar lock");
            match spawn_sidecar() {
                Ok(child) => guard.child = Some(child),
                Err(err) => eprintln!("{err}"),
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<Mutex<SidecarState>>();
                if let Ok(mut guard) = state.lock() {
                    if let Some(mut child) = guard.child.take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![sidecar_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
