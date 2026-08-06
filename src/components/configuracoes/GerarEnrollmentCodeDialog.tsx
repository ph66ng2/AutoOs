import { useState } from "react";
import { Check, Copy, KeyRound, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";

export function GerarEnrollmentCodeDialog() {
  const [open, setOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const code = await db.generateEnrollmentCode();
      setGeneratedCode(code);
      toast.success("Código de enrollment gerado com sucesso");
    } catch (err) {
      toast.error("Erro ao gerar código de enrollment", {
        description: String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedCode) return;
    await navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    toast.success("Código copiado para a área de transferência");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setGeneratedCode(null);
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <KeyRound className="mr-2 h-4 w-4" />
          Gerar Código de Enrollment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Código de Enrollment</DialogTitle>
          <DialogDescription>
            Gere um código para provisionar um novo dispositivo no sistema.
          </DialogDescription>
        </DialogHeader>

        {!generatedCode ? (
          <div className="flex justify-center py-4">
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? "Gerando..." : "Gerar Código"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-3">
                  <code className="text-2xl font-mono font-bold tracking-widest select-all">
                    {generatedCode}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                Este código será exibido apenas uma vez. Copie agora e guarde
                em local seguro.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
