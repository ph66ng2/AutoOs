import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  cancelVariant?: "outline" | "destructive";
  onConfirm: () => void;
  onCancel?: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Sim",
  cancelLabel = "Não",
  variant = "default",
  cancelVariant = "outline",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const pressClass =
    "transition-[transform,background-color,color] duration-rapida ease-saida active:scale-[0.96] motion-reduce:active:scale-100";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
        <AlertDialogHeader className="space-y-3">
          {(variant === "destructive" || cancelVariant === "destructive") && (
            // Confirmacao do DS: ícone de 44px no tom de perigo quando a ação destrói.
            <span aria-hidden="true" className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-status-bad-bg text-status-bad">
              <TriangleAlert className="h-[22px] w-[22px]" />
            </span>
          )}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className={description ? "whitespace-pre-line" : "sr-only"}>
            {description || title}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel
            onClick={() => {
              if (onCancel) onCancel();
              onOpenChange(false);
            }}
            className={cn(
              pressClass,
              cancelVariant === "destructive" &&
                "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:text-destructive-foreground",
            )}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
              pressClass,
              variant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
