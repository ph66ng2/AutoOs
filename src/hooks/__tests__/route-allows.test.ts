import { describe, it, expect } from 'vitest';
import { routeAllows } from '../useSensitiveAccess';
import { SENSITIVE_PERMISSIONS } from '@/types';

describe('routeAllows', () => {
  it('libera quando a rota não exige permissão', () => {
    expect(routeAllows([], undefined)).toBe(true);
    expect(routeAllows([SENSITIVE_PERMISSIONS.CONFIG_SMTP])).toBe(true);
  });

  it('com permissão única, libera só se o perfil a tem', () => {
    expect(routeAllows([SENSITIVE_PERMISSIONS.VIEW_EXPENSES], SENSITIVE_PERMISSIONS.VIEW_EXPENSES)).toBe(true);
    expect(routeAllows([SENSITIVE_PERMISSIONS.CONFIG_SMTP], SENSITIVE_PERMISSIONS.VIEW_EXPENSES)).toBe(false);
  });

  it('com lista, libera se o perfil tem pelo menos uma das permissões', () => {
    const required = [
      SENSITIVE_PERMISSIONS.MANAGE_PROFILES,
      SENSITIVE_PERMISSIONS.CONFIG_SMTP,
      SENSITIVE_PERMISSIONS.CONFIG_WHATSAPP,
      SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS,
    ];
    expect(routeAllows([SENSITIVE_PERMISSIONS.CONFIG_WHATSAPP], required)).toBe(true);
    expect(routeAllows([SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS, SENSITIVE_PERMISSIONS.DELETE_RECORDS], required)).toBe(true);
  });

  it('com lista, bloqueia se o perfil não tem nenhuma das permissões', () => {
    const required = [
      SENSITIVE_PERMISSIONS.MANAGE_PROFILES,
      SENSITIVE_PERMISSIONS.CONFIG_SMTP,
    ];
    expect(routeAllows([SENSITIVE_PERMISSIONS.DELETE_RECORDS], required)).toBe(false);
    expect(routeAllows([], required)).toBe(false);
  });
});
