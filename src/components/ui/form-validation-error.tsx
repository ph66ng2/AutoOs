import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormValidationErrorProps {
  message?: string;
  className?: string;
}

export function FormValidationError({ message, className }: FormValidationErrorProps) {
  if (!message) return null;

  return (
    <p className={cn("text-xs text-red-500 flex items-center gap-1 mt-1", className)}>
      <AlertCircle className="h-3 w-3 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
