'use client';
import Link from 'next/link';
import { Copy, MoreVertical, Pencil, Ruler, Trash2, Wallet } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@chalecad/ui';
import { fmt } from '@/lib/project/format';
import { TYPOLOGY_LABELS } from '@/lib/pdf/labels';
import type { ProjectSummary } from '@/lib/storage';
import { timeAgo } from './time';
import { TYPOLOGY_ART, TYPOLOGY_ICONS } from './typology';

const brl0 = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function ProjectCard({ project, onRename, onDuplicate, onDelete }: { project: ProjectSummary; onRename: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const Icon = TYPOLOGY_ICONS[project.typology] ?? TYPOLOGY_ICONS.gable_mezzanine;
  const Art = TYPOLOGY_ART[project.typology] ?? TYPOLOGY_ART.gable_mezzanine;
  const href = `/editor?id=${encodeURIComponent(project.id)}`;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-float focus-within:ring-2 focus-within:ring-accent/50">
      <Link href={href} className="block outline-none" aria-label={`Abrir ${project.name}`}>
        <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-amber-50 via-stone-50 to-sky-50">
          {project.thumbnail ? (
            <img src={project.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center p-6 text-stone-700 transition-transform duration-300 group-hover:scale-105">
              <div className="h-full w-4/5 max-w-[240px]">
                <Art />
              </div>
            </div>
          )}
        </div>
        <div className="space-y-3 p-4 pb-3">
          <div>
            <h3 className="truncate pr-8 text-[15px] font-semibold tracking-tight text-stone-900">{project.name}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-500">
              <Icon className="size-3.5 text-accent" aria-hidden />
              {TYPOLOGY_LABELS[project.typology] ?? project.typology}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-stone-50 px-2.5 py-1.5">
              <dt className="flex items-center gap-1 text-stone-500">
                <Ruler className="size-3" aria-hidden /> Área
              </dt>
              <dd className="mt-0.5 font-medium text-stone-900">{project.builtArea ? `${fmt(project.builtArea, 1)} m²` : '—'}</dd>
            </div>
            <div className="rounded-lg bg-stone-50 px-2.5 py-1.5">
              <dt className="flex items-center gap-1 text-stone-500">
                <Wallet className="size-3" aria-hidden /> Custo estimado
              </dt>
              <dd className="mt-0.5 font-medium text-stone-900">{project.total ? brl0(project.total) : '—'}</dd>
            </div>
          </dl>
        </div>
      </Link>
      <p className="px-4 pb-3.5 text-xs text-stone-400">Atualizado {timeAgo(project.updatedAt)}</p>

      <div className="absolute top-2.5 right-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Ações de ${project.name}`} className="grid size-8 place-items-center rounded-lg bg-white/90 text-stone-600 shadow-sm outline-none backdrop-blur hover:bg-white hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50">
              <MoreVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={onRename}>
              <Pencil /> Renomear
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy /> Duplicar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-fail focus:text-fail">
              <Trash2 /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
