/** Documento PDF do ChaléCAD (@react-pdf/renderer, fonte Helvetica embutida). Todo texto vem de `PdfData`. */
import type { ReactNode } from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Alert, PdfData } from '../../lib/pdf/data';

export interface PdfImage {
  title: string;
  caption?: string;
  /** Data URL PNG. */
  src: string;
  /** Proporção largura / altura. */
  aspect: number;
}

export interface ChaleDocumentProps {
  data: PdfData;
  plans: PdfImage[];
  elevations: PdfImage[];
}

const C = {
  ink: '#1c1917',
  text: '#44403c',
  muted: '#78716c',
  line: '#e7e5e4',
  soft: '#fafaf9',
  sunken: '#f5f5f4',
  accent: '#d97706',
  accentDark: '#92400e',
  accentSoft: '#fef3c7',
  fail: '#b91c1c',
  failSoft: '#fee2e2',
  warn: '#b45309',
  warnSoft: '#fef3c7',
  info: '#57534e',
  infoSoft: '#f5f5f4',
};

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: C.text, paddingTop: 46, paddingBottom: 84, paddingHorizontal: 42, lineHeight: 1.35 },
  // cabeçalho corrente
  runHead: { position: 'absolute', top: 20, left: 42, right: 42, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: C.muted, borderBottomWidth: 0.5, borderBottomColor: C.line, paddingBottom: 5 },
  runBrand: { fontFamily: 'Helvetica-Bold', color: C.ink },
  // rodapé corrente
  footer: { position: 'absolute', top: 786, left: 42, right: 42, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 6, flexDirection: 'row' },
  footerArt: { flex: 1, paddingRight: 14, fontSize: 7, color: C.accentDark, lineHeight: 1.3 },
  footerArtBold: { fontFamily: 'Helvetica-Bold' },
  footerPage: { fontSize: 7.5, color: C.muted, width: 70, textAlign: 'right' },
  // capa
  coverBand: { backgroundColor: C.ink, marginHorizontal: -42, marginTop: -46, paddingHorizontal: 42, paddingTop: 40, paddingBottom: 34 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 56 },
  brandMark: { width: 22, height: 22, borderRadius: 5, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 12 },
  brandName: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 13 },
  eyebrow: { color: '#fbbf24', fontSize: 8, letterSpacing: 1.6, fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  coverTitle: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 30, lineHeight: 1.2 },
  coverSub: { color: '#d6d3d1', fontSize: 12, marginTop: 8 },
  coverDate: { color: '#a8a29e', fontSize: 9, marginTop: 20 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 26 },
  kpi: { width: '48.6%', borderWidth: 0.8, borderColor: C.line, borderRadius: 6, padding: 12, backgroundColor: C.soft },
  kpiLabel: { marginBottom: 2, fontSize: 7.5, color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold' },
  kpiValue: { fontSize: 19, lineHeight: 1.2, color: C.ink, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  kpiHint: { fontSize: 8, color: C.muted, marginTop: 3 },
  artBox: { marginTop: 22, borderWidth: 1, borderColor: C.accent, borderLeftWidth: 5, backgroundColor: C.accentSoft, borderRadius: 4, padding: 12 },
  artTitle: { fontFamily: 'Helvetica-Bold', color: C.accentDark, fontSize: 10, marginBottom: 4 },
  artText: { color: C.accentDark, fontSize: 8.8, lineHeight: 1.45 },
  coverFoot: { marginTop: 'auto', fontSize: 7.5, color: C.muted },
  // seções
  h1: { fontFamily: 'Helvetica-Bold', fontSize: 17, lineHeight: 1.2, color: C.ink, marginBottom: 5 },
  h1Sub: { fontSize: 9, color: C.muted, marginBottom: 14 },
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, color: C.ink, marginTop: 16, marginBottom: 6 },
  rule: { height: 2.5, width: 34, backgroundColor: C.accent, marginBottom: 9, borderRadius: 1 },
  // tabelas
  table: { borderWidth: 0.6, borderColor: C.line, borderRadius: 3 },
  thead: { flexDirection: 'row', backgroundColor: C.sunken, borderBottomWidth: 0.6, borderBottomColor: C.line },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: C.muted, paddingVertical: 4, paddingHorizontal: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: C.line },
  trAlt: { backgroundColor: C.soft },
  td: { paddingVertical: 3.2, paddingHorizontal: 5, fontSize: 8.3 },
  tfoot: { flexDirection: 'row', backgroundColor: C.accentSoft },
  tfootText: { fontFamily: 'Helvetica-Bold', color: C.accentDark },
  right: { textAlign: 'right' },
  kv: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 6, borderBottomWidth: 0.4, borderBottomColor: C.line },
  kvLabel: { flex: 1.5, color: C.muted, paddingRight: 6 },
  kvValue: { flex: 1, color: C.ink },
  twoCol: { flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  // figuras
  figure: { alignItems: 'center' },
  figureImg: { borderWidth: 0.6, borderColor: C.line },
  caption: { fontSize: 7.5, color: C.muted, marginTop: 4, textAlign: 'center' },
  // alertas
  alert: { flexDirection: 'row', gap: 7, borderRadius: 3, padding: 7, marginBottom: 5 },
  alertTag: { fontFamily: 'Helvetica-Bold', fontSize: 7, width: 40, paddingTop: 1 },
  alertText: { flex: 1, fontSize: 8.6 },
  q: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  qN: { width: 14, fontFamily: 'Helvetica-Bold', color: C.accentDark },
});

const sev = {
  fail: { bg: C.failSoft, fg: C.fail, label: 'CRÍTICO' },
  warn: { bg: C.warnSoft, fg: C.warn, label: 'ATENÇÃO' },
  info: { bg: C.infoSoft, fg: C.info, label: 'INFO' },
} as const;

function RunningHead({ title }: { title: string }) {
  return (
    <View style={s.runHead} fixed>
      <Text style={s.runBrand}>ChaléCAD</Text>
      <Text>{title}</Text>
    </View>
  );
}

function Footer({ art }: { art: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerArt} fixed>
        <Text style={s.footerArtBold}>Aviso importante: </Text>
        {art}
      </Text>
      <Text style={s.footerPage} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} fixed />
    </View>
  );
}

function Section({ title, sub, children, data, wrap = true }: { title: string; sub?: string; children: ReactNode; data: PdfData; wrap?: boolean }) {
  return (
    <Page size="A4" style={s.page} wrap={wrap}>
      <RunningHead title={data.title} />
      <View style={s.rule} />
      <Text style={s.h1}>{title}</Text>
      {sub ? <Text style={s.h1Sub}>{sub}</Text> : <View style={{ height: 10 }} />}
      {children}
      <Footer art={data.disclaimer} />
    </Page>
  );
}

function KeyValues({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <View style={s.table}>
      {rows.map((r, i) => (
        <View key={r.label + i} style={[s.kv, i === rows.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
          <Text style={s.kvLabel}>{r.label}</Text>
          <Text style={s.kvValue}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

function AlertBox({ a }: { a: Alert }) {
  const v = sev[a.severity];
  return (
    <View style={[s.alert, { backgroundColor: v.bg }]} wrap={false}>
      <Text style={[s.alertTag, { color: v.fg }]}>{v.label}</Text>
      <Text style={[s.alertText, { color: C.ink }]}>{a.text}</Text>
    </View>
  );
}

function Figure({ img, width, maxHeight }: { img: PdfImage; width: number; maxHeight: number }) {
  const w = Math.min(width, maxHeight * img.aspect);
  return (
    <View style={s.figure} wrap={false}>
      <Image src={img.src} style={[s.figureImg, { width: w, height: w / img.aspect }]} />
      {img.caption ? <Text style={s.caption}>{img.caption}</Text> : null}
    </View>
  );
}

const MAT_COLS = [
  { key: 'name', label: 'Item', flex: 4.2 },
  { key: 'qty', label: 'Qtd.', flex: 1, right: true },
  { key: 'unit', label: 'Unidade', flex: 2.3 },
  { key: 'waste', label: 'Perda', flex: 0.9, right: true },
  { key: 'unitPrice', label: 'Preço unit.', flex: 1.6, right: true },
  { key: 'subtotal', label: 'Subtotal', flex: 1.7, right: true },
] as const;

const ROOM_COLS = [
  { key: 'name', label: 'Cômodo', flex: 2.2 },
  { key: 'use', label: 'Uso', flex: 1.6 },
  { key: 'area', label: 'Área', flex: 1.2, right: true },
  { key: 'ceilingAvg', label: 'Pé-direito médio', flex: 1.5, right: true },
  { key: 'floor', label: 'Piso', flex: 3 },
  { key: 'walls', label: 'Paredes', flex: 3 },
] as const;

const INST_COLS = [
  { key: 'n', label: 'Nº', flex: 0.6 },
  { key: 'kind', label: 'Tipo', flex: 2.4 },
  { key: 'label', label: 'Rótulo', flex: 3 },
  { key: 'points', label: 'Pontos', flex: 1, right: true },
  { key: 'power', label: 'Potência', flex: 1.5, right: true },
  { key: 'wire', label: 'Cabo', flex: 1.3, right: true },
  { key: 'breaker', label: 'Disjuntor', flex: 1.3, right: true },
] as const;

const LOAD_COLS = [
  { key: 'n', label: 'Nº', flex: 0.5 },
  { key: 'name', label: 'Circuito', flex: 3.2 },
  { key: 'va', label: 'VA', flex: 1, right: true },
  { key: 'amp', label: 'A', flex: 0.8, right: true },
  { key: 'section', label: 'Seção', flex: 1.2, right: true },
  { key: 'breaker', label: 'Disjuntor', flex: 1.4, right: true },
  { key: 'dr', label: 'DR', flex: 0.7, right: true },
  { key: 'drop', label: 'Queda', flex: 1, right: true },
  { key: 'length', label: 'Comp.', flex: 1, right: true },
] as const;

const PERF_COLS = [
  { key: 'element', label: 'Elemento', flex: 2.2 },
  { key: 'u', label: 'U', flex: 1.6, right: true },
  { key: 'limitU', label: 'Limite U', flex: 1.2, right: true },
  { key: 'ct', label: 'CT', flex: 1.7, right: true },
  { key: 'limitCT', label: 'Limite CT', flex: 1.5, right: true },
  { key: 'status', label: 'Status', flex: 1.4, right: true },
] as const;

function MatRow({ r, i }: { r: Record<(typeof MAT_COLS)[number]['key'], string>; i: number }) {
  return (
    <View style={[s.tr, i % 2 ? s.trAlt : {}]} wrap={false}>
      {MAT_COLS.map((c) => (
        <Text key={c.key} style={[s.td, { flex: c.flex }, 'right' in c ? s.right : {}]}>
          {r[c.key]}
        </Text>
      ))}
    </View>
  );
}

export function ChaleDocument({ data, plans, elevations }: ChaleDocumentProps) {
  const A4_W = 595 - 84;
  return (
    <Document title={`${data.title} — ChaléCAD`} author="ChaléCAD" subject="Plantas, lista de materiais e orçamento" creator="ChaléCAD" producer="ChaléCAD">
      {/* Capa */}
      <Page size="A4" style={s.page}>
        <View style={s.coverBand}>
          <View style={s.brandRow}>
            <View style={s.brandMark}>
              <Text style={s.brandMarkText}>C</Text>
            </View>
            <Text style={s.brandName}>ChaléCAD</Text>
          </View>
          <Text style={s.eyebrow}>PROJETO · PLANTAS · LISTA DE MATERIAIS · ORÇAMENTO</Text>
          <Text style={s.coverTitle}>{data.title}</Text>
          <Text style={s.coverSub}>
            {data.typologyLabel} · {data.systemLabel} · {data.region}
          </Text>
          <Text style={s.coverDate}>Gerado em {data.dateLabel}</Text>
        </View>

        <View style={s.kpiGrid}>
          {data.kpis.map((k) => (
            <View key={k.label} style={s.kpi} wrap={false}>
              <Text style={s.kpiLabel}>{k.label}</Text>
              <Text style={s.kpiValue}>{k.value}</Text>
              {k.hint ? <Text style={s.kpiHint}>{k.hint}</Text> : null}
            </View>
          ))}
        </View>

        <View style={s.artBox} wrap={false}>
          <Text style={s.artTitle}>NÃO SUBSTITUI PROJETO ESTRUTURAL COM ART</Text>
          <Text style={s.artText}>{data.artNotice}</Text>
        </View>

        <Text style={s.coverFoot}>{data.versions}</Text>
        <Footer art={data.disclaimer} />
      </Page>

      {/* Resumo e quadro de áreas */}
      <Section title="Quadro de áreas e resumo" sub="Dimensões principais e áreas calculadas pelo motor do ChaléCAD." data={data}>
        <View style={s.twoCol}>
          <View style={s.col}>
            <Text style={[s.h2, { marginTop: 0 }]}>Quadro de áreas</Text>
            <KeyValues rows={data.areas} />
          </View>
          <View style={s.col}>
            <Text style={[s.h2, { marginTop: 0 }]}>Dimensões do projeto</Text>
            <KeyValues rows={data.dimensions} />
          </View>
        </View>
        {data.rooms.length > 0 ? (
          <View wrap={false}>
            <Text style={s.h2}>Cômodos</Text>
            <View style={s.thead}>
              {ROOM_COLS.map((c) => (
                <Text key={c.key} style={[s.th, { flex: c.flex }, 'right' in c ? s.right : {}]}>
                  {c.label}
                </Text>
              ))}
            </View>
            {data.rooms.map((r, i) => (
              <View key={i} style={[s.tr, i % 2 ? s.trAlt : {}]}>
                {ROOM_COLS.map((c) => (
                  <Text key={c.key} style={[s.td, { flex: c.flex }, 'right' in c ? s.right : {}]}>
                    {r[c.key]}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ) : null}
        <Text style={s.h2}>Orçamento resumido</Text>
        <KeyValues rows={data.budget.totals.map((t) => ({ label: t.label, value: t.value }))} />
      </Section>

      {/* Plantas: uma por página */}
      {plans.map((p, i) => (
        <Section key={`plan-${i}`} title={p.title} sub="Cotas em metros, medidas nas faces externas das paredes." data={data}>
          <Figure img={p} width={A4_W} maxHeight={600} />
        </Section>
      ))}

      {/* Fachadas */}
      {elevations.length > 0 ? (
        <Section title="Fachadas" sub="Vistas frontal e lateral, com cotas de altura e níveis." data={data}>
          <View style={{ gap: 14 }}>
            {elevations.map((e, i) => (
              <Figure key={`el-${i}`} img={e} width={A4_W - 30} maxHeight={300} />
            ))}
          </View>
        </Section>
      ) : null}

      {/* Lista de materiais */}
      <Section title="Lista de materiais por etapa" sub="Quantidades de compra já com perdas e arredondamento para unidade inteira." data={data}>
        {data.materials.map((st) => (
          <View key={st.stage} style={{ marginBottom: 14 }}>
            <View wrap={false}>
              <Text style={[s.h2, { marginTop: 0 }]}>{st.title}</Text>
              <View style={s.thead}>
                {MAT_COLS.map((c) => (
                  <Text key={c.key} style={[s.th, { flex: c.flex }, 'right' in c ? s.right : {}]}>
                    {c.label}
                  </Text>
                ))}
              </View>
              {st.rows.slice(0, 2).map((r, i) => (
                <MatRow key={i} r={r} i={i} />
              ))}
            </View>
            <View style={[s.table, { borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
              {st.rows.slice(2).map((r, i) => (
                <MatRow key={i} r={r} i={i + 2} />
              ))}
              <View style={s.tfoot} wrap={false}>
                <Text style={[s.td, s.tfootText, { flex: 8.4 }]}>
                  Subtotal de materiais · {st.title} ({st.weight})
                </Text>
                <Text style={[s.td, s.tfootText, s.right, { flex: 1.7 }]}>{st.subtotal}</Text>
              </View>
            </View>
          </View>
        ))}
      </Section>

      {/* Orçamento por etapa */}
      <Section title="Orçamento por etapa" sub="Valores em reais. A faixa vai do menor ao maior preço pesquisado." data={data}>
        <View style={s.table}>
          <View style={s.thead}>
            {['Etapa', 'Materiais', 'Mão de obra', 'Frete', 'Total', 'Faixa (mín. a máx.)'].map((h, i) => (
              <Text key={h} style={[s.th, { flex: i === 0 ? 2.2 : i === 5 ? 2.6 : 1.5 }, i > 0 ? s.right : {}]}>
                {h}
              </Text>
            ))}
          </View>
          {data.budget.rows.map((r, i) => (
            <View key={r.title} style={[s.tr, i % 2 ? s.trAlt : {}]} wrap={false}>
              <Text style={[s.td, { flex: 2.2, color: C.ink }]}>{r.title}</Text>
              <Text style={[s.td, s.right, { flex: 1.5 }]}>{r.material}</Text>
              <Text style={[s.td, s.right, { flex: 1.5, color: r.diy ? C.muted : C.text }]}>{r.labor}</Text>
              <Text style={[s.td, s.right, { flex: 1.5 }]}>{r.freight}</Text>
              <Text style={[s.td, s.right, { flex: 1.5, fontFamily: 'Helvetica-Bold', color: C.ink }]}>{r.total}</Text>
              <Text style={[s.td, s.right, { flex: 2.6, color: C.muted }]}>{r.range}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 14, alignSelf: 'flex-end', width: 260 }} wrap={false}>
          <View style={s.table}>
            {data.budget.totals.map((t, i) => (
              <View key={t.label} style={[s.kv, t.strong ? { backgroundColor: C.accentSoft } : {}, i === data.budget.totals.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                <Text style={[s.kvLabel, t.strong ? { fontFamily: 'Helvetica-Bold', color: C.accentDark } : {}]}>{t.label}</Text>
                <Text style={[{ flex: 1, textAlign: 'right', color: C.ink }, t.strong ? { fontFamily: 'Helvetica-Bold', fontSize: 11, color: C.accentDark } : {}]}>{t.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {data.budget.schedule.length > 0 ? (
          <View wrap={false}>
            <Text style={s.h2}>Desembolso por semana</Text>
            <View style={[s.table, { width: 260 }]}>
              {data.budget.schedule.map((w, i) => (
                <View key={w.label} style={[s.kv, i === data.budget.schedule.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                  <Text style={s.kvLabel}>{w.label}</Text>
                  <Text style={{ flex: 1, textAlign: 'right', color: C.ink }}>{w.amount}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </Section>

      {/* Cronograma e compras */}
      {data.work ? (
        <Section title="Cronograma e compras" sub="Acompanhamento da obra: etapas com datas e o que ainda falta comprar." data={data}>
          <KeyValues rows={data.work.summary} />
          <Text style={s.h2}>Cronograma</Text>
          <View style={s.table}>
            <View style={s.thead}>
              {['Etapa', 'Início', 'Fim', 'Duração', 'Situação'].map((h, i) => (
                <Text key={h} style={[s.th, { flex: i === 0 ? 2.4 : 1.5 }, i > 0 ? s.right : {}]}>
                  {h}
                </Text>
              ))}
            </View>
            {data.work.schedule.map((r, i) => (
              <View key={r.stage} style={[s.tr, i % 2 ? s.trAlt : {}]} wrap={false}>
                <Text style={[s.td, { flex: 2.4, color: C.ink }]}>{r.stage}</Text>
                <Text style={[s.td, s.right, { flex: 1.5 }]}>{r.start}</Text>
                <Text style={[s.td, s.right, { flex: 1.5 }]}>{r.end}</Text>
                <Text style={[s.td, s.right, { flex: 1.5 }]}>{r.weeks}</Text>
                <Text style={[s.td, s.right, { flex: 1.5 }]}>{r.done ? 'Concluída' : 'Pendente'}</Text>
              </View>
            ))}
          </View>
          <Text style={s.h2}>Falta comprar ({data.work.bought})</Text>
          {data.work.toBuy.length === 0 ? <Text style={s.caption}>Todos os itens já foram comprados.</Text> : null}
          {data.work.toBuy.map((g) => (
            <View key={g.stage} style={[s.table, { marginBottom: 8 }]}>
              <View style={s.thead} wrap={false}>
                <Text style={[s.th, { flex: 4.2 }]}>{g.stage}</Text>
                <Text style={[s.th, s.right, { flex: 1.6 }]}>Qtd.</Text>
                <Text style={[s.th, s.right, { flex: 1.6 }]}>Estimado</Text>
                <Text style={[s.th, s.right, { flex: 2.4 }]}>Comprar até</Text>
              </View>
              {g.rows.map((r, i) => (
                <View key={r.name + i} style={[s.tr, i % 2 ? s.trAlt : {}]} wrap={false}>
                  <Text style={[s.td, { flex: 4.2 }]}>{r.name}</Text>
                  <Text style={[s.td, s.right, { flex: 1.6 }]}>{r.qty}</Text>
                  <Text style={[s.td, s.right, { flex: 1.6 }]}>{r.estimated}</Text>
                  <Text style={[s.td, s.right, { flex: 2.4, color: r.overdue ? C.fail : C.text }]}>{r.overdue ? `${r.by} (atrasado)` : r.by}</Text>
                </View>
              ))}
            </View>
          ))}
        </Section>
      ) : null}

      {/* Instalações */}
      {data.installations ? (
        <Section title="Instalações (estimativa)" sub="Quadro de circuitos e totais pelos mínimos da NBR 5410/5626." data={data}>
          {data.installations.electrical ? (
            <>
              <Text style={s.h2}>Quadro de cargas (NBR 5410)</Text>
              <View style={s.table}>
                <View style={s.thead}>
                  {LOAD_COLS.map((c) => (
                    <Text key={c.key} style={[s.th, { flex: c.flex }, 'right' in c ? s.right : {}]}>
                      {c.label}
                    </Text>
                  ))}
                </View>
                {data.installations.electrical.loads.map((r, i) => (
                  <View key={i} style={[s.tr, i % 2 ? s.trAlt : {}]} wrap={false}>
                    {LOAD_COLS.map((c) => (
                      <Text key={c.key} style={[s.td, { flex: c.flex }, 'right' in c ? s.right : {}, r.fail ? { color: C.fail } : {}]}>
                        {r[c.key]}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
              <View style={s.twoCol} wrap={false}>
                <View style={s.col}>
                  <Text style={s.h2}>Quadro e demanda</Text>
                  <KeyValues rows={data.installations.electrical.panel} />
                </View>
                <View style={s.col}>
                  <Text style={s.h2}>Iluminação por cômodo</Text>
                  <KeyValues rows={data.installations.electrical.lighting.map((l) => ({ label: l.room, value: `${l.lux} (alvo ${l.target}) · ${l.status}` }))} />
                </View>
              </View>
            </>
          ) : (
            <View style={s.table}>
              <View style={s.thead}>
                {INST_COLS.map((c) => (
                  <Text key={c.key} style={[s.th, { flex: c.flex }, 'right' in c ? s.right : {}]}>
                    {c.label}
                  </Text>
                ))}
              </View>
              {data.installations.circuits.map((r, i) => (
                <View key={i} style={[s.tr, i % 2 ? s.trAlt : {}]} wrap={false}>
                  {INST_COLS.map((c) => (
                    <Text key={c.key} style={[s.td, { flex: c.flex }, 'right' in c ? s.right : {}]}>
                      {r[c.key]}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          )}
          <View style={s.twoCol} wrap={false}>
            <View style={s.col}>
              <Text style={s.h2}>Totais</Text>
              <KeyValues rows={data.installations.totals} />
            </View>
            {data.installations.cost.length > 0 ? (
              <View style={s.col}>
                <Text style={s.h2}>Custo da etapa</Text>
                <KeyValues rows={data.installations.cost} />
              </View>
            ) : null}
          </View>
          <Text style={[s.caption, { textAlign: 'left', marginTop: 12 }]}>{data.installations.notice}</Text>
        </Section>
      ) : null}

      {/* Desempenho */}
      {data.performance ? (
        <Section title="Desempenho" sub={`Térmico (NBR 15575), energia solar e água de chuva. ${data.performance.zone}.`} data={data}>
          <View style={s.table}>
            <View style={s.thead}>
              {PERF_COLS.map((c) => (
                <Text key={c.key} style={[s.th, { flex: c.flex }, 'right' in c ? s.right : {}]}>
                  {c.label}
                </Text>
              ))}
            </View>
            {data.performance.thermal.map((r, i) => (
              <View key={i} style={[s.tr, i % 2 ? s.trAlt : {}]} wrap={false}>
                {PERF_COLS.map((c) => (
                  <Text key={c.key} style={[s.td, { flex: c.flex }, 'right' in c ? s.right : {}, c.key === 'status' && r.fail ? { color: C.fail } : {}]}>
                    {r[c.key]}
                  </Text>
                ))}
              </View>
            ))}
          </View>
          {data.performance.solar || data.performance.rain ? (
            <View style={s.twoCol} wrap={false}>
              {data.performance.solar ? (
                <View style={s.col}>
                  <Text style={s.h2}>Energia solar</Text>
                  <KeyValues rows={data.performance.solar} />
                </View>
              ) : null}
              {data.performance.rain ? (
                <View style={s.col}>
                  <Text style={s.h2}>Água de chuva</Text>
                  <KeyValues rows={data.performance.rain} />
                </View>
              ) : null}
            </View>
          ) : null}
          <Text style={[s.caption, { textAlign: 'left', marginTop: 12 }]}>{data.performance.notice}</Text>
        </Section>
      ) : null}

      {/* Alertas */}
      <Section title="Alertas e pontos de atenção" sub="O que o motor identificou e o que vale conversar com o engenheiro." data={data}>
        {data.alerts.length > 0 ? data.alerts.map((a, i) => <AlertBox key={i} a={a} />) : <Text>Nenhum alerta registrado para este projeto.</Text>}
        {data.questions.length > 0 ? (
          <View>
            <Text style={s.h2}>Perguntas para o engenheiro</Text>
            {data.questions.map((q, i) => (
              <View key={i} style={s.q} wrap={false}>
                <Text style={s.qN}>{i + 1}.</Text>
                <Text style={{ flex: 1 }}>{q}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Section>

      {/* Premissas */}
      <Section title="Premissas" sub="Tudo o que foi assumido no cálculo: perfis, espaçamentos, composições, cargas e base de preços." data={data}>
        {data.premises.map((g) => (
          <View key={g.group} wrap={false} style={{ marginBottom: 6 }}>
            <Text style={s.h2}>{g.group}</Text>
            <KeyValues rows={g.items} />
          </View>
        ))}
        <View style={[s.artBox, { marginTop: 18 }]} wrap={false}>
          <Text style={s.artTitle}>Antes de construir</Text>
          <Text style={s.artText}>{data.artNotice}</Text>
        </View>
        <Text style={[s.coverFoot, { marginTop: 10 }]}>{data.versions}</Text>
      </Section>
    </Document>
  );
}

/** Elemento <Document> pronto para `pdf()`/`renderToBuffer()` (o componente não usa hooks). */
export const pdfElement = (props: ChaleDocumentProps) => ChaleDocument(props);
