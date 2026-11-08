'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, FastForward } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@chalecad/ui';
import type { Project } from '@chalecad/engine';
import { DEFAULT_ANSWERS, suggestedBedrooms, type WizardAnswers } from '@/lib/project/wizard/answers';
import { visibleQuestions } from '@/lib/project/wizard/questions';
import { QuestionStep } from './QuestionStep';
import { ResultStep } from './ResultStep';

/** Chave de sessionStorage: quem abre o editor pede o assistente já na aba "Me ajude a montar". */
export const WIZARD_FLAG = 'chalecad:open-wizard';

export const READY_TOAST = 'Seu chalé está pronto. Mude o que quiser: tudo recalcula na hora.';

/** Estado e telas do assistente (sem moldura): usado dentro do "Novo projeto" e no diálogo avulso. */
export function WizardPanel({ onCreate, footerExtra, active = true }: { onCreate: (p: Project) => void; footerExtra?: React.ReactNode; active?: boolean }) {
  const [answers, setAnswers] = useState<WizardAnswers>(DEFAULT_ANSWERS);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [bedroomsTouched, setBedroomsTouched] = useState(false);
  const [creating, setCreating] = useState(false);

  const questions = useMemo(() => visibleQuestions(answers), [answers]);
  const onResult = step >= questions.length;
  const q = questions[Math.min(step, questions.length - 1)]!;

  useEffect(() => {
    if (active) return;
    setStep(0);
  }, [active]);

  const patch = useCallback((p: Partial<WizardAnswers>) => {
    setAnswers((cur) => {
      const next = { ...cur, ...p };
      // quartos acompanham as pessoas até a pessoa mexer neles
      if ('people' in p && !('bedrooms' in p) && !bedroomsTouched) next.bedrooms = suggestedBedrooms(next.people);
      return next;
    });
  }, [bedroomsTouched]);

  const create = (p: Project) => {
    setCreating(true);
    onCreate(p);
    // a tela do editor avisa que criou; aqui trocamos pelo recado para quem não entende de construção
    setTimeout(() => {
      toast.dismiss();
      toast.success(READY_TOAST);
      setCreating(false);
    }, 900);
  };

  const progress = Math.round(((onResult ? questions.length : step + 1) / (questions.length + 1)) * 100);

  return (
    <>
      <div className="px-6">
        <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
          <span>{onResult ? 'Resultado' : `Pergunta ${step + 1} de ${questions.length}`}</span>
          <span className="tabular-nums">{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Andamento do assistente">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="max-h-[62vh] min-h-[19rem] overflow-y-auto px-6 pt-4 pb-2">
        {onResult ? (
          <ResultStep a={answers} name={name} onName={setName} onApply={(next) => setAnswers(next)} onCreate={create} onBack={() => setStep(Math.max(0, questions.length - 1))} creating={creating} />
        ) : (
          <QuestionStep key={q.id} q={q} a={answers} patch={patch} onBedroomsEdited={() => setBedroomsTouched(true)} />
        )}
      </div>
      {!onResult ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-4">
          {footerExtra}
          <Button variant="ghost" className="mr-auto" onClick={() => setStep(questions.length)}>
            <FastForward /> Pular para o resultado
          </Button>
          {step > 0 ? (
            <Button variant="outline" size="lg" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Voltar
            </Button>
          ) : null}
          <Button variant="accent" size="lg" onClick={() => setStep(step + 1)}>
            Próximo <ArrowRight />
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** Assistente "Me ajude a montar" como diálogo avulso. */
export function WizardDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; onCreate: (p: Project) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-4 p-0 pt-6">
        <DialogHeader className="px-6">
          <DialogTitle>Me ajude a montar</DialogTitle>
          <DialogDescription>Responda perguntas simples e montamos um chalé completo para você.</DialogDescription>
        </DialogHeader>
        {open ? <WizardPanel onCreate={onCreate} /> : null}
      </DialogContent>
    </Dialog>
  );
}
