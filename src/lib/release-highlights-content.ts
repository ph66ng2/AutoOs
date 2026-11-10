import { z } from "zod";

const contentSchema = z.object({
  version: z.string(),
  title: z.string(),
  description: z.string(),
  highlights: z.array(z.object({
    title: z.string(),
    icon: z.string().optional(),
    description: z.string().optional(),
    detail: z.string().optional(),
  })),
  badges: z.array(z.object({ icon: z.string(), label: z.string() })).default([]),
});

// O glob também permite builds de checkout sem o arquivo gerado.
const bundled = Object.values(import.meta.glob("../generated/release-highlights.json", {
  eager: true,
  import: "default",
}))[0];

export function getReleaseHighlightsContent(version: string, data: unknown = bundled) {
  const parsed = contentSchema.safeParse(data);
  if (parsed.success && parsed.data.version === version && parsed.data.highlights.length > 0) {
    return parsed.data;
  }
  // Nunca apresenta novidades de uma versão diferente da instalada.
  return {
    version,
    title: "AutoOS atualizado",
    description: `Você está usando o AutoOS ${version}. Tudo pronto para continuar seu trabalho.`,
    highlights: [],
    badges: [],
  };
}
