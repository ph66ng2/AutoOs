import { useMemo, useState, type ReactNode } from "react"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
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
}

interface ActionPriorityRowProps {
  primary: PriorityAction
  secondary?: PriorityAction
  overflow?: PriorityAction[]
  iconOnlyPrimary?: boolean
  iconOnlySecondary?: boolean
  iconOnlyOverflowTrigger?: boolean
}

export function ActionPriorityRow({
  primary,
  secondary,
  overflow = [],
  iconOnlyPrimary = false,
  iconOnlySecondary = false,
  iconOnlyOverflowTrigger = false,
}: ActionPriorityRowProps) {
  const [selectedOverflow, setSelectedOverflow] = useState<string>("")

  const overflowById = useMemo(
    () => Object.fromEntries(overflow.map((action) => [action.id, action])),
    [overflow]
  )

  return (
    <div className="ml-auto inline-flex items-center justify-end gap-1 whitespace-nowrap">
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
              <Menu className="h-3.5 w-3.5 opacity-80" />
            ) : (
              <span className="inline-flex items-center gap-1">
                <Menu className="h-3.5 w-3.5" />
                <span>Mais</span>
              </span>
            )}
          </SelectTrigger>
          <SelectContent>
            {overflow.map((action) => (
              <SelectItem key={action.id} value={action.id} disabled={action.disabled}>
                <span className={`flex items-center gap-2 ${action.className || ""}`.trim()}>
                  {action.icon}
                  {action.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
