fn main() {
    // Embed DATABASE_URL from .env into the binary at compile time.
    // This ensures the bundled app always has the Supabase connection string
    // regardless of whether the .env resource file is found at runtime.
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".env");
    if let Ok(contents) = std::fs::read_to_string(&env_path) {
        for line in contents.lines() {
            let trimmed = line.trim();
            if let Some((key, value)) = trimmed.split_once('=') {
                if key == "DATABASE_URL" && !value.is_empty() {
                    println!("cargo:rustc-env=COMPILE_TIME_DATABASE_URL={}", value);
                    break;
                }
            }
        }
    }
    tauri_build::build()
}
