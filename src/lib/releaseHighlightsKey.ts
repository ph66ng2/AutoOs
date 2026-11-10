import pkg from "../../package.json" with { type: "json" };

// Compatibilidade com os navegadores e testes que já semeiam esta chave.
export const RELEASE_HIGHLIGHTS_VERSION = pkg.version;
export const LEGACY_RELEASE_HIGHLIGHTS_STORAGE_KEY =
  "autoos:release-highlights:0.6.2:portal-orcamento-conexao";

export function releaseHighlightsStorageKey(version: string): string {
  return version === "0.6.2"
    ? LEGACY_RELEASE_HIGHLIGHTS_STORAGE_KEY
    : `autoos:release-highlights:${version}:seen`;
}

export const RELEASE_HIGHLIGHTS_STORAGE_KEY = releaseHighlightsStorageKey(pkg.version);
