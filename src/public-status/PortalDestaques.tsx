import { useState } from "react";
import { money, type DetalheAtendimento } from "./portal-api";
import { EnderecoRetirada } from "./EnderecoRetirada";
import { gerarPdf, modeloComprovanteEntrega, modeloOrcamento, modeloOrdemServico, valoresDeEntrega, valoresDiferem, type ModeloDocumento } from "./portal-pdf";

/** Status em que o orçamento já foi aprovado (o valor pode ter sido ajustado pela equipe depois). */
const POS_APROVACAO = new Set(["APROVADO", "EM_MANUTENCAO", "AGUARDANDO_PECA", "PRONTO", "ENTREGUE"]);

export function valorAtualizado(detalhe: DetalheAtendimento): { atual: number; aprovado: number } | null {
  const atual = detalhe.valores?.atual ?? null;
  const aprovado = detalhe.orcamento?.valorTotal ?? null;
  if (atual == null || aprovado == null || !POS_APROVACAO.has(detalhe.status) || !valoresDiferem(atual, aprovado)) return null;
  return { atual, aprovado };
}

export function NotaValorAtualizado({ detalhe }: { detalhe: DetalheAtendimento }) {
  const v = valorAtualizado(detalhe);
  if (!v) return null;
  return (
    <p className="notice-box portal-valor-atualizado" role="status">
      Valor atualizado pela equipe: <strong>{money(v.atual)}</strong> (orçamento aprovado: {money(v.aprovado)})
    </p>
  );
}

/** Linha curta sob o card do orçamento: evita parecer contradição com o valor em destaque. */
export function LinhaValorAtualizado({ detalhe }: { detalhe: DetalheAtendimento }) {
  const v = valorAtualizado(detalhe);
  if (!v) return null;
  return <p className="portal-valor-linha">Valor atualizado pela equipe: <strong>{money(v.atual)}</strong></p>;
}

export { mapaEmbedUrl, mapaLinkUrl } from "./EnderecoRetirada";

/** Pronto para retirada: endereço, mapa e valor. */
export function DestaqueProntoRetirada({ detalhe }: { detalhe: DetalheAtendimento }) {
  const contato = detalhe.contatoEmpresa;
  const endereco = contato?.endereco?.trim() || null;
  const valor = detalhe.valores?.atual ?? null;
  const atualizado = valorAtualizado(detalhe);
  return (
    <section className="portal-destaque is-pronto" aria-labelledby="portal-pronto-titulo">
      <span className="portal-destaque-pill">Pronto para retirada</span>
      <h2 id="portal-pronto-titulo">{endereco ? "Retire no endereço abaixo" : "Seu equipamento está pronto"}</h2>
      {valor != null && (
        <p className="portal-destaque-valor"><span>Valor do atendimento</span><strong>{money(valor)}</strong></p>
      )}
      {atualizado && <p className="portal-valor-nota">Valor atualizado pela equipe (orçamento aprovado: {money(atualizado.aprovado)})</p>}
      {endereco && contato && (
        <EnderecoRetirada nome={contato.nome} endereco={endereco} horario={contato.horario} mapsUrl={contato.mapsUrl} />
      )}
    </section>
  );
}

/** Atendimento concluído: valor final em evidência e os documentos. */
export function DestaqueConcluido({ detalhe }: { detalhe: DetalheAtendimento }) {
  const { final, orcado, ajustado } = valoresDeEntrega(detalhe);
  return (
    <section className="portal-destaque is-concluido" aria-labelledby="portal-concluido-titulo">
      <h2 id="portal-concluido-titulo">Resumo da entrega</h2>
      {final != null && (
        <p className="portal-destaque-valor"><span>Valor final</span><strong>{money(final)}</strong></p>
      )}
      {ajustado && orcado != null && (
        <p className="answer-hint portal-valor-ajustado">Valor orçado: {money(orcado)}. Valor final ajustado na entrega.</p>
      )}
      <DocumentosCard detalhe={detalhe} destaque />
    </section>
  );
}

export function DocumentosCard({ detalhe, destaque = false }: { detalhe: DetalheAtendimento; destaque?: boolean }) {
  const [gerando, setGerando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const docs: Array<{ chave: string; rotulo: string; modelo: ModeloDocumento }> = [
    { chave: "os", rotulo: "Ordem de serviço (PDF)", modelo: modeloOrdemServico(detalhe) },
  ];
  const orcamento = modeloOrcamento(detalhe);
  if (orcamento) docs.push({ chave: "orcamento", rotulo: "Orçamento (PDF)", modelo: orcamento });
  const comprovante = modeloComprovanteEntrega(detalhe);
  if (comprovante) docs.push({ chave: "entrega", rotulo: "Comprovante de entrega (PDF)", modelo: comprovante });
  if (docs.length === 0) return null;

  const baixar = async (chave: string, modelo: ModeloDocumento) => {
    setGerando(chave);
    setErro(null);
    try {
      await gerarPdf(modelo);
    } catch {
      setErro("Não foi possível gerar o documento agora. Tente novamente.");
    } finally {
      setGerando(null);
    }
  };

  return (
    <section className={`portal-documentos${destaque ? " is-destaque" : ""}`} aria-labelledby={`portal-docs-${destaque ? "d" : "n"}`}>
      <h3 id={`portal-docs-${destaque ? "d" : "n"}`}>Documentos</h3>
      <ul>
        {docs.map((doc) => (
          <li key={doc.chave}>
            <button type="button" className={destaque ? "primary-button" : "secondary-button"} disabled={gerando !== null} onClick={() => void baixar(doc.chave, doc.modelo)}>
              {gerando === doc.chave ? "Gerando…" : doc.rotulo}
            </button>
          </li>
        ))}
      </ul>
      {erro && <p className="portal-error" role="alert">{erro}</p>}
    </section>
  );
}
