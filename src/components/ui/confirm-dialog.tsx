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
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  closeLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  closeLabel,
  variant = "default",
  onConfirm,
  onCancel,
  onClose,
}: ConfirmDialogProps) {
  function handleClose() {
    if (onClose) onClose();
    else onOpenChange(false);
  }
  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel>
          {closeLabel && (
            <AlertDialogCancel onClick={handleClose} className="border-red-300 text-red-600 hover:bg-red-50">
              {closeLabel}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
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
