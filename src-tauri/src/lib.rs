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
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![save_edid_file])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
