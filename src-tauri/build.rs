fn main() {
    println!("cargo:rerun-if-env-changed=AUTOOS_DATABASE_URL");
    println!("cargo:rerun-if-changed=.env");

    let release_url = std::env::var("AUTOOS_DATABASE_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(read_local_database_url);

    if let Some(database_url) = release_url {
        println!("cargo:rustc-env=COMPILE_TIME_DATABASE_URL={database_url}");
    }
    tauri_build::build()
}

fn read_local_database_url() -> Option<String> {
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".env");
    let contents = std::fs::read_to_string(env_path).ok()?;
    contents.lines().find_map(|line| {
        let (key, value) = line.trim().split_once('=')?;
        (key == "DATABASE_URL" && !value.trim().is_empty()).then(|| value.trim().to_string())
    })
}
