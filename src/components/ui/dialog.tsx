import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

function dentroDeAviso(target: EventTarget | null) {
  return target instanceof Element && target.closest("[data-sonner-toaster]") !== null
}

/**
 * Tamanhos do Modal do DS: P 440px (confirmação), M 560px (formulário curto, escolha, PIN),
 * G 760px (formulário longo), visualizador até 1040px (PDF e imagem). Sem `tamanho`, vale o M;
 * uma largura passada em `className` continua valendo.
 */
const TAMANHO_MODAL = {
  p: "sm:max-w-[440px]",
  m: "sm:max-w-[560px]",
  g: "sm:max-w-[760px]",
  visualizador: "sm:max-w-[1040px]",
} as const

export type TamanhoModal = keyof typeof TAMANHO_MODAL

/**
 * Cabeçalho e rodapé viram faixas com divisor (Modal do DS) quando são filhos diretos do
 * conteúdo, ou o rodapé é filho direto de um <form> no conteúdo. Cabeçalho dentro de outro
 * bloco (layout próprio) fica como está.
 */
const FAIXAS_MODAL = [
  "[&>[data-slot=dialog-header]]:-mx-6 [&>[data-slot=dialog-header]]:-mt-6 [&>[data-slot=dialog-header]]:border-b [&>[data-slot=dialog-header]]:px-6 [&>[data-slot=dialog-header]]:py-5 [&>[data-slot=dialog-header]]:pr-14",
  "[&>[data-slot=dialog-footer]]:-mx-6 [&>[data-slot=dialog-footer]]:-mb-6 [&>[data-slot=dialog-footer]]:border-t [&>[data-slot=dialog-footer]]:px-6 [&>[data-slot=dialog-footer]]:py-4",
  "[&>form>[data-slot=dialog-footer]]:-mx-6 [&>form>[data-slot=dialog-footer]]:-mb-6 [&>form>[data-slot=dialog-footer]]:border-t [&>form>[data-slot=dialog-footer]]:px-6 [&>form>[data-slot=dialog-footer]]:py-4",
].join(" ")

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { tamanho?: TamanhoModal }
>(({ className, children, onPointerDownOutside, onInteractOutside, tamanho = "m", ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      // Clicar num aviso (toast) com a janela aberta não pode fechar a janela nem perder o que
      // foi digitado: o aviso fica fora do diálogo, mas é parte da mesma tela.
      onPointerDownOutside={(event) => {
        if (dentroDeAviso(event.target)) event.preventDefault()
        onPointerDownOutside?.(event)
      }}
      onInteractOutside={(event) => {
        if (dentroDeAviso(event.target)) event.preventDefault()
        onInteractOutside?.(event)
      }}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-1.5rem)] max-w-[560px] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border bg-card p-6 text-card-foreground shadow-[0_24px_64px_rgba(0,0,0,0.22)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        TAMANHO_MODAL[tamanho],
        FAIXAS_MODAL,
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn(
      "flex flex-col space-y-1 text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-xl font-extrabold leading-7 tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
