fn main() {
    // Never embed a database URL or secret in the desktop binary. Internal
    // development may provide DATABASE_URL at runtime, outside the bundle.
    tauri_build::build()
}
