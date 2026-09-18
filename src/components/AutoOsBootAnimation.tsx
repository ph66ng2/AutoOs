/**
 * Rótulos de status do boot — alinhados às fases reais e à HUD do stamp.
 * Animação visual: src/components/stamp (vendored de https://github.com/ph66ng2/stamp).
 */
export function bootStatusLabel(progress: number): string {
  if (progress >= 100) return "Pronto";
  if (progress >= 86) return "Aplicando etiqueta";
  if (progress >= 62) return "Sincronizando equipamentos";
  if (progress >= 28) return "Verificando infraestrutura";
  if (progress >= 14) return "Preparando etiquetas";
  return "Iniciando o AutoOS";
}

/** @deprecated Mantido só para imports legados; a animação vive em BootSplash/StampDemo. */
export function AutoOsBootAnimation(_props: { progress: number }) {
  return null;
}
