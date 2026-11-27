import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"

/*
 * A marca da aba ativa (pílula, sublinhado ou cartão) é um elemento só, que desliza com mola
 * da aba anterior até a nova (`layoutId` do motion). Cada TabsList tem o seu id, então duas
 * listas na mesma tela não trocam marcas entre si. Com movimento reduzido o MotionConfig do app
 * (MovimentoDoComputador) faz a marca pular direto.
 */

const ValorDaAba = React.createContext<string | undefined>(undefined)
const MarcaDaLista = React.createContext<{ id: string; classe?: string }>({ id: "" })

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ value, defaultValue, onValueChange, ...props }, ref) => {
  const [interno, setInterno] = React.useState(defaultValue)
  const atual = value ?? interno
  const aoMudar = React.useCallback(
    (novo: string) => {
      setInterno(novo)
      onValueChange?.(novo)
    },
    [onValueChange],
  )
  return (
    <ValorDaAba.Provider value={atual}>
      <TabsPrimitive.Root ref={ref} value={atual} onValueChange={aoMudar} {...props} />
    </ValorDaAba.Provider>
  )
})
Tabs.displayName = TabsPrimitive.Root.displayName

type TabsListProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  /** Classes da marca da aba ativa. Padrão: pílula clara com sombra. */
  classeMarca?: string
}

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, classeMarca, ...props }, ref) => {
    const id = React.useId()
    const marca = React.useMemo(() => ({ id, classe: classeMarca }), [id, classeMarca])
    return (
      <MarcaDaLista.Provider value={marca}>
        <TabsPrimitive.List
          ref={ref}
          className={cn(
            "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
            className
          )}
          {...props}
        />
      </MarcaDaLista.Provider>
    )
  }
)
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, value, ...props }, ref) => {
  const ativa = React.useContext(ValorDaAba) === value
  const marca = React.useContext(MarcaDaLista)
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      className={cn(
        "relative isolate inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-colors duration-rapida focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground",
        className
      )}
      {...props}
    >
      {ativa && (
        <motion.span
          aria-hidden="true"
          data-marca-aba=""
          layoutId={`marca-aba-${marca.id}`}
          transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.8 }}
          className={cn("pointer-events-none absolute inset-0 -z-10 rounded-md bg-background shadow", marca.classe)}
        />
      )}
      {children}
    </TabsPrimitive.Trigger>
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
