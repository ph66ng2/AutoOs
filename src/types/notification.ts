export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface AppError {
  type: 'error';
  context: string;
  action: string;
  message: string;
  technicalDetails?: string;
  /** Código técnico do backend (ex.: `AUTOOS:DB:42P01`). */
  codigo?: string;
  /** Referência da linha correspondente no log do aplicativo. */
  referencia?: string;
  /** Explicação do código para quem investiga (SQLSTATE, categoria). */
  descricaoTecnica?: string;
  /** Texto bruto devolvido, quando não veio código estruturado. */
  mensagemOriginal?: string;
  originalError?: unknown;
  timestamp: Date;
}

export interface NotificationMessage {
  type: NotificationType;
  context: string;
  action?: string;
  message: string;
  technicalDetails?: string;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ErrorDisplayProps {
  error?: AppError;
  variant?: 'error' | 'warning' | 'info' | 'success';
  context?: string;
  action?: string;
  message?: string;
  technicalDetails?: string;
  showDetails?: boolean;
  showCopyButton?: boolean;
  className?: string;
}

export interface FormValidationErrorProps {
  message?: string;
  className?: string;
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
}

export interface InputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  validate?: (value: string) => string | null;
}
