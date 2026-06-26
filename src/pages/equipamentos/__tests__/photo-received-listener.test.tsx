import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

const mockUnlisten = vi.hoisted(() => vi.fn());
const mockListen = vi.hoisted(() => {
  const fn: any = vi.fn(() => Promise.resolve(mockUnlisten));
  fn.callbacks = {} as Record<string, (...args: unknown[]) => void>;
  return fn;
});

mockListen.mockImplementation(
  (eventName: string, callback: (...args: unknown[]) => void) => {
    mockListen.callbacks[eventName] = callback;
    return Promise.resolve(mockUnlisten);
  },
);

const mockInvoke = vi.hoisted(() => vi.fn());
const mockListarImagensEquipamento = vi.hoisted(() => vi.fn());
const mockBuscarEquipamento = vi.hoisted(() => vi.fn().mockRejectedValue(new Error("not called")));
const mockNavigate = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ state: {}, pathname: "/equipamentos" }),
  useNavigate: () => mockNavigate,
}));

vi.mock("@/lib/db", () => ({
  db: {
    buscarEquipamento: (...args: unknown[]) => mockBuscarEquipamento(...args),
    listarImagensEquipamento: (...args: unknown[]) =>
      mockListarImagensEquipamento(...args),
    listarEquipamentos: vi.fn().mockResolvedValue([]),
    buscarCliente: vi.fn().mockRejectedValue(new Error("no client")),
    buscarVerificacao: vi.fn().mockRejectedValue(new Error("no verif")),
    listarComunicacoes: vi.fn().mockResolvedValue([]),
    removerImagemEquipamento: vi.fn().mockResolvedValue(undefined),
    substituirImagensEquipamento: vi.fn().mockResolvedValue(undefined),
    buscarEquipamentosPorSerial: vi.fn().mockResolvedValue([]),
    startPhotoServer: vi.fn().mockResolvedValue(undefined),
    stopPhotoServer: vi.fn().mockResolvedValue(undefined),
    gerarQrUpload: vi.fn().mockResolvedValue({
      qr_svg: "<svg/>",
      url: "http://example.com",
      token: "token",
    }),
    abrirUrl: vi.fn().mockResolvedValue(undefined),
    registrarComunicacao: vi.fn().mockResolvedValue(undefined),
    copiarAnexoEmailParaTemp: vi.fn().mockResolvedValue("/tmp/test.pdf"),
    removerAnexoEmailTemp: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/equipamento-imagem-utils", () => ({
  arquivoParaImagemEquipamento: vi.fn(),
  bytesParaDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,test"),
  imagemPersistidaParaDraft: vi.fn(),
  normalizarOrdemPorCategoria: vi.fn((imagens) => imagens),
  LIMITE_IMAGENS_POR_EQUIPAMENTO: 6,
  EquipamentoImagemDraft: {},
}));

vi.mock("@/lib/validations", () => ({
  equipamentoSchema: { parse: vi.fn(), safeParse: vi.fn() },
}));

vi.mock("@/hooks/useEquipamentos", () => ({
  useEquipamentos: () => ({
    equipamentos: [],
    loading: false,
    error: null,
    criar: vi.fn(),
    atualizar: vi.fn(),
    deletar: vi.fn(),
    atualizarStatus: vi.fn(),
    recarregar: vi.fn(),
  }),
}));

vi.mock("@/hooks/useStatusEquipamento", () => ({
  useStatusEquipamento: () => ({
    loading: false,
    finalizarVerificacao: vi.fn(),
    marcarComoPronto: vi.fn(),
  }),
}));

vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({
    ensureSensitiveAccess: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(mockToast, {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock("@/components/equipamentos/ClienteSelector", () => ({
  ClienteSelector: () => <div data-testid="cliente-selector" />,
}));

vi.mock("@/components/equipamentos/PhotoUploadDialog", () => ({
  PhotoUploadDialog: () => <div data-testid="photo-upload-dialog" />,
}));

vi.mock("@/components/equipamentos/VerificacaoTecnica", () => ({
  VerificacaoTecnica: () => <div data-testid="verificacao-tecnica" />,
}));

vi.mock("@/components/equipamentos/HistoricoComunicacoes", () => ({
  HistoricoComunicacoes: () => <div data-testid="historico-comunicacoes" />,
}));

vi.mock("@/components/equipamentos/DocumentosEquipamento", () => ({
  DocumentosEquipamento: () => <div data-testid="documentos-equipamento" />,
}));

vi.mock("@/components/ui/action-priority-row", () => ({
  ActionPriorityRow: () => <div data-testid="action-priority-row" />,
}));

vi.mock("@/pages/equipamentos/EquipamentosPageGallery", () => ({
  GaleriaImagensEquipamento: () => <div data-testid="galeria-imagens" />,
}));

vi.mock("@/pages/equipamentos/EquipamentosStatusBadge", () => ({
  StatusBadge: () => <span data-testid="status-badge" />,
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => <div data-testid="confirm-dialog" />,
}));

vi.mock("@/components/ui/input-dialog", () => ({
  InputDialog: () => <div data-testid="input-dialog" />,
}));

vi.mock("@/components/ui/error-alert", () => ({
  ErrorAlert: () => <div data-testid="error-alert" />,
}));

vi.mock("@/components/ui/form-validation-error", () => ({
  FormValidationError: () => <div data-testid="form-validation-error" />,
}));

import Equipamentos from "../../Equipamentos";

function triggerPhotoReceived(equipamentoId: number, imagemId: number) {
  const cb = mockListen.callbacks["photo-received"];
  if (!cb) throw new Error("photo-received listener not registered");
  act(() => {
    cb({ payload: { equipamento_id: equipamentoId, imagem_id: imagemId } });
  });
}

describe("Equipamentos — photo-received listener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.callbacks = {};
    mockListarImagensEquipamento.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registra listener photo-received no mount", () => {
    render(<Equipamentos />);
    expect(mockListen).toHaveBeenCalledTimes(1);
    expect(mockListen).toHaveBeenCalledWith(
      "photo-received",
      expect.any(Function),
    );
  });

  it("ignora evento quando equipamento_id não corresponde ao selecionado", () => {
    render(<Equipamentos />);
    triggerPhotoReceived(99, 200);
    expect(mockListarImagensEquipamento).not.toHaveBeenCalled();
  });

  it("remove listener no unmount", async () => {
    const { unmount } = render(<Equipamentos />);
    await act(async () => {});
    unmount();
    expect(mockUnlisten).toHaveBeenCalledTimes(1);
  });

  it("não propaga erro quando listarImagensEquipamento falha", () => {
    mockListarImagensEquipamento.mockRejectedValue(new Error("DB error"));
    render(<Equipamentos />);
    expect(() => {
      triggerPhotoReceived(1, 100);
    }).not.toThrow();
  });
});
