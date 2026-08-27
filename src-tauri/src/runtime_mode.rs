pub const fn should_initialize_legacy_database() -> bool {
    !cfg!(feature = "saas")
}

#[cfg(test)]
mod tests {
    use super::should_initialize_legacy_database;

    #[test]
    fn build_mode_controls_legacy_database_boot() {
        assert_eq!(should_initialize_legacy_database(), !cfg!(feature = "saas"));
    }
}
