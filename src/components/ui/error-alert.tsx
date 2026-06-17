import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  Copy,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { copyErrorDetails } from "@/lib/error-utils";
import type { AppError } from "@/types/notification";

interface ErrorAlertProps {
  variant?: "error" | "warning" | "info" | "success";
  context?: string;
  action?: string;
  message?: string;
  technicalDetails?: string;
  className?: string;
}

const VARIANT_STYLES: Record<
  string,
  { border: string; bg: string; text: string; icon: React.ElementType }
> = {
  error: {
    border: "border-destructive/30",
    bg: "bg-destructive/5",
    text: "text-destructive",
    icon: AlertCircle,
  },
  warning: {
    border: "border-amber-200 dark:border-amber-800/30",
    bg: "bg-amber-50 dark:bg-amber-950/20",
    text: "text-amber-700 dark:text-amber-400",
    icon: AlertTriangle,
  },
  info: {
    border: "border-blue-200 dark:border-blue-800/30",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    text: "text-blue-700 dark:text-blue-400",
    icon: Info,
  },
  success: {
    border: "border-emerald-200 dark:border-emerald-800/30",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    text: "text-emerald-700 dark:text-emerald-400",
    icon: CheckCircle,
  },
};

export function ErrorAlert({
  variant = "error",
  context,
  action,
  message,
  technicalDetails,
  className,
}: ErrorAlertProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!message && !technicalDetails) return null;

  const styles = VARIANT_STYLES[variant];
  const IconComponent = styles.icon;

  const handleCopy = async () => {
    const appError: AppError = {
      type: "error",
      context: context || "",
      action: action || "",
      message: message || "",
      technicalDetails,
      timestamp: new Date(),
    };
    const ok = await copyErrorDetails(appError);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        styles.border,
        styles.bg,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <IconComponent className={cn("h-5 w-5 mt-0.5 shrink-0", styles.text)} />
        <div className="flex-1 min-w-0">
          <div className={cn("text-sm font-medium", styles.text)}>
            {context && <span>{context}</span>}
            {context && action && <span className="mx-1">—</span>}
            {action && <span>{action}</span>}
            {!context && !action && message && <span>{message}</span>}
          </div>
          {(context || action) && message && (
            <p className="text-sm text-muted-foreground mt-1">{message}</p>
          )}
        </div>
        {technicalDetails && (
          <button
            onClick={handleCopy}
            className={cn(
              "shrink-0 rounded-md p-1.5 transition-colors",
              "hover:bg-background/50",
              copied ? "text-emerald-500" : styles.text,
            )}
            title="Copiar detalhes"
          >
            <Copy className="h-4 w-4" />
          </button>
        )}
      </div>

      {technicalDetails && (
        <div className="mt-3">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showDetails ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {showDetails
              ? "Ocultar detalhes técnicos"
              : "Ver detalhes técnicos"}
          </button>
          {showDetails && (
            <pre className="mt-2 rounded-md bg-muted p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all overflow-x-auto">
              {technicalDetails}
            </pre>
          )}
        </div>
      )}

      {copied && (
        <p className="mt-2 text-xs text-emerald-500">
          Detalhes copiados para a área de transferência.
        </p>
      )}
    </div>
  );
}
