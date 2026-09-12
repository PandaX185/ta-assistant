const COMMANDS: &[&str] = &["open", "name"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}