'use client';
import { Calculator, Scale, Wallet } from 'lucide-react';
import type { BuildingModel } from '@chalecad/engine';
import { Badge, Card, CardContent, CardHeader, CardTitle, ScrollArea, Tabs, TabsContent, TabsList, TabsTrigger } from '@chalecad/ui';
import { ArtNotice } from '@/components/ArtNotice';

const fmt = (n: number, d = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-stone-600">{label}</dt>
      <dd className="font-medium text-stone-900 tabular-nums">{value}</dd>
    </div>
  );
}

function Soon({ icon: Icon, title }: { icon: typeof Calculator; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-muted px-3 py-3">
      <span className="grid size-8 place-items-center rounded-md bg-white text-stone-500 shadow-sm">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-stone-800">{title}</p>
        <p className="text-xs text-stone-500">Aparece aqui quando o motor estiver conectado.</p>
      </div>
      <Badge variant="neutral">em breve</Badge>
    </div>
  );
}

export function ResultsPanel({ model, selected }: { model: BuildingModel; selected: string | null }) {
  return (
    <Tabs defaultValue="results" className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-3">
        <TabsList className="w-full">
          <TabsTrigger value="results">Resultados</TabsTrigger>
          <TabsTrigger value="params">Parâmetros</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="results" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="space-y-3 p-3">
            <Card>
              <CardHeader>
                <CardTitle>Edificação</CardTitle>
              </CardHeader>
              <CardContent className="pt-2 pb-3">
                <dl className="divide-y divide-border">
                  <Row label="Área de implantação" value={`${fmt(model.footprintArea)} m²`} />
                  <Row label="Área construída" value={`${fmt(model.builtArea)} m²`} />
                  <Row label="Altura da cumeeira" value={`${fmt(model.ridgeHeight)} m`} />
                  <Row label="Águas do telhado" value={`${model.roofPlanes.length}`} />
                  <Row label="Aberturas" value={`${model.openings.length}`} />
                </dl>
              </CardContent>
            </Card>

            {selected ? (
              <Card className="border-amber-300 bg-amber-50/40">
                <CardContent className="flex items-center justify-between py-3">
                  <span className="text-sm text-stone-700">Selecionado</span>
                  <Badge variant="accent" className="font-mono">
                    {selected}
                  </Badge>
                </CardContent>
              </Card>
            ) : (
              <p className="px-1 text-xs text-stone-500">Clique numa parede, água do telhado, laje ou escada para selecionar.</p>
            )}

            <Soon icon={Calculator} title="Lista de materiais" />
            <Soon icon={Scale} title="Peso e estrutura" />
            <Soon icon={Wallet} title="Orçamento por etapa" />
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="params" className="min-h-0 flex-1">
        <div className="p-4 text-sm text-stone-500">Dimensões, telhado e aberturas serão editados aqui.</div>
      </TabsContent>

      <div className="border-t border-border bg-surface-muted p-3">
        <ArtNotice className="items-start" />
      </div>
    </Tabs>
  );
}
