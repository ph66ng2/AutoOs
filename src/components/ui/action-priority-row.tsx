import { Fragment, useMemo, useState, type ReactNode } from "react"
import { Menu, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select"

export interface PriorityAction {
  id: string
  label: string
  icon?: ReactNode
  onClick: () => void
  variant?: "default" | "outline" | "ghost"
  className?: string
  disabled?: boolean
  ariaExpanded?: boolean
  /** Seção do menu "Mais". Se alguma ação tiver grupo, o menu mostra os grupos em ordem de aparição. */
  group?: string
}

interface ActionPriorityRowProps {
  primary: PriorityAction
  secondary?: PriorityAction
  overflow?: PriorityAction[]
  iconOnlyPrimary?: boolean
  iconOnlySecondary?: boolean
  iconOnlyOverflowTrigger?: boolean
  wrap?: boolean
  /**
   * Forma AcaoDaLinha do DS (lista de equipamentos): botão principal de 176px em
   * acc-soft, sem ícone, e ⋯ de 32px. A secundária, se houver, vai para o menu.
   */
  acaoDaLinha?: boolean
  /** Título do menu ⋯ (ex.: "modelo · série"). */
  menuTitulo?: string
  /** Com acaoDaLinha: botão principal cheio (primary) e mais alto, para o topo de Detalhes da OS. */
  destaque?: boolean
  /** Com acaoDaLinha: some o botão principal e fica só o ⋯. */
  semPrincipal?: boolean
}

export function ActionPriorityRow({
  primary,
  secondary,
  overflow = [],
  iconOnlyPrimary = false,
  iconOnlySecondary = false,
  iconOnlyOverflowTrigger = false,
  wrap = false,
  acaoDaLinha = false,
  menuTitulo,
  destaque = false,
  semPrincipal = false,
}: ActionPriorityRowProps) {
  const [selectedOverflow, setSelectedOverflow] = useState<string>("")

  const overflowById = useMemo(
    () => Object.fromEntries(overflow.map((action) => [action.id, action])),
    [overflow]
  )

  const overflowGroups = useMemo(() => {
    if (!overflow.some((action) => action.group)) return null
    const grupos = new Map<string, PriorityAction[]>()
    for (const action of overflow) {
      const chave = action.group ?? ""
      grupos.set(chave, [...(grupos.get(chave) ?? []), action])
    }
    return Array.from(grupos.entries())
  }, [overflow])

  const renderOverflowItem = (action: PriorityAction) => (
    <SelectItem
      key={action.id}
      value={action.id}
      disabled={action.disabled}
      className={acaoDaLinha ? "h-[34px] rounded-md py-0 pl-2.5 text-[13px] font-semibold" : undefined}
    >
      <span className={`flex items-center gap-2 ${action.className || ""}`.trim()}>
        {acaoDaLinha && action.icon ? (
          <span className="inline-flex w-4 shrink-0 justify-center opacity-70 [&>svg]:h-4 [&>svg]:w-4">{action.icon}</span>
        ) : (
          action.icon
        )}
        {action.label}
      </span>
    </SelectItem>
  )

  if (acaoDaLinha) {
    return (
      <div className="ml-auto inline-flex items-center justify-end gap-2 whitespace-nowrap">
        {!semPrincipal && (
          <Button
            variant={destaque ? "default" : "ghost"}
            size="sm"
            className={cn(
              "w-[176px] justify-center px-3 font-semibold",
              destaque
                ? "h-10 text-sm"
                : "h-8 bg-acc-soft text-[13px] text-acc-soft-foreground hover:bg-acc-soft/70 hover:text-acc-soft-foreground",
            )}
            onClick={primary.onClick}
            disabled={primary.disabled}
            title={primary.label}
            aria-label={primary.label}
            aria-expanded={primary.ariaExpanded}
          >
            <span className="truncate">{primary.label}</span>
          </Button>
        )}
        {overflow.length > 0 && (
          <Select
            value={selectedOverflow}
            onValueChange={(value) => {
              setSelectedOverflow(value)
              overflowById[value]?.onClick()
              setTimeout(() => setSelectedOverflow(""), 0)
            }}
          >
            <SelectTrigger
              className={cn("justify-center rounded-lg border-ctl bg-card px-0 [&>svg:last-child]:hidden", destaque ? "h-10 w-10" : "h-8 w-8")}
              title="Mais ações"
              aria-label="Mais ações"
            >
              <MoreHorizontal className="h-4 w-4" />
            </SelectTrigger>
            <SelectContent className="max-h-[min(34rem,80vh)] w-[248px] rounded-2xl p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.18)]" align="end">
              {menuTitulo && (
                <div className="truncate px-2.5 pb-0.5 pt-1.5 text-xs font-extrabold text-foreground">{menuTitulo}</div>
              )}
              {(overflowGroups ?? [["", overflow] as [string, PriorityAction[]]]).map(([grupo, acoes]) => (
                <SelectGroup key={grupo || "sem-grupo"}>
                  {grupo && (
                    <SelectLabel className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                      {grupo}
                    </SelectLabel>
                  )}
                  {acoes.map(renderOverflowItem)}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    )
  }

  return (
    <div className={`ml-auto items-center justify-end gap-1 whitespace-nowrap ${wrap ? "flex w-full flex-wrap" : "inline-flex"}`}>
      <Button
        variant={primary.variant || "default"}
        size={iconOnlyPrimary ? "icon" : "sm"}
        className={
          iconOnlyPrimary
            ? `h-9 w-9 ${primary.className || ""}`.trim()
            : `h-9 gap-1 px-3 text-xs ${primary.className || ""}`.trim()
        }
        onClick={primary.onClick}
        disabled={primary.disabled}
        title={primary.label}
        aria-label={primary.label}
        aria-expanded={primary.ariaExpanded}
      >
        {primary.icon}
        {!iconOnlyPrimary && primary.label}
      </Button>

      {secondary && (
        <Button
          variant={secondary.variant || "outline"}
          size={iconOnlySecondary ? "icon" : "sm"}
          className={
            iconOnlySecondary
              ? `h-9 w-9 ${secondary.className || ""}`.trim()
              : `h-9 gap-1 px-3 text-xs ${secondary.className || ""}`.trim()
          }
          onClick={secondary.onClick}
          disabled={secondary.disabled}
          title={secondary.label}
          aria-label={secondary.label}
        >
          {secondary.icon || <Menu className="h-3.5 w-3.5" />}
          {!iconOnlySecondary && secondary.label}
        </Button>
      )}

      {overflow.length > 0 && (
        <Select
          value={selectedOverflow}
          onValueChange={(value) => {
            setSelectedOverflow(value)
            overflowById[value]?.onClick()
            setTimeout(() => setSelectedOverflow(""), 0)
          }}
        >
          <SelectTrigger
            className={
              iconOnlyOverflowTrigger
              ? "h-9 w-9 px-0 justify-center [&>svg:last-child]:hidden"
              : "h-9 w-[110px] text-xs [&>span]:flex [&>span]:items-center [&>span]:gap-1 [&>svg]:hidden"
            }
            title="Mais ações"
            aria-label="Mais ações"
          >
            {iconOnlyOverflowTrigger ? (
              <MoreHorizontal className="h-4 w-4" />
            ) : (
              <span className="inline-flex items-center gap-1">
                <MoreHorizontal className="h-4 w-4" />
                <span>Mais</span>
              </span>
            )}
          </SelectTrigger>
          <SelectContent>
            {overflowGroups
              ? overflowGroups.map(([grupo, acoes], indice) => (
                <Fragment key={grupo || "sem-grupo"}>
                  {indice > 0 && <SelectSeparator />}
                  <SelectGroup>
                    {grupo && <SelectLabel>{grupo}</SelectLabel>}
                    {acoes.map(renderOverflowItem)}
                  </SelectGroup>
                </Fragment>
              ))
              : overflow.map(renderOverflowItem)}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
