import { describe, expect, it } from 'vitest';
import type { ArtSheet, Professional } from '@chalecad/engine';
import { artSheetText } from './artText';

const prof: Professional = { id: 'p1', name: 'Ana Souza', title: 'Engenheira Civil', council: 'CREA', registry: '123456', uf: 'SP', company: '', companyRegistry: '', disciplines: ['structure'], docNumber: '2026001' };
const art: ArtSheet = {
  owner: { name: 'João', doc: '529.982.247-25', address: 'Rua A, 10' },
  contractor: { name: 'João', doc: '529.982.247-25', address: 'Rua A, 10' },
  siteAddress: 'Rua B, 20 — Campos do Jordão/SP',
  startDate: '2026-12-01',
  activities: [
    { discipline: 'structure', council: 'CREA', activity: 'Projeto estrutural de light steel frame', quantity: 72.5, unit: 'm²', professionalId: 'p1', contractValue: 3500, notes: 'Conforme NBR 14762' },
    { discipline: 'electrical', council: 'any', activity: 'Projeto elétrico', quantity: 8, unit: 'kW', notes: '' },
  ],
  blanks: ['Data de término'],
};

describe('Copiar tudo (ART/RRT)', () => {
  const t = artSheetText(art, [prof]);
  it('traz partes, obra e datas, com vazio marcado', () => {
    expect(t).toContain('Nome: João');
    expect(t).toContain('Endereço: Rua B, 20');
    expect(t).toContain('Início: 01/12/2026');
    expect(t).toContain('Término previsto: (preencher)');
  });
  it('separa por profissional, com número da ART e atividades', () => {
    expect(t).toContain('Profissional: Ana Souza (Engenheira Civil) · CREA 123456/SP');
    expect(t).toContain('Nº da ART: 2026001');
    expect(t).toContain('Quantidade: 72,5 m²');
    expect(t).toContain('Observação: Conforme NBR 14762');
    expect(t).toContain('Atividades sem profissional atribuído');
    expect(t).toContain('Campos ainda vazios: Data de término');
    expect(t).toContain('SICCAU');
  });
  it('só um profissional', () => {
    expect(artSheetText(art, [prof], 'p1')).not.toContain('sem profissional');
  });
});
