/**
 * Testes do PhotoUploadDialog — estado de sucesso após upload
 *
 * Cobre:
 * - Overlay "Fotos recebidas" via poll IPC (CSP bloqueia fetch localhost)
 * - Overlay via evento photo-received
 * - Auto-fechamento após 2.2s
 * - Fechamento manual durante sucesso (cancela timer)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { PhotoUploadDialog } from "../PhotoUploadDialog";
import { db } from "@/lib/db";

const mockUnlisten = vi.hoisted(() => vi.fn());
const mockListen = vi.hoisted(() => {
  const fn: any = vi.fn(() => Promise.resolve(mockUnlisten));
  fn.callbacks = {} as Record<string, (event: { payload: unknown }) => void>;
  return fn;
});

mockListen.mockImplementation(
  (eventName: string, callback: (event: { payload: unknown }) => void) => {
    mockListen.callbacks[eventName] = callback;
    return Promise.resolve(mockUnlisten);
  },
);

vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
}));

vi.mock("@/lib/db", () => ({
  db: {
    startPhotoServer: vi.fn().mockResolvedValue(undefined),
    stopPhotoServer: vi.fn().mockResolvedValue(undefined),
    gerarQrUpload: vi.fn().mockResolvedValue({
      qr_svg: "<svg>mock-qr</svg>",
      url: "http://localhost:8765/upload/test-token",
      token: "test-token",
    }),
    abrirUrl: vi.fn().mockResolvedValue(undefined),
    consultarStatusFoto: vi.fn().mockResolvedValue({ used: false, valid: true, count: 0 }),
  },
}));

describe("PhotoUploadDialog — sucesso", () => {
  const defaultProps = {
    equipamentoId: 1,
    categoria: "ENTRADA" as const,
    open: true,
    onOpenChange: vi.fn(),
    onPhotoUploaded: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockListen.callbacks = {};
    vi.mocked(db.consultarStatusFoto).mockResolvedValue({
      used: false,
      valid: true,
      count: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function flushStart() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("mostra Fotos recebidas após o poll IPC marcar o token usado", async () => {
    vi.mocked(db.consultarStatusFoto).mockResolvedValue({
      used: true,
      valid: false,
      count: 1,
      image_data: [
        { bytes: [1, 2, 3], filename: "test.jpg", mime_type: "image/jpeg" },
      ],
    });

    render(<PhotoUploadDialog {...defaultProps} />);

    await flushStart();

    expect(screen.getByText("Fotos recebidas")).toBeInTheDocument();
    expect(screen.getByText("1 foto no equipamento")).toBeInTheDocument();
    const checkIcon = document.querySelector(".text-green-600");
    expect(checkIcon).toBeInTheDocument();
  });

  it("mostra Fotos recebidas quando o backend emite photo-received", async () => {
    render(<PhotoUploadDialog {...defaultProps} />);
    await flushStart();

    expect(screen.queryByText("Fotos recebidas")).not.toBeInTheDocument();

    vi.mocked(db.consultarStatusFoto).mockResolvedValue({
      used: true,
      valid: false,
      count: 3,
    });

    await act(async () => {
      mockListen.callbacks["photo-received"]({
        payload: { equipamento_id: 1, count: 3 },
      });
      await Promise.resolve();
    });

    expect(screen.getByText("Fotos recebidas")).toBeInTheDocument();
    expect(screen.getByText("3 fotos no equipamento")).toBeInTheDocument();
  });

  it("fecha o diálogo automaticamente após mostrar o sucesso", async () => {
    const onOpenChange = vi.fn();
    vi.mocked(db.consultarStatusFoto).mockResolvedValue({
      used: true,
      valid: false,
      count: 1,
    });

    render(
      <PhotoUploadDialog {...defaultProps} onOpenChange={onOpenChange} />,
    );

    await flushStart();

    expect(screen.getByText("Fotos recebidas")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2200);
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("fechamento manual durante sucesso cancela o timer de auto-close", async () => {
    const onOpenChange = vi.fn();
    vi.mocked(db.consultarStatusFoto).mockResolvedValue({
      used: true,
      valid: false,
      count: 1,
    });

    render(
      <PhotoUploadDialog {...defaultProps} onOpenChange={onOpenChange} />,
    );

    await flushStart();

    expect(screen.getByText("Fotos recebidas")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /fechar/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2200);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("draft mode (equipamentoId=0) ainda mostra sucesso e chama onPhotoData", async () => {
    const onPhotoData = vi.fn();
    vi.mocked(db.consultarStatusFoto).mockResolvedValue({
      used: true,
      valid: false,
      count: 1,
      image_data: [
        { bytes: [10, 20, 30], filename: "draft.jpg", mime_type: "image/jpeg" },
      ],
    });

    render(
      <PhotoUploadDialog
        equipamentoId={0}
        categoria="ENTRADA"
        open={true}
        onOpenChange={vi.fn()}
        onPhotoUploaded={vi.fn()}
        onPhotoData={onPhotoData}
      />,
    );

    await flushStart();

    expect(screen.getByText("Fotos recebidas")).toBeInTheDocument();
    expect(onPhotoData).toHaveBeenCalledWith({
      bytes: [10, 20, 30],
      filename: "draft.jpg",
      mime_type: "image/jpeg",
      categoria: "ENTRADA",
    });
  });

  it("mostra o aviso do hostname público quando o QR usa o túnel nomeado", async () => {
    vi.mocked(db.gerarQrUpload).mockResolvedValueOnce({
      qr_svg: "<svg>mock-qr</svg>",
      url: "https://fotos.bmitag.com.br/?token=test-token&eq=1&cat=ENTRADA",
      token: "test-token",
      via_tunnel: true,
    });

    render(<PhotoUploadDialog {...defaultProps} />);
    await flushStart();

    expect(
      screen.getByText(/não precisa do Wi-Fi da recepção/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/fotos.bmitag.com.br enquanto o QR estiver aberto/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/mesma rede Wi-Fi que o computador/i),
    ).not.toBeInTheDocument();
  });

  it("mostra o aviso do túnel rápido quando o QR usa trycloudflare", async () => {
    vi.mocked(db.gerarQrUpload).mockResolvedValueOnce({
      qr_svg: "<svg>mock-qr</svg>",
      url: "https://foo-bar.trycloudflare.com/?token=test-token&eq=1&cat=ENTRADA",
      token: "test-token",
      via_tunnel: true,
    });

    render(<PhotoUploadDialog {...defaultProps} />);
    await flushStart();

    expect(
      screen.getByText(/Pode usar 4G/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/celular pode estar no 4G/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/um computador de recepção por vez/i),
    ).not.toBeInTheDocument();
  });

  it("mostra só o host do trycloudflare e o QR em quadro fixo", async () => {
    vi.mocked(db.gerarQrUpload).mockResolvedValueOnce({
      qr_svg: '<svg width="220" height="220"></svg>',
      url: "https://foo-bar.trycloudflare.com/?token=test-token&eq=1&cat=ENTRADA",
      token: "test-token",
      via_tunnel: true,
    });

    render(<PhotoUploadDialog {...defaultProps} />);
    await flushStart();

    expect(screen.getByText("foo-bar.trycloudflare.com")).toBeInTheDocument();
    expect(screen.queryByText(/token=test-token/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("qr-frame")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("overflow-hidden");
    expect(dialog.className).not.toContain("overflow-y-auto");
    expect(screen.getByRole("button", { name: /copiar endereço/i })).toBeInTheDocument();
  });

  it("copia a URL completa ao clicar no botão", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    vi.mocked(db.gerarQrUpload).mockResolvedValueOnce({
      qr_svg: "<svg>mock-qr</svg>",
      url: "https://foo-bar.trycloudflare.com/?token=test-token&eq=1&cat=ENTRADA",
      token: "test-token",
      via_tunnel: true,
    });

    render(<PhotoUploadDialog {...defaultProps} />);
    await flushStart();

    fireEvent.click(screen.getByRole("button", { name: /copiar endereço/i }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(
      "https://foo-bar.trycloudflare.com/?token=test-token&eq=1&cat=ENTRADA",
    );
  });
});
