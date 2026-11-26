fn main() {
    println!("cargo:rerun-if-env-changed=AUTOOS_DATABASE_URL");
    println!("cargo:rerun-if-env-changed=AUTOOS_SLACK_BOT_TOKEN");
    println!("cargo:rerun-if-changed=.env");

    let release_url = std::env::var("AUTOOS_DATABASE_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(read_local_database_url);

    if let Some(database_url) = release_url {
        println!("cargo:rustc-env=COMPILE_TIME_DATABASE_URL={database_url}");
    }
    // Token do bot de suporte (só a BMITAG): vem do secret do release. Cada computador ainda
    // pode guardar outro no cofre, que tem prioridade. Sem o secret, o suporte é configurado à mão.
    if let Some(token) = std::env::var("AUTOOS_SLACK_BOT_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| value.starts_with("xoxb-"))
    {
        println!("cargo:rustc-env=COMPILE_TIME_SLACK_BOT_TOKEN={token}");
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
