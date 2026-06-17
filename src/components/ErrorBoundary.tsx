import React from "react";
import { AlertTriangle, Copy, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary] Erro capturado:", error, errorInfo);
  }

  handleCopyDetails = async () => {
    const { error, errorInfo } = this.state;
    const lines = [
      `Mensagem: ${error?.message || "N/A"}`,
      `Stack: ${error?.stack || "N/A"}`,
      `Componente: ${errorInfo?.componentStack || "N/A"}`,
      `Data/Hora: ${new Date().toISOString()}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
    } catch {
      // Clipboard não disponível - falha silenciosa
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { error, showDetails } = this.state;
      return (
        <div className="flex items-center justify-center min-h-screen p-6 bg-background">
          <div className="w-full max-w-lg rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center shadow-sm">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-destructive/10 p-3">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <h1 className="text-xl font-semibold text-foreground mb-2">
              Algo deu errado
            </h1>
            <p className="text-muted-foreground mb-6">
              Ocorreu um erro inesperado. Tente recarregar a p&aacute;gina.
            </p>

            {error?.message && (
              <div className="mb-6 text-left">
                <button
                  onClick={() => this.setState({ showDetails: !showDetails })}
                  className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 mb-2"
                >
                  {showDetails ? "Ocultar detalhes t&eacute;cnicos" : "Ver detalhes t&eacute;cnicos"}
                </button>
                {showDetails && (
                  <div className="mt-2 rounded-md bg-muted p-3 text-left">
                    <p className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                      {error.message}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mt-2 whitespace-pre-wrap break-all">
                      {error.stack}
                    </p>
                    {this.state.errorInfo?.componentStack && (
                      <p className="text-xs font-mono text-muted-foreground mt-2 whitespace-pre-wrap break-all">
                        Componente: {this.state.errorInfo.componentStack}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleCopyDetails}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                <Copy className="h-4 w-4" />
                Copiar detalhes
              </button>
              <button
                onClick={this.handleReload}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Recarregar p&aacute;gina
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
