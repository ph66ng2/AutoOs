import { describe, it, expect } from 'vitest';
import { profileHasPermission, permissionDescription } from '../useSensitiveAccess';
import { SENSITIVE_PERMISSIONS, SENSITIVE_PERMISSION_LABELS, type SensitiveAccessStatus } from '@/types';

function statusWith(permissions: string[]) {
  return { permissions } as unknown as SensitiveAccessStatus;
}

describe('profileHasPermission', () => {
  const { PREPARE_QUOTES, CONFIG_SMTP, DELETE_RECORDS } = SENSITIVE_PERMISSIONS;

  it('libera quando nada é exigido', () => {
    expect(profileHasPermission(null)).toBe(true);
    expect(profileHasPermission(statusWith([]), undefined, [])).toBe(true);
  });

  it('bloqueia sem status quando algo é exigido', () => {
    expect(profileHasPermission(null, PREPARE_QUOTES)).toBe(false);
    expect(profileHasPermission(null, undefined, [PREPARE_QUOTES])).toBe(false);
  });

  it('permissão única continua funcionando', () => {
    expect(profileHasPermission(statusWith([PREPARE_QUOTES]), PREPARE_QUOTES)).toBe(true);
    expect(profileHasPermission(statusWith([CONFIG_SMTP]), PREPARE_QUOTES)).toBe(false);
  });

  it('anyPermission libera com qualquer uma da lista', () => {
    expect(profileHasPermission(statusWith([CONFIG_SMTP]), undefined, [PREPARE_QUOTES, CONFIG_SMTP])).toBe(true);
    expect(profileHasPermission(statusWith([DELETE_RECORDS]), undefined, [PREPARE_QUOTES, CONFIG_SMTP])).toBe(false);
  });

  it('única OU lista', () => {
    expect(profileHasPermission(statusWith([CONFIG_SMTP]), PREPARE_QUOTES, [CONFIG_SMTP])).toBe(true);
    expect(profileHasPermission(statusWith([PREPARE_QUOTES]), PREPARE_QUOTES, [CONFIG_SMTP])).toBe(true);
    expect(profileHasPermission(statusWith([DELETE_RECORDS]), PREPARE_QUOTES, [CONFIG_SMTP])).toBe(false);
  });
});

describe('permissionDescription', () => {
  const { PREPARE_QUOTES, CONFIG_SMTP } = SENSITIVE_PERMISSIONS;

  it('usa texto padrão sem permissões', () => {
    expect(permissionDescription()).toBe('executar esta ação');
  });

  it('junta rótulos com " ou "', () => {
    expect(permissionDescription(undefined, [PREPARE_QUOTES, CONFIG_SMTP])).toBe(
      `${SENSITIVE_PERMISSION_LABELS[PREPARE_QUOTES]} ou ${SENSITIVE_PERMISSION_LABELS[CONFIG_SMTP]}`,
    );
  });
});
