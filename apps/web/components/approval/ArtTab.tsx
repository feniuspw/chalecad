'use client';
import { Copy, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, cn } from '@chalecad/ui';
import type { ArtSheet, Professional } from '@chalecad/engine';
import { Term } from '@/components/glossary/Term';
import { activitiesOf, activityText, artSheetText, professionalHeader } from '@/lib/approval/artText';
import { DISCIPLINE_LABEL, formatDateBr } from '@/lib/approval/labels';
import { useEditor } from '@/lib/store/editor';
import { TextField } from './fields';

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado.`);
  } catch {
    toast.error('Não foi possível copiar. Selecione o texto e copie à mão.');
  }
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const empty = !value.trim();
  return (
    <div className={cn('flex items-start gap-2 rounded-md px-2 py-1.5', empty && 'bg-amber-50 ring-1 ring-amber-300')} data-blank={empty || undefined}>
      <span className="w-40 shrink-0 text-xs font-medium text-stone-600">{label}</span>
      <span className={cn('min-w-0 flex-1 whitespace-pre-wrap text-xs', empty ? 'text-amber-800 italic' : 'text-stone-900')}>{empty ? 'preencher' : value}</span>
      <Button variant="ghost" size="sm" disabled={empty} aria-label={`Copiar ${label}`} onClick={() => void copy(value, label)}>
        <Copy /> Copiar
      </Button>
    </div>
  );
}

const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function ProfessionalBlock({ art, p, index }: { art: ArtSheet; p: Professional; index: number }) {
  const acts = activitiesOf(art, p.id);
  const kind = p.council === 'CAU' ? 'RRT' : 'ART';
  return (
    <section aria-label={`Ficha de ${p.name}`} className="rounded-lg border border-border bg-white p-4" data-testid="art-professional">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-900">{professionalHeader(p)}</h3>
        <Button variant="outline" size="sm" onClick={() => void copy(artSheetText(art, [p], p.id), `Ficha de ${p.name}`)}>
          <Copy /> Copiar a ficha deste profissional
        </Button>
      </div>
      <div className="mt-2 max-w-sm">
        <TextField
          label={`Nº da ${kind}`}
          why="Depois de emitida. Vai para o carimbo das pranchas."
          value={p.docNumber}
          onChange={(v) => useEditor.getState().updateCoalesced(`Dados legais: profissional ${index + 1}: nº ART/RRT`, (d) => { const x = d.legal.professionals[index]; if (x) x.docNumber = v; })}
        />
      </div>
      {acts.length === 0 ? (
        <p className="mt-3 text-xs text-stone-500">Nenhuma atividade atribuída a este profissional (as disciplinas dele não aparecem na ficha).</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-stone-500">
              <tr>
                <th className="py-1 pr-2">Atividade</th>
                <th className="py-1 pr-2">Quantidade</th>
                <th className="py-1 pr-2">Valor do contrato</th>
                <th className="py-1 pr-2">Observação sugerida</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {acts.map((a, i) => (
                <tr key={i} className="border-t border-border align-top">
                  <td className="py-1.5 pr-2">
                    <b className="font-medium">{DISCIPLINE_LABEL[a.discipline]}</b>
                    <br />
                    {a.activity}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {a.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {a.unit}
                  </td>
                  <td className={cn('py-1.5 pr-2 tabular-nums', a.contractValue === undefined && 'bg-amber-50 text-amber-800')}>{a.contractValue === undefined ? 'preencher' : money(a.contractValue)}</td>
                  <td className="py-1.5 pr-2 whitespace-pre-wrap">{a.notes || '—'}</td>
                  <td className="py-1.5">
                    <Button variant="ghost" size="sm" aria-label={`Copiar atividade ${a.activity}`} onClick={() => void copy(activityText(a), 'Atividade')}>
                      <Copy /> Copiar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ArtTab() {
  const art = useEditor((s) => s.results?.approval?.art);
  const profs = useEditor((s) => s.project.legal.professionals);
  if (!art)
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-stone-500" data-testid="art-empty">
        <Loader2 className="size-4 animate-spin" /> Calculando a ficha da ART/RRT…
      </div>
    );
  const orphan = art.activities.filter((a) => !a.professionalId || !profs.some((p) => p.id === a.professionalId));
  return (
    <div className="space-y-4 p-4" data-testid="approval-art">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-3xl text-xs leading-snug text-stone-600">
          A <Term id="art">ART</Term> é emitida pelo profissional no sistema do CREA da sua UF (ou o <Term id="rrt">RRT</Term> no SICCAU); esta ficha só reúne os dados.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="https://www.confea.org.br/" target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Confea/CREA
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="https://siccau.caubr.gov.br/" target="_blank" rel="noopener noreferrer">
              <ExternalLink /> CAU (SICCAU)
            </a>
          </Button>
          <Button size="sm" data-testid="copy-all" onClick={() => void copy(artSheetText(art, profs), 'Ficha completa')}>
            <Copy /> Copiar tudo
          </Button>
        </div>
      </div>

      {art.blanks.length > 0 ? (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-300">Campos vazios: {art.blanks.join('; ')}.</p>
      ) : null}

      <section aria-label="Partes e obra" className="rounded-lg border border-border bg-white p-3">
        <CopyRow label="Proprietário" value={art.owner.name} />
        <CopyRow label="CPF/CNPJ do proprietário" value={art.owner.doc} />
        <CopyRow label="Endereço do proprietário" value={art.owner.address} />
        <CopyRow label="Contratante" value={art.contractor.name} />
        <CopyRow label="CPF/CNPJ do contratante" value={art.contractor.doc} />
        <CopyRow label="Endereço do contratante" value={art.contractor.address} />
        <CopyRow label="Endereço da obra" value={art.siteAddress} />
        {art.coordinates ? <CopyRow label="Coordenadas" value={`${art.coordinates.lat.toFixed(6)}, ${art.coordinates.lon.toFixed(6)}`} /> : null}
        <CopyRow label="Início" value={formatDateBr(art.startDate)} />
        <CopyRow label="Término previsto" value={formatDateBr(art.endDate)} />
      </section>

      {profs.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-xs text-stone-500">Cadastre os responsáveis técnicos na aba Dados para separar a ficha por profissional.</p> : null}
      {profs.map((p, i) => (
        <ProfessionalBlock key={p.id} art={art} p={p} index={i} />
      ))}
      {orphan.length > 0 ? (
        <section aria-label="Atividades sem profissional" className="rounded-lg border border-border bg-white p-4">
          <h3 className="text-sm font-semibold text-stone-900">Atividades sem profissional atribuído</h3>
          <ul className="mt-2 space-y-1 text-xs">
            {orphan.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>
                  {DISCIPLINE_LABEL[a.discipline]}: {a.activity} ({a.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {a.unit})
                </span>
                <Button variant="ghost" size="sm" onClick={() => void copy(activityText(a), 'Atividade')}>
                  <Copy /> Copiar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
