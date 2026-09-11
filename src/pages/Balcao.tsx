import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  UserSearch,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PdfPreviewDialog } from "@/components/equipamentos/PdfPreviewDialog";
import { CommunicationEmailDialog } from "@/components/equipamentos/CommunicationEmailDialog";
import { afterCounterRegistration } from "@/lib/counter-registration";
import { EmailService } from "@/lib/email-service";
import { equipamentoSchema } from "@/lib/validations";
import {
  EMAIL_POR_TECNICO,
  MARCA_EQUIPAMENTO_OPTIONS,
  TECNICOS_DISPONIVEIS,
  TIPO_OPTIONS,
} from "@/pages/equipamentos/equipamentos-page-constants";
import { resolveRecipient, type ResolvedRecipient } from "@/lib/recipient-resolver";
import { saveRecipientAddress } from "@/lib/recipient-persistence";
import { LOGO_BMITAG_MONOCHROME_PNG_BASE64 } from "@/lib/logo-monochrome-base64";
import type { TecnicoDisponivel } from "@/components/equipamentos/VerificacaoTecnica";
import { canTransition, getTransitionError } from "@/lib/status-fsm";
import {
  STATUS_LABELS,
  SENSITIVE_PERMISSIONS,
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
const today = () => new Date().toISOString().slice(0, 10);
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
  useEffect(() => {
    setView("home");
    setCounterEquipment(null);
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
  if (counterEquipment)
    return (
      <section>
        <Back onBack={() => setCounterEquipment(null)} />
        <EquipmentDetail equipamento={counterEquipment} />
      </section>
    );
  if (view === "entry") return <QuickEntry onBack={() => setView("home")} />;
  if (view === "equipment")
    return <EquipmentSearch onBack={() => setView("home")} />;
  if (view === "client") return <ClientSearch onBack={() => setView("home")} />;
  if (view === "panel")
    return <OperationalPanel onBack={() => setView("home")} />;
  if (view === "stock") return <CounterStock onBack={() => setView("home")} />;
  return (
    <div className="mx-auto max-w-6xl py-8">
      <h1 className="text-3xl font-bold">Atendimento de balcão</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Escolha a próxima ação.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Action
          icon={<Plus className="h-14 w-14" />}
          title="Nova entrada"
          description="Registrar cliente e equipamento"
          onClick={() => setView("entry")}
        />
        <Action
          icon={<PackageSearch className="h-14 w-14" />}
          title="Buscar equipamento"
          description="Localizar atendimento ou retirada"
          onClick={() => setView("equipment")}
        />
        <Action
          icon={<UserSearch className="h-14 w-14" />}
          title="Buscar cliente"
          description="Ver dados e ciclos vinculados"
          onClick={() => setView("client")}
        />
        <Action
          icon={<PackageSearch className="h-14 w-14" />}
          title="Consultar estoque"
          description="Ver insumos, saldo e preço"
          onClick={() => setView("stock")}
        />
      </div>
      <Button
        className="mt-8 min-h-12 text-base"
        variant="outline"
        onClick={() => setView("panel")}
      >
        Abrir painel operacional
      </Button>
    </div>
  );
}

function Action({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-64 flex-col gap-5 rounded-2xl border-2 text-xl hover:border-cyan-600 hover:bg-cyan-50"
      onClick={onClick}
    >
      {icon}
      <span>{title}</span>
      <span className="text-base font-normal text-muted-foreground">
        {description}
      </span>
    </Button>
  );
}
function Back({ onBack }: { onBack: () => void }) {
  return (
    <Button
      variant="ghost"
      className="min-h-12 gap-2 text-base"
      onClick={onBack}
    >
      <ChevronLeft /> Voltar
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

      {erro && <p role="alert" className="mt-4 text-red-700">{erro}</p>}
      {carregando ? (
        <div className="mt-8 flex min-h-40 items-center justify-center gap-3 text-lg text-muted-foreground">
          <Loader2 className="animate-spin" /> Carregando estoque...
        </div>
      ) : produtos.length === 0 ? (
        <p className="mt-8 rounded-xl border bg-white p-6 text-lg text-muted-foreground">
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
                        Código: {produto.codigo} · {produto.categoria}
                      </p>
                    </div>
                    {estoqueBaixo && <Badge variant="destructive">Estoque baixo</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-base">
                    <div className="rounded-lg bg-slate-100 p-3">
                      <p className="text-sm text-muted-foreground">Disponível</p>
                      <p className="mt-1 text-2xl font-bold">{produto.quantidade_estoque}</p>
                    </div>
                    <div className="rounded-lg bg-cyan-50 p-3">
                      <p className="text-sm text-muted-foreground">Preço de venda</p>
                      <p className="mt-1 text-2xl font-bold text-cyan-800">{formatarPreco(produto.preco_venda)}</p>
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
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const [step, setStep] = useState(1);
  const [client, setClient] = useState<Cliente | null>(null);
  const [responsavel, setResponsavel] = useState<ClienteContato | null>(null);
  const [history, setHistory] = useState<Equipamento[]>([]);
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
  const [tecnico, setTecnico] = useState<TecnicoDisponivel>("Ivan");
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
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
    });
    if (permitted) {
      setEmailRecipient(resolveRecipient(equipment, "email"));
      setEmailPromptOpen(true);
    }
  }
  async function enviarOrdemEntrada(equipment: Equipamento, email: string) {
    setEmailFeedback(null);
    const result = await EmailService.enviarOrdemEntrada({
      ...equipment,
      cliente_email: email,
    });
    setEmailFeedback(
      result.sucesso
        ? "E-mail da ordem de entrada enviado com sucesso."
        : `A entrada foi salva, mas o e-mail não foi enviado: ${result.erro || "falha desconhecida"}.`,
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
        tecnico,
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
    setSaving(true);
    setError(null);
    try {
      const emailTecnico = EMAIL_POR_TECNICO[tecnico] || "";
      const observacoes = [
        `Técnico inicial: ${tecnico}${emailTecnico ? ` (${emailTecnico})` : ""}`,
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
        cliente_telefone: client.telefone,
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
        tecnico_nome: tecnico,
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
          <p role="alert" className="mt-4 text-red-700">
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
            }
            await enviarOrdemEntrada(created, email);
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
  return (
    <section className="mx-auto max-w-4xl">
      <Back onBack={onBack} />
      <h1 className="mt-3 text-3xl font-bold">Nova entrada</h1>
      <ol className="my-6 flex gap-2 text-base">
        {["Cliente", "Equipamento", "Laudo imediato", "Recapitulação"].map((name, index) => (
          <li
            key={name}
            className={`rounded-full px-4 py-2 ${step === index + 1 ? "bg-cyan-600 text-white" : "bg-slate-200"}`}
          >
            {index + 1}. {name}
          </li>
        ))}
      </ol>
      {step === 1 && (
        <div className="rounded-xl border bg-white p-6 [&_button]:min-h-12 [&_button]:text-base [&_input]:min-h-12 [&_input]:text-base">
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
              />
              <Button
                className="mt-6 min-h-12 text-base"
                onClick={() => setStep(2)}
              >
                Continuar <ChevronRight />
              </Button>
            </>
          )}
        </div>
      )}
      {step === 2 && (
        <div className="space-y-5 rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold">Dados do equipamento</h2>
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
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TECNICOS_DISPONIVEIS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                E-mail do técnico: {EMAIL_POR_TECNICO[tecnico]}
              </p>
            </div>
          </div>
          <Label className="text-base">Defeito relatado *</Label>
          <Textarea
            className={inputClass}
            value={data.defeito_relatado}
            onChange={update("defeito_relatado")}
          />
          <div>
            <Label className="text-base">Acessórios</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {ACESSORIOS_OPTIONS.map((item) => (
                <label
                  key={item}
                  className="flex min-h-12 items-center gap-3 rounded-lg border px-3 text-base"
                >
                  <Checkbox
                    className="h-5 w-5"
                    checked={data.acessorios.includes(item)}
                    onCheckedChange={(checked) =>
                      setData((current) => ({
                        ...current,
                        acessorios: checked
                          ? [...current.acessorios, item]
                          : current.acessorios.filter(
                              (value) => value !== item,
                            ),
                      }))
                    }
                  />
                  {item}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-base">Outros acessórios</Label>
            <Textarea
              className={inputClass}
              value={data.acessorios_outros}
              onChange={update("acessorios_outros")}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-base">Observações complementares</Label>
            <Textarea
              className={inputClass}
              value={data.observacoes}
              onChange={update("observacoes")}
            />
          </div>
          {history.length > 0 && (
            <div className="rounded-lg border border-amber-400 bg-amber-50 p-4">
              <strong>Serial já possui {history.length} ciclo(s).</strong>
              <p className="mt-1">
                Foi reaproveitada a marca, o modelo e o tipo somente quando
                estavam vazios. Os acessórios e o laudo são sempre conferidos
                nesta nova entrada.
              </p>
              <label className="mt-3 flex min-h-12 items-center gap-3 text-base">
                <Checkbox
                  className="h-6 w-6"
                  checked={confirmedCycle}
                  onCheckedChange={setConfirmedCycle}
                />{" "}
                Confirmo criar um novo ciclo
              </label>
            </div>
          )}
          <div className="flex gap-3">
            <Button
              className="min-h-12 text-base"
              variant="outline"
              onClick={() => setStep(1)}
            >
              Voltar
            </Button>
            <Button className="min-h-12 text-base" onClick={() => setStep(3)}>
              Continuar para o laudo <ChevronRight />
            </Button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-5 rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold">Laudo imediato</h2>
          <p className="text-base text-muted-foreground">
            Registre o teste feito no recebimento. O texto será salvo na
            verificação técnica e exibido na ordem de serviço.
          </p>
          <div className="rounded-lg border bg-slate-50 p-4">
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
              <p role="status" className="text-sm text-emerald-700">
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
          {error && <p role="alert" className="text-red-700">{error}</p>}
          <div className="flex gap-3">
            <Button className="min-h-12 text-base" variant="outline" onClick={() => setStep(2)}>
              Voltar
            </Button>
            <Button className="min-h-12 text-base" onClick={() => setStep(4)}>
              Recapitular <ChevronRight />
            </Button>
          </div>
        </div>
      )}
      {step === 4 && (
        <div className="rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold">Recapitulação</h2>
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
              value={`${tecnico} — ${EMAIL_POR_TECNICO[tecnico] || "—"}`}
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
            <p role="alert" className="mt-4 text-red-700">
              {error}
            </p>
          )}
          <div className="mt-6 flex gap-3">
            <Button
              className="min-h-12 text-base"
              variant="outline"
              onClick={() => setStep(3)}
            >
              Corrigir
            </Button>
            <Button
              className="min-h-12 text-base"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving && <Loader2 className="animate-spin" />} Salvar como
              Recebido
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={Boolean(otherField)}
        onOpenChange={(open) => !open && setOtherField(null)}
      >
        <DialogContent>
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

function EquipmentSearch({ onBack }: { onBack: () => void }) {
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<Equipamento[]>([]);
  const [selected, setSelected] = useState<Equipamento | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const query = term.trim();
    if (query.length < 2) {
      setRows([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      void db
        .listarEquipamentos(query)
        .then((items) =>
          setRows(
            items.sort((a, b) =>
              String(b.criado_em || b.data_entrada).localeCompare(
                String(a.criado_em || a.data_entrada),
              ),
            ),
          ),
        )
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [term]);
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
      <h1 className="mt-3 text-3xl font-bold">Buscar equipamento</h1>
      <p className="mt-2 text-base text-muted-foreground">
        Serial, patrimônio, marca, modelo, defeito ou dados do cliente.
      </p>
      <div className="relative mt-6 max-w-3xl">
        <Search className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          className="min-h-14 pl-12 text-lg"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Digite para buscar"
        />
        {loading && (
          <Loader2 className="absolute right-4 top-1/2 h-6 w-6 -translate-y-1/2 animate-spin" />
        )}
      </div>
      <div className="mt-6 grid gap-4">
        {rows.map((eq) => (
          <button
            type="button"
            key={eq.id}
            className="min-h-28 rounded-xl border bg-white p-5 text-left shadow-sm hover:border-cyan-600"
            onClick={() => setSelected(eq)}
          >
            <div className="flex flex-wrap items-center gap-3">
              <strong className="text-xl">{equipmentTitle(eq)}</strong>
              <Badge>
                {STATUS_LABELS[eq.status as keyof typeof STATUS_LABELS] ||
                  eq.status}
              </Badge>
            </div>
            <p className="mt-2 text-base">
              Atendimento #{eq.id} · Serial: {eq.serial_number}{" "}
              {eq.patrimonio ? `· Patrimônio: ${eq.patrimonio}` : ""}
            </p>
            <p className="text-base text-muted-foreground">
              {eq.cliente_nome || "Cliente não informado"} · Entrada:{" "}
              {eq.data_entrada}
            </p>
          </button>
        ))}
        {term.length >= 2 && !loading && rows.length === 0 && (
          <p className="text-lg text-muted-foreground">
            Nenhum equipamento encontrado.
          </p>
        )}
      </div>
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
            className="min-h-20 rounded-xl border bg-white p-4 text-left hover:border-cyan-600"
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
            className="min-h-20 rounded-xl border bg-white p-4 text-left hover:border-cyan-600"
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
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
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
          <p role="alert" className="text-red-700">
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
              <Input
                aria-label="Data inicial"
                type="date"
                className="min-h-12 w-44"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
              <Input
                aria-label="Data final"
                type="date"
                className="min-h-12 w-44"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
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
            className="min-h-20 rounded-xl border bg-white p-4 text-left hover:border-cyan-600"
            onClick={() => setSelected(eq)}
          >
            <strong>{equipmentTitle(eq)}</strong>
            <span className="ml-3">#{eq.id}</span>
            <p>
              {eq.cliente_nome} · {eq.serial_number} · {eq.data_entrada}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
