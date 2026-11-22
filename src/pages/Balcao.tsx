import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Box,
  Plus,
  RefreshCw,
  Search,
  Tag,
  UserSearch,
} from "lucide-react";
import { useBuscaRetirada } from "@/hooks/useBuscaRetirada";
import { useFilaBalcao } from "@/hooks/useFilaBalcao";
import {
  clienteDoItem,
  descricaoDoItem,
  podeEntregar,
  valorDoItem,
  type ItemRetirada,
} from "@/lib/retirada-balcao";
import { STATUS_ORCAMENTO_INSUMOS_LABEL } from "@/lib/orcamento-insumos";
import { VendaRetirada } from "@/pages/balcao/VendaRetirada";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateIsoInput } from "@/components/ui/date-iso-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ClienteSelector } from "@/components/equipamentos/ClienteSelector";
import { ContatoResponsavelSelector } from "@/components/equipamentos/ContatoResponsavelSelector";
import { DocumentosEquipamento } from "@/components/equipamentos/DocumentosEquipamento";
import { useCounterSession } from "@/components/CounterLayout";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { db, type ImpressoraWindows } from "@/lib/db";
import { PdfService, type PdfArtifact } from "@/lib/pdf-service";
import { publicarPdfOficial } from "@/lib/portal-documentos";
import { PdfPreviewDialog } from "@/components/equipamentos/PdfPreviewDialog";
import { CommunicationEmailDialog } from "@/components/equipamentos/CommunicationEmailDialog";
import { afterCounterRegistration } from "@/lib/counter-registration";
import { EmailService } from "@/lib/email-service";
import { equipamentoSchema } from "@/lib/validations";
import {
  MARCA_EQUIPAMENTO_OPTIONS,
  TIPO_OPTIONS,
} from "@/pages/equipamentos/equipamentos-page-constants";
import { categoriaProdutoLabel } from "@/pages/insumos/insumos-page-constants";
import { resolveRecipient, type ResolvedRecipient } from "@/lib/recipient-resolver";
import { mensagemEnvioFalhouComEmailSalvo, saveRecipientAddress } from "@/lib/recipient-persistence";
import { LOGO_BMITAG_MONOCHROME_PNG_BASE64 } from "@/lib/logo-monochrome-base64";
import type { TecnicoDisponivel } from "@/components/equipamentos/VerificacaoTecnica";
import { useTecnicos } from "@/hooks/useTecnicos";
import { avisoBalcaoSemTecnicos, linhaTecnicoInicial, tecnicoDoBalcao, tecnicoPadrao } from "@/lib/tecnicos";
import { todayLocalIsoDate } from "@/lib/date-utils";
import { canTransition, getTransitionError } from "@/lib/status-fsm";
import {
  STATUS_LABELS,
  type Cliente,
  type ClienteContato,
  type Equipamento,
  type Produto,
} from "@/types";

const inputClass = "min-h-12 text-base";
const operationalStatuses = [
  "RECEBIDO",
  "EM_VERIFICACAO",
  "AGUARDANDO_APROVACAO",
  "EM_MANUTENCAO",
  "PRONTO",
  "ORCAMENTO_VENCIDO",
];
const today = () => todayLocalIsoDate();
const ACESSORIOS_OPTIONS = [
  "Cabo de Força",
  "Fonte",
  "Etiqueta",
  "Ribbon",
  "Cabo USB",
];

const RESULTADOS_TESTE_IMPRESSAO = [
  { value: "NAO_REALIZADO", label: "Não realizado" },
  { value: "IMPRESSO_CORRETAMENTE", label: "Impresso corretamente" },
  { value: "FALHOU", label: "Falhou" },
] as const;

function rotuloResultadoTeste(resultado: string) {
  return (
    RESULTADOS_TESTE_IMPRESSAO.find((item) => item.value === resultado)
      ?.label || "Não realizado"
  );
}

function base64ParaBytes(base64: string): number[] {
  const binario = window.atob(base64);
  return Array.from(binario, (caractere) => caractere.charCodeAt(0));
}

function equipmentTitle(eq: Equipamento) {
  return `${eq.marca} ${eq.modelo}`.trim();
}

export default function Balcao() {
  const { resetKey } = useCounterSession();
  const location = useLocation();
  const [view, setView] = useState<
    "home" | "entry" | "equipment" | "client" | "panel" | "stock"
  >("home");
  const [counterEquipment, setCounterEquipment] = useState<Equipamento | null>(
    null,
  );
  const [termoBusca, setTermoBusca] = useState("");
  const [vendaAbertaId, setVendaAbertaId] = useState<number | null>(null);
  const { openProfileSelector } = useSensitiveAccess();
  useEffect(() => {
    setView("home");
    setCounterEquipment(null);
    setTermoBusca("");
    setVendaAbertaId(null);
  }, [resetKey]);
  useEffect(() => {
    if (location.pathname === "/balcao/painel") setView("panel");
  }, [location.pathname]);
  useEffect(() => {
    const equipmentId = (
      location.state as { counterEquipmentId?: number } | null
    )?.counterEquipmentId;
    if (!equipmentId) return;
    void db
      .buscarEquipamento(equipmentId)
      .then(setCounterEquipment)
      .catch(() => setCounterEquipment(null));
  }, [location.state]);
  function abrirItem(item: ItemRetirada) {
    if (item.tipo === "EQUIPAMENTO") setCounterEquipment(item.equipamento);
    else setVendaAbertaId(item.venda.id);
  }
  if (vendaAbertaId != null)
    return (
      <VendaRetirada
        vendaId={vendaAbertaId}
        onVoltar={() => {
          setVendaAbertaId(null);
          setView("equipment");
        }}
        onInicio={() => {
          setVendaAbertaId(null);
          setTermoBusca("");
          setView("home");
        }}
        onTrocarPerfil={() => void openProfileSelector()}
      />
    );
  if (counterEquipment)
    return (
      <section>
        <Back onBack={() => setCounterEquipment(null)} />
        <EquipmentDetail equipamento={counterEquipment} />
      </section>
    );
  if (view === "entry") return <QuickEntry onBack={() => setView("home")} />;
  if (view === "equipment")
    return (
      <RetiradaBusca
        termoInicial={termoBusca}
        onTermoChange={setTermoBusca}
        onBack={() => { setTermoBusca(""); setView("home"); }}
        onAbrirItem={abrirItem}
      />
    );
  if (view === "client") return <ClientSearch onBack={() => setView("home")} />;
  if (view === "panel")
    return <OperationalPanel onBack={() => setView("home")} />;
  if (view === "stock") return <CounterStock onBack={() => setView("home")} />;
  return (
    <BalcaoInicio
      onReceber={() => setView("entry")}
      onEntregar={() => setView("equipment")}
      onConsultarCliente={() => setView("client")}
      onPrecoEstoque={() => setView("stock")}
      onPainel={() => setView("panel")}
      onBuscar={(termo) => {
        setTermoBusca(termo);
        setView("equipment");
      }}
      onAbrirEquipamento={setCounterEquipment}
      onAbrirItem={abrirItem}
    />
  );
}

/** Início do Balcão: busca grande, quatro blocos de toque e a fila do dia. */
function BalcaoInicio({
  onReceber,
  onEntregar,
  onConsultarCliente,
  onPrecoEstoque,
  onPainel,
  onBuscar,
  onAbrirEquipamento,
  onAbrirItem,
}: {
  onReceber: () => void;
  onEntregar: () => void;
  onConsultarCliente: () => void;
  onPrecoEstoque: () => void;
  onPainel: () => void;
  onBuscar: (termo: string) => void;
  onAbrirEquipamento: (equipamento: Equipamento) => void;
  onAbrirItem: (item: ItemRetirada) => void;
}) {
  const fila = useFilaBalcao();
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Quem está no balcão?</h1>
        <div className="relative">
          <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Buscar equipamento ou cliente"
            className="h-16 rounded-xl border-2 border-primary/70 bg-card pl-14 text-lg"
            placeholder="Série, nome do cliente, CPF/CNPJ ou telefone"
            onChange={(e) => onBuscar(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <BlocoBalcao destaque icon={<Plus className="h-7 w-7" />} title="Receber equipamento" description="Nova entrada em 4 passos" onClick={onReceber} />
          <BlocoBalcao
            icon={<Box className="h-7 w-7" />}
            title="Entregar ao cliente"
            description="Equipamentos prontos e insumos aprovados"
            contador={fila.totalProntos > 0 ? fila.totalProntos : undefined}
            onClick={onEntregar}
          />
          <BlocoBalcao icon={<UserSearch className="h-7 w-7" />} title="Consultar cliente" description="Dados, contatos e histórico" onClick={onConsultarCliente} />
          <BlocoBalcao icon={<Tag className="h-7 w-7" />} title="Preço e estoque" description="Insumos, saldo e valor de venda" onClick={onPrecoEstoque} />
        </div>
      </section>

      <aside className="space-y-4" aria-label="Fila do dia">
        <FilaCard titulo="Prontos para retirada" contagem={fila.loading ? undefined : fila.totalProntos}>
          {fila.loading ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">Carregando...</p>
          ) : fila.error ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">Não foi possível carregar a fila.</p>
          ) : fila.prontos.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">Nada pronto para retirada.</p>
          ) : (
            <ul className="divide-y">
              {fila.prontos.slice(0, 5).map((item) => (
                <li key={item.chave} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{clienteDoItem(item)}</p>
                    <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <EtiquetaRetirada tipo={item.tipo} />
                      <span className="truncate">{descricaoDoItem(item)}</span>
                    </p>
                    {valorDoItem(item) && <p className="text-xs font-semibold tabular-nums">{valorDoItem(item)}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    className="min-h-12 shrink-0 bg-acc-soft px-4 font-semibold text-acc-soft-foreground hover:bg-acc-soft/70 hover:text-acc-soft-foreground"
                    onClick={() => onAbrirItem(item)}
                  >
                    Registrar Entrega
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </FilaCard>
        <FilaCard
          titulo="Chegaram hoje"
          contagem={fila.loading ? undefined : fila.chegaramHojeMais ? `${fila.chegaramHoje.length}+` : fila.chegaramHoje.length}
        >
          {fila.loading ? null : fila.chegaramHoje.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">Nenhuma entrada hoje.</p>
          ) : (
            <ul className="divide-y">
              {fila.chegaramHoje.map((eq) => (
                <li key={eq.id}>
                  <button
                    type="button"
                    className="flex min-h-14 w-full items-start gap-3 px-5 py-3 text-left transition-colors duration-rapida hover:bg-muted/60"
                    onClick={() => onAbrirEquipamento(eq)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{eq.cliente_nome || "Cliente não informado"}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {equipmentTitle(eq)} · {(STATUS_LABELS[eq.status as keyof typeof STATUS_LABELS] || eq.status).toLowerCase()}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{horaDaEntrada(eq.criado_em)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FilaCard>
        <Button variant="ghost" className="min-h-12 w-full text-base text-muted-foreground" onClick={onPainel}>
          Painel operacional
        </Button>
      </aside>
    </div>
  );
}

/** criado_em vem do PostgreSQL como texto; só a hora, no fuso de Salvador. */
function horaDaEntrada(criadoEm?: string): string {
  if (!criadoEm) return "";
  const instante = new Date(criadoEm.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(instante.getTime())
    ? ""
    : instante.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bahia" });
}

function FilaCard({ titulo, contagem, children }: { titulo: string; contagem?: number | string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <header className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="font-bold">{titulo}</h2>
        {contagem !== undefined && <span className="text-sm font-semibold tabular-nums text-muted-foreground">{contagem}</span>}
      </header>
      {children}
    </section>
  );
}

function BlocoBalcao({
  icon,
  title,
  description,
  destaque = false,
  contador,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  destaque?: boolean;
  contador?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex min-h-40 flex-col justify-between gap-6 rounded-2xl border p-6 text-left transition-colors duration-rapida focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        destaque ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "bg-card hover:border-ctl",
      )}
    >
      <span aria-hidden="true">{icon}</span>
      <span>
        <span className="block text-xl font-bold">{title}</span>
        <span className={cn("mt-1 block text-sm", destaque ? "text-primary-foreground/80" : "text-muted-foreground")}>{description}</span>
      </span>
      {contador !== undefined && (
        <span className="absolute right-6 top-6 inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-acc-soft px-2 text-sm font-bold tabular-nums text-acc-soft-foreground">
          {contador}
          <span className="sr-only"> prontos para retirada</span>
        </span>
      )}
    </button>
  );
}

function Back({ onBack, rotulo = "Voltar" }: { onBack: () => void; rotulo?: string }) {
  return (
    <Button
      variant="ghost"
      className="min-h-12 gap-2 text-base"
      onClick={onBack}
    >
      <ChevronLeft /> {rotulo}
    </Button>
  );
}

function formatarPreco(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function CounterStock({ onBack }: { onBack: () => void }) {
  const [busca, setBusca] = useState("");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregarProdutos(termo = busca) {
    setCarregando(true);
    setErro(null);
    try {
      setProdutos(await db.listarProdutos(termo.trim() || undefined));
    } catch (cause) {
      setErro("Não foi possível consultar o estoque agora.");
      console.error("Erro ao consultar estoque no balcão:", cause);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregarProdutos("");
  }, []);

  return (
    <section className="mx-auto max-w-6xl">
      <Back onBack={onBack} />
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Estoque e preços</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Consulte os insumos disponíveis e o preço de venda ao cliente.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-12 gap-2 text-base"
          disabled={carregando}
          onClick={() => void carregarProdutos()}
        >
          <RefreshCw className={carregando ? "animate-spin" : undefined} />
          Atualizar estoque
        </Button>
      </div>

      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void carregarProdutos();
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            className="min-h-12 pl-10 text-base"
            placeholder="Buscar por nome ou código do insumo"
          />
        </div>
        <Button type="submit" className="min-h-12 gap-2 text-base" disabled={carregando}>
          <Search /> Buscar
        </Button>
      </form>

      {erro && <p role="alert" className="mt-4 text-destructive">{erro}</p>}
      {carregando ? (
        <div className="mt-8 flex min-h-40 items-center justify-center gap-3 text-lg text-muted-foreground">
          <Loader2 className="animate-spin" /> Carregando estoque...
        </div>
      ) : produtos.length === 0 ? (
        <p className="mt-8 rounded-xl border bg-card p-6 text-lg text-muted-foreground">
          Nenhum insumo encontrado.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {produtos.map((produto) => {
            const estoqueBaixo = produto.quantidade_estoque < produto.quantidade_minima;
            return (
              <Card key={produto.id ?? produto.codigo} className="border-2">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">{produto.nome}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Código: {produto.codigo} · {categoriaProdutoLabel(produto.categoria)}
                      </p>
                    </div>
                    {estoqueBaixo && <Badge variant="destructive">Estoque baixo</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-base">
                    <div className="rounded-lg bg-muted p-3">
                      <p className="text-sm text-muted-foreground">Disponível</p>
                      <p className="mt-1 text-2xl font-bold">{produto.quantidade_estoque}</p>
                    </div>
                    <div className="rounded-lg bg-acc-soft p-3">
                      <p className="text-sm text-muted-foreground">Preço de venda</p>
                      <p className="mt-1 text-2xl font-bold text-acc-soft-foreground">{formatarPreco(produto.preco_venda)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function QuickEntry({ onBack }: { onBack: () => void }) {
  const { ensureSensitiveAccess, status: sessaoDoBalcao } = useSensitiveAccess();
  const [step, setStep] = useState(1);
  const [client, setClient] = useState<Cliente | null>(null);
  const [responsavel, setResponsavel] = useState<ClienteContato | null>(null);
  const [history, setHistory] = useState<Equipamento[]>([]);
  const [mostrarOutros, setMostrarOutros] = useState(false);
  const [confirmedCycle, setConfirmedCycle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Equipamento | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PdfArtifact | null>(null);
  const [data, setData] = useState({
    serial_number: "",
    marca: "",
    modelo: "",
    tipo: "",
    defeito_relatado: "",
    patrimonio: "",
    acessorios: [] as string[],
    acessorios_outros: "",
    laudo_tecnico: "",
    observacoes: "",
  });
  const tecnicos = useTecnicos();
  const [tecnico, setTecnico] = useState<TecnicoDisponivel>("");
  // Sem escolha ainda: o próprio perfil, se faz atendimento técnico, ou o único técnico da
  // empresa. Com vários e nenhum deles a sessão, a pessoa escolhe (nunca "o primeiro da lista").
  const padraoDoTecnico = tecnicoPadrao(tecnicos, sessaoDoBalcao?.unlocked ? sessaoDoBalcao.active_profile_id : null);
  useEffect(() => {
    if (!tecnico && padraoDoTecnico) setTecnico(padraoDoTecnico);
  }, [tecnico, padraoDoTecnico]);
  const emailDoTecnicoEscolhido = tecnicos.find((t) => t.nome === tecnico)?.email ?? "";
  // Empresa sem nenhum técnico marcado: a entrada fica no nome de quem está operando.
  const operadorDoBalcao = sessaoDoBalcao?.unlocked ? sessaoDoBalcao.active_profile_name ?? "" : "";
  const registroDoTecnico = tecnicoDoBalcao(tecnico, tecnicos, operadorDoBalcao);
  const [emailPromptOpen, setEmailPromptOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState<ResolvedRecipient | null>(null);
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
  const [resultadoTesteImpressao, setResultadoTesteImpressao] = useState(
    "NAO_REALIZADO",
  );
  const [abrindoPainelImpressoras, setAbrindoPainelImpressoras] =
    useState(false);
  const [impressoras, setImpressoras] = useState<ImpressoraWindows[]>([]);
  const [impressoraSelecionada, setImpressoraSelecionada] = useState("");
  const [carregandoImpressoras, setCarregandoImpressoras] = useState(false);
  const [impressorasCarregadas, setImpressorasCarregadas] = useState(false);
  const [enviandoTeste, setEnviandoTeste] = useState(false);
  const [testeEnviado, setTesteEnviado] = useState(false);
  const [otherField, setOtherField] = useState<"marca" | "tipo" | null>(null);
  const [otherValue, setOtherValue] = useState("");
  const update =
    (key: keyof typeof data) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setData((value) => ({ ...value, [key]: event.target.value }));
  useEffect(() => {
    const serial = data.serial_number.trim();
    if (serial.length < 3) {
      setHistory([]);
      return;
    }
    const timer = window.setTimeout(
      () =>
        void db
          .buscarEquipamentosPorSerial(serial)
          .then((rows) => {
            setHistory(rows);
            const newest = rows[0];
            if (newest)
              setData((current) => ({
                ...current,
                marca: current.marca || newest.marca,
                modelo: current.modelo || newest.modelo,
                tipo: current.tipo || newest.tipo,
              }));
          })
          .catch(() => setHistory([])),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [data.serial_number]);
  async function carregarImpressoras() {
    setCarregandoImpressoras(true);
    setError(null);
    void db
      .listarImpressorasWindows()
      .then((items) => {
        setImpressoras(items);
        setImpressoraSelecionada((atual) =>
          items.some((impressora) => impressora.nome === atual)
            ? atual
            : items.find((impressora) => impressora.padrao)?.nome ||
              items[0]?.nome ||
              "",
        );
      })
      .catch((cause) => setError(String(cause)))
      .finally(() => {
        setCarregandoImpressoras(false);
        setImpressorasCarregadas(true);
      });
  }
  useEffect(() => {
    if (step !== 3 || impressorasCarregadas || carregandoImpressoras) return;
    void carregarImpressoras();
  }, [carregandoImpressoras, impressorasCarregadas, step]);
  async function solicitarEnvioAutomatico(equipment: Equipamento) {
    const permitted = await ensureSensitiveAccess({
      title: "Enviar ordem de entrada",
      description:
        "Informe o PIN para enviar a ordem de entrada por e-mail ao cliente.",
    });
    if (permitted) {
      setEmailRecipient(resolveRecipient(equipment, "email"));
      setEmailPromptOpen(true);
    }
  }
  async function enviarOrdemEntrada(equipment: Equipamento, email: string, emailSalvo = false) {
    setEmailFeedback(null);
    let erroEnvio: string | undefined;
    try {
      const result = await EmailService.enviarOrdemEntrada({
        ...equipment,
        cliente_email: email,
      });
      if (!result.sucesso) erroEnvio = result.erro || "falha desconhecida";
    } catch (cause) {
      erroEnvio = cause instanceof Error ? cause.message : String(cause);
    }
    setEmailFeedback(
      !erroEnvio
        ? "E-mail da ordem de entrada enviado com sucesso."
        : emailSalvo
          ? `A entrada foi salva. ${mensagemEnvioFalhouComEmailSalvo(erroEnvio)}`
          : `A entrada foi salva, mas o e-mail não foi enviado: ${erroEnvio}.`,
    );
  }
  async function abrirPainelImpressoras() {
    setAbrindoPainelImpressoras(true);
    setError(null);
    try {
      await db.abrirPainelImpressorasWindows();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setAbrindoPainelImpressoras(false);
    }
  }
  async function imprimirTesteBmitag() {
    if (!impressoraSelecionada) {
      setError("Selecione uma impressora para enviar o teste BMITAG.");
      return;
    }
    setEnviandoTeste(true);
    setError(null);
    setTesteEnviado(false);
    try {
      await db.imprimirTesteBmitag({
        impressora: impressoraSelecionada,
        logo_png: base64ParaBytes(LOGO_BMITAG_MONOCHROME_PNG_BASE64),
        equipamento: `${data.marca} ${data.modelo}`.trim(),
        serial: data.serial_number.trim(),
        tecnico: registroDoTecnico.nome || tecnico,
      });
      setTesteEnviado(true);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setEnviandoTeste(false);
    }
  }
  async function save() {
    if (!client?.id)
      return setError("Selecione ou cadastre o cliente antes de salvar.");
    const validation = equipamentoSchema.safeParse({
      ...data,
      acessorios: data.acessorios,
      status: "RECEBIDO",
    });
    if (!validation.success)
      return setError(
        validation.error.issues[0]?.message ||
          "Revise os dados do equipamento.",
      );
    if (history.length && !confirmedCycle)
      return setError("Confirme a criação de um novo ciclo para este serial.");
    if (registroDoTecnico.erro) return setError(registroDoTecnico.erro);
    setSaving(true);
    setError(null);
    try {
      const emailTecnico = emailDoTecnicoEscolhido;
      const observacoes = [
        registroDoTecnico.transicao ? "" : linhaTecnicoInicial(registroDoTecnico.nome, emailTecnico),
        data.observacoes.trim(),
      ]
        .filter(Boolean)
        .join("\n");
      const equipment = await db.criarEquipamento({
        ...validation.data,
        acessorios: validation.data.acessorios?.join(", "),
        cliente_id: client.id,
        empresa_id: client.empresa_id || undefined,
        cliente_nome:
          client.nome || client.nome_fantasia || client.razao_social,
        cliente_telefone: client.telefone || undefined,
        cliente_email: client.email,
        responsavel_contato_id: responsavel?.id || undefined,
        responsavel_nome: responsavel?.nome || undefined,
        responsavel_email: responsavel?.email || undefined,
        responsavel_telefone: responsavel?.telefone || undefined,
        data_entrada: today(),
        observacoes,
      });
      // A entrada já foi persistida. Se o laudo falhar, exibimos o detalhe
      // salvo com o erro, evitando que o atendente crie um ciclo duplicado.
      setCreated(equipment);
      void solicitarEnvioAutomatico(equipment);
      await db.salvarVerificacao({
        equipamento_id: equipment.id!,
        tecnico_nome: registroDoTecnico.nome,
        problema_relatado: data.defeito_relatado,
        diagnostico: [
          data.laudo_tecnico.trim(),
          `Teste de impressão: ${rotuloResultadoTeste(resultadoTesteImpressao)}.`,
        ]
          .filter(Boolean)
          .join("\n"),
        itens_verificados: "[]",
        servicos_necessarios: "[]",
        pecas_necessarias: "[]",
        observacoes: `Registro imediato no balcão. Resultado do teste: ${rotuloResultadoTeste(resultadoTesteImpressao)}.`,
        concluida: false,
      });
      // salvarVerificacao altera atualizado_em; a ordem impressa e publicada precisa do token novo.
      try {
        const recarregado = await db.buscarEquipamento(equipment.id!);
        if (recarregado) setCreated(recarregado);
      } catch (cause) {
        console.warn("[Balcao] recarga pós-laudo indisponível", cause);
      }
      void Promise.resolve(afterCounterRegistration(equipment)).catch(
        (cause: unknown) =>
          console.warn("[Balcao] extensão pós-cadastro indisponível", cause),
      );
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSaving(false);
    }
  }
  if (created)
    return (
      <section>
        <h1 className="text-3xl font-bold">Entrada registrada</h1>
        <p className="mt-2 text-lg">O atendimento foi criado como Recebido.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            className="min-h-12 text-base"
            onClick={() =>
              void PdfService.construirOrdemServico(created)
                .then(setPreview)
                .catch((cause) => setError(String(cause)))
            }
          >
            <FileText /> Visualizar / imprimir ordem
          </Button>
          <Button
            className="min-h-12 text-base"
            variant="outline"
            onClick={() =>
              document
                .getElementById("registro-completo")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Ver os dados recém-registrados
          </Button>
          <Button
            className="min-h-12 text-base"
            variant="outline"
            onClick={() => {
              setCreated(null);
              setStep(1);
              setClient(null);
              setResponsavel(null);
            }}
          >
            Iniciar outro atendimento
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-destructive">
            {error}
          </p>
        )}
        {emailFeedback && (
          <p role="status" className="mt-4 text-base">
            {emailFeedback}
          </p>
        )}
        <PdfPreviewDialog
          artifact={preview}
          onOpenChange={(open) => {
            if (!open) setPreview(null);
          }}
          onDownload={async (artifact) => {
            await PdfService.salvarOrdemServico(artifact, created);
          }}
          // Imprimir sem baixar também publica; publicarPdfOficial é idempotente por artefato.
          onBeforePrint={(artifact) => publicarPdfOficial(artifact, created)}
        />
        <CommunicationEmailDialog
          open={emailPromptOpen}
          recipient={emailRecipient}
          onOpenChange={(open) => {
            setEmailPromptOpen(open);
            if (!open) setEmailRecipient(null);
          }}
          onConfirm={async (email, salvar) => {
            if (salvar) {
              try {
                await saveRecipientAddress(created, "email", email);
              } catch (cause) {
                setError(String(cause));
                return false;
              }
              // O cadastro mudou: recarrega a entrada para um reenvio já usar o e-mail salvo.
              try {
                setCreated(await db.buscarEquipamento(created.id!));
              } catch {
                // Melhor esforço: o e-mail já está salvo e o envio segue com o endereço digitado.
              }
            }
            await enviarOrdemEntrada(created, email, salvar);
          }}
          onSkip={() => undefined}
        />
        <div id="registro-completo" className="mt-6">
          <EquipmentDetail equipamento={created} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Este botão apenas desce para o detalhe da entrada criada nesta tela;
          não abre uma tela administrativa diferente.
        </p>
      </section>
    );
  const selectValue = (value: string, options: readonly string[]) =>
    options.includes(value) ? value : value ? "Outro" : "";
  const choose = (field: "marca" | "tipo", value: string) => {
    if (value === "Outro") {
      setOtherField(field);
      setOtherValue("");
      return;
    }
    setData((current) => ({ ...current, [field]: value }));
  };
  const nomeCliente = client?.nome || client?.nome_fantasia || client?.razao_social || "";
  return (
    <section className="-m-4 flex min-h-[calc(100vh-72px)] flex-col lg:-m-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-card px-4 py-2 lg:px-8">
        <Button variant="ghost" className="-ml-3 min-h-12 gap-1 text-base" onClick={onBack}>
          <ChevronLeft /> Cancelar entrada
        </Button>
        <ol className="flex flex-1 flex-wrap justify-center gap-2" aria-label="Passos da entrada">
          {["Cliente", "Equipamento", "Laudo imediato", "Recapitulação"].map((name, index) => {
            const numero = index + 1;
            const feito = numero < step;
            const atual = numero === step;
            return (
              <li
                key={name}
                aria-current={atual ? "step" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-full py-1 pl-1 pr-4 text-sm font-semibold",
                  atual ? "bg-primary text-primary-foreground" : feito ? "bg-acc-soft text-acc-soft-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-full text-xs",
                    atual ? "bg-primary-foreground text-primary" : "bg-card",
                  )}
                >
                  {feito ? <Check className="h-4 w-4" /> : numero}
                </span>
                {name}
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex-1 px-4 py-6 lg:px-8">
      {step === 1 && (
        <div className="mx-auto max-w-4xl space-y-2 [&_button]:min-h-12 [&_button]:text-base [&_input]:min-h-12 [&_input]:text-base">
          <h2 className="mb-4 text-2xl font-bold tracking-tight">Quem está trazendo o equipamento?</h2>
          <ClienteSelector
            onClienteSelecionado={(selectedClient) => {
              setClient(selectedClient);
              setResponsavel(null);
            }}
            onClienteRemovido={() => {
              setClient(null);
              setResponsavel(null);
            }}
          />
          {client && (
            <>
              <ContatoResponsavelSelector
                cliente={client}
                empresaId={client.empresa_id}
                value={responsavel}
                onChange={setResponsavel}
                preSelecionar
              />
            </>
          )}
        </div>
      )}
      {step === 2 && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold tracking-tight">Dados do equipamento</h2>
            {client && (
              <span className="rounded-full bg-acc-soft px-4 py-2 text-sm font-semibold text-acc-soft-foreground">
                Cliente: {nomeCliente}{responsavel ? ` · ${responsavel.nome}` : ""}
              </span>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Serial *"
              value={data.serial_number}
              onChange={update("serial_number")}
            />
            <div className="space-y-2">
              <Label className="text-base">Marca *</Label>
              <Select
                value={selectValue(data.marca, MARCA_EQUIPAMENTO_OPTIONS)}
                onValueChange={(value) => choose("marca", value)}
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {MARCA_EQUIPAMENTO_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field
              label="Modelo *"
              value={data.modelo}
              onChange={update("modelo")}
            />
            <div className="space-y-2">
              <Label className="text-base">Tipo *</Label>
              <Select
                value={selectValue(data.tipo, TIPO_OPTIONS)}
                onValueChange={(value) => choose("tipo", value)}
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field
              label="Patrimônio"
              value={data.patrimonio}
              onChange={update("patrimonio")}
            />
            <div className="space-y-2">
              <Label className="text-base">Técnico que está operando *</Label>
              <Select
                value={tecnico}
                onValueChange={(value: TecnicoDisponivel) => setTecnico(value)}
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Escolha o técnico" />
                </SelectTrigger>
                <SelectContent>
                  {tecnicos.map((option) => (
                    <SelectItem key={option.id} value={option.nome}>
                      {option.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {tecnicos.length === 0
                  ? avisoBalcaoSemTecnicos(operadorDoBalcao)
                  : `E-mail do técnico: ${emailDoTecnicoEscolhido || "não informado"}`}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="balcao-defeito" className="text-base">Defeito relatado pelo cliente *</Label>
            <Textarea
              id="balcao-defeito"
              className={cn(inputClass, "min-h-24")}
              value={data.defeito_relatado}
              onChange={update("defeito_relatado")}
            />
          </div>
          <div>
            <p className="text-base font-medium" id="balcao-acessorios">Acessórios que vieram junto</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="balcao-acessorios">
              {ACESSORIOS_OPTIONS.map((item) => {
                const marcado = data.acessorios.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={marcado}
                    onClick={() =>
                      setData((current) => ({
                        ...current,
                        acessorios: marcado
                          ? current.acessorios.filter((value) => value !== item)
                          : [...current.acessorios, item],
                      }))
                    }
                    className={cn(
                      "inline-flex min-h-12 items-center gap-1.5 rounded-xl border px-4 text-base font-medium transition-colors duration-rapida",
                      marcado ? "border-2 border-primary bg-acc-soft text-acc-soft-foreground" : "bg-card hover:border-ctl",
                    )}
                  >
                    {marcado ? <Check className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                    {item}
                  </button>
                );
              })}
              <button
                type="button"
                aria-expanded={mostrarOutros}
                onClick={() => setMostrarOutros((atual) => !atual)}
                className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-dashed px-4 text-base font-medium text-muted-foreground transition-colors duration-rapida hover:border-ctl"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Outro
              </button>
            </div>
          </div>
          {(mostrarOutros || data.acessorios_outros) && (
            <div className="space-y-2">
              <Label htmlFor="balcao-outros-acessorios" className="text-base">Outros acessórios</Label>
              <Textarea
                id="balcao-outros-acessorios"
                className={inputClass}
                value={data.acessorios_outros}
                onChange={update("acessorios_outros")}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-base">Observações complementares</Label>
            <Textarea
              className={inputClass}
              value={data.observacoes}
              onChange={update("observacoes")}
            />
          </div>
        </div>
          {history.length > 0 && (
            <aside className="rounded-2xl border bg-card p-5" aria-label="Este serial já passou por aqui">
              <h3 className="font-bold">Este serial já passou por aqui</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Marca, modelo e tipo foram preenchidos do último ciclo quando
                estavam vazios. Acessórios e defeito são sempre conferidos de novo.
              </p>
              <ul className="mt-3 divide-y border-y text-sm">
                {history.slice(0, 4).map((ciclo) => (
                  <li key={ciclo.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate">
                      {mesAno(ciclo.data_entrada)}
                      {ciclo.defeito_relatado ? ` · ${ciclo.defeito_relatado}` : ""}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {STATUS_LABELS[ciclo.status as keyof typeof STATUS_LABELS] || ciclo.status}
                    </span>
                  </li>
                ))}
              </ul>
              {history.length > 4 && <p className="mt-2 text-xs text-muted-foreground">e mais {history.length - 4} ciclos</p>}
              <label className="mt-4 flex min-h-12 items-center gap-3 rounded-xl bg-acc-soft px-4 py-2 text-base font-semibold text-acc-soft-foreground">
                <Checkbox
                  className="h-6 w-6"
                  checked={confirmedCycle}
                  onCheckedChange={setConfirmedCycle}
                />
                Confirmo abrir um novo ciclo
              </label>
            </aside>
          )}
        </div>
      )}
      {step === 3 && (
        <div className="mx-auto max-w-4xl space-y-5">
          <h2 className="text-2xl font-bold tracking-tight">Laudo imediato</h2>
          <p className="text-base text-muted-foreground">
            Registre o teste feito no recebimento. O texto será salvo na
            verificação técnica e exibido na ordem de serviço.
          </p>
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="font-medium">Configuração da impressora</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Abra a área de Impressoras e Faxes do Painel de Controle para
              conferir a impressora instalada. Nenhuma preferência de driver é
              aberta ou modificada pelo AutoOS.
            </p>
            <Button
              className="mt-4 min-h-12 text-base"
              variant="outline"
              disabled={abrindoPainelImpressoras}
              onClick={() => void abrirPainelImpressoras()}
            >
              {abrindoPainelImpressoras && <Loader2 className="animate-spin" />}
              Abrir Painel de Controle — Impressoras
            </Button>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-base">Impressora para o teste BMITAG</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10 gap-2"
                disabled={carregandoImpressoras}
                onClick={() => void carregarImpressoras()}
              >
                <RefreshCw className={carregandoImpressoras ? "animate-spin" : undefined} />
                Atualizar lista
              </Button>
            </div>
            <Select
              value={impressoraSelecionada}
              onValueChange={setImpressoraSelecionada}
              disabled={carregandoImpressoras || impressoras.length === 0}
            >
              <SelectTrigger className={inputClass}>
                <SelectValue
                  placeholder={
                    carregandoImpressoras
                      ? "Carregando impressoras..."
                      : "Nenhuma impressora encontrada"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {impressoras.map((impressora) => (
                  <SelectItem key={impressora.nome} value={impressora.nome}>
                    {impressora.nome}
                    {impressora.padrao ? " (padrão)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="min-h-12 text-base"
              disabled={!impressoraSelecionada || enviandoTeste}
              onClick={() => void imprimirTesteBmitag()}
            >
              {enviandoTeste && <Loader2 className="animate-spin" />}
              Imprimir teste BMITAG
            </Button>
            {testeEnviado && (
              <p role="status" className="text-sm text-status-ok">
                Teste enviado à fila de impressão. Confira a impressão física e
                registre o resultado abaixo.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-base">Resultado do teste de impressão</Label>
            <Select
              value={resultadoTesteImpressao}
              onValueChange={setResultadoTesteImpressao}
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESULTADOS_TESTE_IMPRESSAO.map((resultado) => (
                  <SelectItem key={resultado.value} value={resultado.value}>
                    {resultado.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-base">Laudo técnico</Label>
            <Textarea
              className={inputClass}
              value={data.laudo_tecnico}
              onChange={update("laudo_tecnico")}
              placeholder="Descreva o resultado do teste e o que foi constatado no recebimento."
            />
          </div>
          {error && <p role="alert" className="text-destructive">{error}</p>}
        </div>
      )}
      {step === 4 && (
        <div className="mx-auto max-w-4xl rounded-2xl border bg-card p-6">
          <h2 className="text-2xl font-bold tracking-tight">Recapitulação</h2>
          <dl className="mt-5 grid gap-3 text-base md:grid-cols-2">
            <Info
              label="Cliente"
              value={
                client?.nome ||
                client?.nome_fantasia ||
                client?.razao_social ||
                "—"
              }
            />
            <Info
              label="Técnico"
              value={`${registroDoTecnico.nome || "—"} — ${emailDoTecnicoEscolhido || "—"}`}
            />
            <Info
              label="Teste de impressão"
              value={rotuloResultadoTeste(resultadoTesteImpressao)}
            />
            {Object.entries(data)
              .filter(([key, value]) => key !== "observacoes" || value)
              .map(([key, value]) => (
                <Info
                  key={key}
                  label={labelFor(key)}
                  value={
                    Array.isArray(value)
                      ? value.join(", ") || "—"
                      : value || "—"
                  }
                />
              ))}
          </dl>
          {error && (
            <p role="alert" className="mt-4 text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
      </div>
      <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t bg-card px-4 py-4 lg:px-8">
        {step === 1 ? <span /> : (
          <Button
            className="min-h-14 px-6 text-base"
            variant="outline"
            onClick={() => setStep(step - 1)}
          >
            {step === 2 ? "Voltar para cliente" : step === 3 ? "Voltar para equipamento" : "Corrigir"}
          </Button>
        )}
        {step === 1 && (
          <Button className="min-h-14 px-6 text-base" disabled={!client} onClick={() => setStep(2)}>
            Continuar <ChevronRight />
          </Button>
        )}
        {step === 2 && (
          <Button className="min-h-14 px-6 text-base" onClick={() => setStep(3)}>
            Continuar para o laudo <ChevronRight />
          </Button>
        )}
        {step === 3 && (
          <Button className="min-h-14 px-6 text-base" onClick={() => setStep(4)}>
            Recapitular <ChevronRight />
          </Button>
        )}
        {step === 4 && (
          <Button className="min-h-14 px-6 text-base" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 className="animate-spin" />} Salvar como Recebido
          </Button>
        )}
      </div>
      <Dialog
        open={Boolean(otherField)}
        onOpenChange={(open) => !open && setOtherField(null)}
      >
        <DialogContent tamanho="m">
          <DialogHeader>
            <DialogTitle>
              Informar outro{" "}
              {otherField === "marca" ? "fabricante" : "tipo de equipamento"}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            className={inputClass}
            value={otherValue}
            onChange={(event) => setOtherValue(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOtherField(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (otherField && otherValue.trim())
                  setData((current) => ({
                    ...current,
                    [otherField]: otherValue.trim(),
                  }));
                setOtherField(null);
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
/** "Mar 2026" a partir de uma data ISO (AAAA-MM-DD). */
function mesAno(data?: string): string {
  const partes = data?.match(/^(\d{4})-(\d{2})/);
  if (!partes) return "Data desconhecida";
  const mes = new Date(Number(partes[1]), Number(partes[2]) - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${partes[1]}`;
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-base">{label}</Label>
      <Input className={inputClass} value={value} onChange={onChange} />
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="capitalize text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
function labelFor(key: string) {
  return key.replace(/_/g, " ");
}

/** Etiqueta da fila de retirada: diz se é um equipamento ou uma venda de insumos. */
function EtiquetaRetirada({ tipo }: { tipo: ItemRetirada["tipo"] }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-px text-[11px] font-semibold",
        tipo === "INSUMOS" ? "bg-acc-soft text-acc-soft-foreground" : "bg-muted text-foreground/80",
      )}
    >
      {tipo === "INSUMOS" ? "Insumos" : "Equipamento"}
    </span>
  );
}

type FiltroRetirada = "TUDO" | "EQUIPAMENTO" | "INSUMOS";

/**
 * Entregar ao cliente: sem busca, mostra a fila (equipamentos prontos e vendas de
 * insumos aprovadas); com busca, procura equipamentos e vendas (também por OI-n).
 * Venda ainda não aprovada aparece sem botão, com o motivo.
 */
function RetiradaBusca({
  onBack,
  termoInicial = "",
  onTermoChange,
  onAbrirItem,
}: {
  onBack: () => void;
  termoInicial?: string;
  /** Guarda a busca no Balcão: abrir um item e voltar mantém o que foi digitado. */
  onTermoChange?: (termo: string) => void;
  onAbrirItem: (item: ItemRetirada) => void;
}) {
  const fila = useFilaBalcao();
  const [term, setTerm] = useState(termoInicial);
  const { buscando, data: encontrados, loading } = useBuscaRetirada(term);
  const [filtro, setFiltro] = useState<FiltroRetirada>("TUDO");

  const itens = buscando ? encontrados : fila.prontos;
  const contagem = {
    TUDO: itens.length,
    EQUIPAMENTO: itens.filter((item) => item.tipo === "EQUIPAMENTO").length,
    INSUMOS: itens.filter((item) => item.tipo === "INSUMOS").length,
  };
  const visiveis = filtro === "TUDO" ? itens : itens.filter((item) => item.tipo === filtro);
  const carregando = buscando ? loading : fila.loading;

  return (
    <section>
      <Back onBack={onBack} rotulo="Início" />
      <h1 className="mt-3 text-3xl font-bold">Entregar ao cliente</h1>
      <label htmlFor="busca-retirada" className="mt-5 block text-base font-semibold">
        Quem veio buscar?
      </label>
      <div className="relative mt-2 max-w-3xl">
        <Search className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="busca-retirada"
          autoFocus
          className="min-h-14 border-2 border-primary/70 bg-card pl-12 text-lg"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            onTermoChange?.(e.target.value);
          }}
          placeholder="Nome do cliente, CPF/CNPJ, série ou OI-n"
        />
        {carregando && (
          <Loader2 className="absolute right-4 top-1/2 h-6 w-6 -translate-y-1/2 animate-spin" />
        )}
      </div>
      <div role="group" aria-label="Filtrar o que entregar" className="mt-4 inline-flex rounded-xl border bg-card p-1">
        {([
          ["TUDO", "Tudo"],
          ["EQUIPAMENTO", "Equipamentos"],
          ["INSUMOS", "Insumos"],
        ] as const).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            aria-pressed={filtro === valor}
            onClick={() => setFiltro(valor)}
            className={cn(
              "min-h-11 rounded-lg px-4 text-base font-semibold transition-colors duration-rapida",
              filtro === valor ? "bg-acc-soft text-acc-soft-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo} <span className="tabular-nums">{contagem[valor]}</span>
          </button>
        ))}
      </div>
      <ul className="mt-4 max-w-4xl divide-y rounded-2xl border bg-card">
        {visiveis.map((item) => {
          const entregavel = podeEntregar(item);
          const titulo = item.tipo === "EQUIPAMENTO" ? `Atendimento #${item.equipamento.id}` : null;
          return (
            <li key={item.chave} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <button type="button" onClick={() => onAbrirItem(item)} className="min-w-0 flex-1 text-left">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-lg">{clienteDoItem(item)}</strong>
                  <EtiquetaRetirada tipo={item.tipo} />
                </span>
                <span className="mt-0.5 block text-base text-muted-foreground">
                  {[titulo, descricaoDoItem(item), item.tipo === "INSUMOS" && !entregavel ? STATUS_ORCAMENTO_INSUMOS_LABEL[item.venda.status] : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {valorDoItem(item) && <span className="block text-base font-semibold tabular-nums">{valorDoItem(item)}</span>}
              </button>
              {entregavel ? (
                <Button
                  variant="ghost"
                  className="min-h-12 shrink-0 bg-acc-soft px-5 text-base font-semibold text-acc-soft-foreground hover:bg-acc-soft/70 hover:text-acc-soft-foreground"
                  onClick={() => onAbrirItem(item)}
                >
                  Registrar Entrega
                </Button>
              ) : item.tipo === "INSUMOS" ? (
                <span className="max-w-[16rem] text-right text-sm text-muted-foreground">
                  Ainda não dá para entregar: o cliente não aprovou este orçamento.
                </span>
              ) : (
                <Badge variant="outline">
                  {STATUS_LABELS[item.equipamento.status as keyof typeof STATUS_LABELS] || item.equipamento.status}
                </Badge>
              )}
            </li>
          );
        })}
        {!carregando && visiveis.length === 0 && (
          <li className="px-5 py-8 text-center text-lg text-muted-foreground">
            {buscando ? "Nada encontrado para essa busca." : "Nada pronto para retirada."}
          </li>
        )}
      </ul>
    </section>
  );
}

function ClientSearch({ onBack }: { onBack: () => void }) {
  const [term, setTerm] = useState("");
  const [clients, setClients] = useState<Cliente[]>([]);
  const [selected, setSelected] = useState<Cliente | null>(null);
  const [equipment, setEquipment] = useState<Equipamento | null>(null);
  useEffect(() => {
    if (term.trim().length < 2) return setClients([]);
    const timer = window.setTimeout(
      () =>
        void db
          .listarClientes(term)
          .then(setClients)
          .catch(() => setClients([])),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [term]);
  if (equipment)
    return (
      <section>
        <Back onBack={() => setEquipment(null)} />
        <EquipmentDetail equipamento={equipment} />
      </section>
    );
  if (selected)
    return (
      <ClientCycles
        client={selected}
        onBack={() => setSelected(null)}
        onSelectEquipment={setEquipment}
      />
    );
  return (
    <section>
      <Back onBack={onBack} />
      <h1 className="mt-3 text-3xl font-bold">Buscar cliente</h1>
      <Input
        autoFocus
        className="mt-6 min-h-14 max-w-3xl text-lg"
        placeholder="Nome, razão social, CPF/CNPJ, telefone ou e-mail"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      <div className="mt-6 grid gap-3">
        {clients.map((client) => (
          <button
            key={client.id}
            type="button"
            className="min-h-20 rounded-xl border bg-card p-4 text-left hover:border-primary"
            onClick={() => setSelected(client)}
          >
            <strong className="text-lg">
              {client.nome || client.nome_fantasia || client.razao_social}
            </strong>
            <p>
              {client.documento || client.cpf_cnpj || "Sem documento"} ·{" "}
              {client.telefone || "Sem telefone"}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

function ClientCycles({
  client,
  onBack,
  onSelectEquipment,
}: {
  client: Cliente;
  onBack: () => void;
  onSelectEquipment: (equipment: Equipamento) => void;
}) {
  const [rows, setRows] = useState<Equipamento[]>([]);
  useEffect(() => {
    void db
      .listarEquipamentos(
        client.nome || client.nome_fantasia || client.razao_social,
      )
      .then((all) =>
        setRows(
          all
            .filter((eq) => eq.cliente_id === client.id)
            .sort((a, b) =>
              String(b.criado_em).localeCompare(String(a.criado_em)),
            ),
        ),
      )
      .catch(() => setRows([]));
  }, [client]);
  return (
    <section>
      <Back onBack={onBack} />
      <h1 className="mt-3 text-3xl font-bold">
        {client.nome || client.nome_fantasia || client.razao_social}
      </h1>
      <p className="mt-2 text-lg">
        {client.telefone || "Sem telefone"} · {client.email || "Sem e-mail"}
      </p>
      <h2 className="mt-8 text-xl font-semibold">Ciclos de equipamentos</h2>
      <div className="mt-3 grid gap-3">
        {rows.map((eq) => (
          <button
            type="button"
            key={eq.id}
            className="min-h-20 rounded-xl border bg-card p-4 text-left hover:border-primary"
            onClick={() => onSelectEquipment(eq)}
          >
            <strong>{equipmentTitle(eq)}</strong>
            <span className="ml-3">
              #{eq.id} ·{" "}
              {STATUS_LABELS[eq.status as keyof typeof STATUS_LABELS] ||
                eq.status}
            </span>
            <p>
              Serial: {eq.serial_number} · {eq.data_entrada}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

function EquipmentDetail({ equipamento }: { equipamento: Equipamento }) {
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const [current, setCurrent] = useState(equipamento);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function deliver() {
    const invalid = getTransitionError(current.status, "ENTREGUE");
    if (invalid) return setError(invalid);
    const permitted = await ensureSensitiveAccess({
      title: "Confirmar retirada",
      description: "Informe o PIN para marcar este equipamento como entregue.",
    });
    if (!permitted) return setError("A retirada não foi autorizada.");
    setBusy(true);
    setError(null);
    try {
      await db.atualizarStatusEquipamento(
        current.id!,
        "ENTREGUE",
        undefined,
        undefined,
        undefined,
        current.atualizado_em,
      );
      setCurrent(await db.buscarEquipamento(current.id!));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  const canDeliver = canTransition(current.status, "ENTREGUE");
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3 text-2xl">
          {equipmentTitle(current)}{" "}
          <Badge>
            {STATUS_LABELS[current.status as keyof typeof STATUS_LABELS] ||
              current.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 text-base">
        <dl className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Info label="Atendimento" value={`#${current.id}`} />
          <Info label="Serial" value={current.serial_number} />
          <Info label="Patrimônio" value={current.patrimonio || "—"} />
          <Info label="Cliente" value={current.cliente_nome || "—"} />
          <Info label="Defeito" value={current.defeito_relatado || "—"} />
          <Info label="Acessórios" value={current.acessorios || "—"} />
          <Info label="Observações" value={current.observacoes || "—"} />
          <Info label="Entrada" value={current.data_entrada} />
          <Info label="Saída" value={current.data_saida || "—"} />
        </dl>
        <DocumentosEquipamento equipamento={current} />
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            className="min-h-12 text-base"
            disabled={!canDeliver || busy}
            onClick={() => void deliver()}
          >
            {busy && <Loader2 className="animate-spin" />} <Check /> Conferir e
            marcar como entregue
          </Button>
          {!canDeliver && (
            <span className="self-center text-muted-foreground">
              Ainda não dá para registrar a entrega. Conclua as etapas do atendimento até o equipamento ficar pronto para retirada.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OperationalPanel({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState("RECEBIDO");
  const [rows, setRows] = useState<Equipamento[]>([]);
  const [period, setPeriod] = useState<"today" | "7" | "30" | "custom">(
    "today",
  );
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selected, setSelected] = useState<Equipamento | null>(null);
  useEffect(() => {
    void db
      .listarEquipamentos(undefined, status)
      .then((items) => {
        const start =
          period === "custom" && customStart
            ? new Date(`${customStart}T00:00:00`)
            : new Date();
        if (period !== "custom")
          start.setDate(
            start.getDate() - (period === "today" ? 0 : Number(period) - 1),
          );
        const end =
          period === "custom" && customEnd
            ? new Date(`${customEnd}T23:59:59`)
            : null;
        setRows(
          status === "ENTREGUE"
            ? items.filter((eq) => {
                const deliveredAt = new Date(eq.data_saida || eq.data_entrada);
                return deliveredAt >= start && (!end || deliveredAt <= end);
              })
            : items,
        );
      })
      .catch(() => setRows([]));
  }, [status, period, customStart, customEnd]);
  if (selected)
    return (
      <section>
        <Back onBack={() => setSelected(null)} />
        <EquipmentDetail equipamento={selected} />
      </section>
    );
  return (
    <section>
      <Back onBack={onBack} />
      <h1 className="mt-3 text-3xl font-bold">Painel operacional</h1>
      <div className="mt-6 flex flex-wrap gap-2">
        {operationalStatuses.map((item) => (
          <Button
            key={item}
            variant={status === item ? "default" : "outline"}
            className="min-h-12 text-base"
            onClick={() => setStatus(item)}
          >
            {STATUS_LABELS[item as keyof typeof STATUS_LABELS]}
          </Button>
        ))}
        <Button
          variant={status === "ENTREGUE" ? "default" : "outline"}
          className="min-h-12 text-base"
          onClick={() => setStatus("ENTREGUE")}
        >
          Entregues
        </Button>
      </div>
      {status === "ENTREGUE" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant={period === "today" ? "default" : "outline"}
            onClick={() => setPeriod("today")}
          >
            Hoje
          </Button>
          <Button
            variant={period === "7" ? "default" : "outline"}
            onClick={() => setPeriod("7")}
          >
            7 dias
          </Button>
          <Button
            variant={period === "30" ? "default" : "outline"}
            onClick={() => setPeriod("30")}
          >
            30 dias
          </Button>
          <Button
            variant={period === "custom" ? "default" : "outline"}
            onClick={() => setPeriod("custom")}
          >
            Intervalo
          </Button>
          {period === "custom" && (
            <>
              <DateIsoInput
                aria-label="Data inicial"
                className="min-h-12 w-44"
                value={customStart}
                onValueChange={setCustomStart}
              />
              <DateIsoInput
                aria-label="Data final"
                className="min-h-12 w-44"
                value={customEnd}
                onValueChange={setCustomEnd}
              />
            </>
          )}
        </div>
      )}
      <div className="mt-6 grid gap-3">
        {rows.map((eq) => (
          <button
            type="button"
            key={eq.id}
            className="min-h-20 rounded-xl border bg-card p-4 text-left hover:border-primary"
            onClick={() => setSelected(eq)}
          >
            <strong>{equipmentTitle(eq)}</strong>
            <span className="ml-3">#{eq.id}</span>
            <p>
              {eq.cliente_nome} · {eq.serial_number} ·{" "}
              {status === "ENTREGUE"
                ? `Entregue em: ${eq.data_saida || "data indisponível"}`
                : `Entrada: ${eq.data_entrada}`}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
