mod display_edid;

use std::io::Write;

#[tauri::command]
fn save_edid_file(path: String, data: Vec<u8>) -> Result<String, String> {
  let mut file = std::fs::File::create(path).map_err(|e| e.to_string())?;
  file.write_all(&data).map_err(|e| e.to_string())?;
  Ok("EDID saved".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      // Registered in release builds too, not just dev. Reading EDIDs off
      // attached monitors is per-OS code that can only be exercised from an
      // installed build on real hardware, and when it misbehaves its log lines
      // are the whole diagnosis. The plugin's default targets are stdout and
      // the OS log directory — on Windows that is
      // %LOCALAPPDATA%\com.pikajian.edid-editor-vue\logs.
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(if cfg!(debug_assertions) {
            log::LevelFilter::Debug
          } else {
            log::LevelFilter::Info
          })
          .build(),
      )?;
      Ok(())
    })
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![
      save_edid_file,
      display_edid::read_display_edids
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
