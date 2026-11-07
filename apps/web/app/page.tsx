import Link from 'next/link';
import { ArrowRight, Boxes, Calculator, FileCheck2 } from 'lucide-react';
import { Button } from '@chalecad/ui';
import { Logo } from '@/components/Logo';
import { ArtNotice } from '@/components/ArtNotice';
import { Viewport } from '@/components/scene/Viewport';
import { gableModel } from '@/fixtures';

const highlights = [
  {
    icon: Boxes,
    title: 'Modelo 3D paramétrico',
    text: 'Mude largura, pé-direito ou inclinação e veja o chalé inteiro se ajustar: paredes, aberturas, telhado e mezanino.',
  },
  {
    icon: Calculator,
    title: 'Materiais, peso e orçamento na hora',
    text: 'Lista de compra peça por peça, peso da estrutura e custo por etapa atualizados a cada alteração.',
  },
  {
    icon: FileCheck2,
    title: 'Pacote para o engenheiro',
    text: 'Plantas, lista de materiais e premissas organizadas para levar ao profissional que assina a ART.',
  },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-muted">
      <header className="relative z-20 mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
        <Logo />
        <Button asChild variant="outline" size="sm">
          <Link href="/editor">Abrir o editor</Link>
        </Button>
      </header>

      <main className="flex-1">
        <section className="relative isolate -mt-16 overflow-hidden border-b border-border">
          <div className="scene-sky absolute inset-0 -z-10">
            <div className="absolute inset-y-0 right-0 w-full lg:w-[68%]">
              <Viewport model={gableModel} showcase hoverable={false} />
            </div>
            {/* véu para o texto respirar sobre a cena */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#e6eff3] via-[#e6eff3]/85 to-transparent lg:via-[#e6eff3]/55" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface-muted to-transparent" />
          </div>

          <div className="mx-auto flex min-h-[640px] max-w-7xl items-center px-6 pt-24 pb-20">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-white/70 px-3 py-1 text-xs font-medium text-accent-hover backdrop-blur">
                Light Steel Frame · radier · telha sanduíche
              </span>
              <h1 className="mt-5 text-5xl font-semibold tracking-tight text-stone-900 sm:text-6xl">
                Chalé<span className="text-accent">CAD</span>
              </h1>
              <p className="mt-5 text-xl leading-relaxed text-stone-700 text-balance">
                Desenhe seu chalé em 3D e saiba, na hora, o que comprar, quanto pesa e quanto custa.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild variant="accent" size="lg">
                  <Link href="/editor">
                    Abrir o editor <ArrowRight />
                  </Link>
                </Button>
                <span className="text-sm text-stone-600">Sem cadastro. Comece pelo exemplo de 6,5 × 8,5 m.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid gap-5 md:grid-cols-3">
            {highlights.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-border bg-white p-6 shadow-sm transition-shadow hover:shadow-float">
                <span className="grid size-10 place-items-center rounded-lg bg-accent-soft text-accent-hover">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h2 className="mt-4 text-lg font-semibold tracking-tight text-stone-900">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <ArtNotice />
          <span className="text-xs text-stone-400">ChaléCAD</span>
        </div>
      </footer>
    </div>
  );
}
