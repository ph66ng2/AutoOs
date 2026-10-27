-- Policy metadata only: the PIN and its hash remain in the OS keyring.
-- Existing identities fail closed on a new computer. An administrator can
-- provision a local PIN, or use the existing PostgreSQL-credential recovery.
ALTER TABLE security_profiles
    ADD COLUMN IF NOT EXISTS pin_required BOOLEAN NOT NULL DEFAULT true;

-- Keep first installation usable: the seed administrator has no prior security
-- history. Once a PIN is configured, auth.rs marks this identity as required.
UPDATE security_profiles
   SET pin_required = false
 WHERE role = 'ADMIN' AND is_default = true
   AND NOT EXISTS (SELECT 1 FROM security_audit_log)
   AND (SELECT count(*) FROM security_profiles) = 1;
