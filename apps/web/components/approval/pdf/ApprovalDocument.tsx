/** Documento PDF genérico da aprovação (@react-pdf/renderer): cabeçalho da obra, blocos e rodapé com página x/y e o aviso. */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { DocBlock, DocSpec } from '../../../lib/approval/docs';

const C = { ink: '#1c1917', text: '#44403c', muted: '#78716c', line: '#d6d3d1', soft: '#f5f5f4', accent: '#92400e' };

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: C.text, paddingTop: 78, paddingBottom: 64, paddingHorizontal: 42, lineHeight: 1.35 },
  head: { position: 'absolute', top: 22, left: 42, right: 42, borderBottomWidth: 0.6, borderBottomColor: C.line, paddingBottom: 6, fontSize: 7.5, color: C.muted },
  headTop: { flexDirection: 'row', justifyContent: 'space-between' },
  headWork: { fontFamily: 'Helvetica-Bold', color: C.ink, fontSize: 9 },
  foot: { position: 'absolute', bottom: 22, left: 42, right: 42, borderTopWidth: 0.6, borderTopColor: C.line, paddingTop: 5, flexDirection: 'row', fontSize: 7 },
  notice: { flex: 1, paddingRight: 12, color: C.accent },
  pageNo: { width: 60, textAlign: 'right', color: C.muted },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.ink },
  subtitle: { fontSize: 10, color: C.muted, marginTop: 3, marginBottom: 12 },
  h: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: C.ink, marginTop: 12, marginBottom: 4 },
  p: { marginBottom: 5, textAlign: 'justify' },
  kvRow: { flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: C.line, paddingVertical: 3 },
  kvKey: { width: '34%', fontFamily: 'Helvetica-Bold', color: C.ink },
  kvVal: { width: '66%' },
  tHead: { flexDirection: 'row', backgroundColor: C.soft, borderBottomWidth: 0.6, borderBottomColor: C.line },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: C.line },
  tCell: { paddingVertical: 3, paddingHorizontal: 3, fontSize: 8 },
  tHeadCell: { fontFamily: 'Helvetica-Bold', color: C.ink },
});

function Table({ head, rows, widths }: { head: string[]; rows: string[][]; widths?: number[] }) {
  const w = widths && widths.length === head.length ? widths : head.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  const style = (i: number) => ({ width: `${((w[i] ?? 1) / total) * 100}%` });
  return (
    <View style={{ marginBottom: 6 }}>
      <View style={s.tHead} fixed>
        {head.map((h, i) => (
          <Text key={i} style={[s.tCell, s.tHeadCell, style(i)]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={s.tRow} wrap={false}>
          {head.map((_, i) => (
            <Text key={i} style={[s.tCell, style(i)]}>
              {r[i] ?? ''}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Block({ b }: { b: DocBlock }) {
  switch (b.t) {
    case 'h':
      return <Text style={s.h}>{b.text}</Text>;
    case 'p':
      return <Text style={s.p}>{b.text}</Text>;
    case 'kv':
      return (
        <View style={{ marginBottom: 6 }}>
          {b.rows.map(([k, v], i) => (
            <View key={i} style={s.kvRow} wrap={false}>
              <Text style={s.kvKey}>{k}</Text>
              <Text style={s.kvVal}>{v}</Text>
            </View>
          ))}
        </View>
      );
    case 'table':
      return <Table head={b.head} rows={b.rows} {...(b.widths ? { widths: b.widths } : {})} />;
  }
}

export function ApprovalDocument({ spec }: { spec: DocSpec }) {
  return (
    <Document title={spec.title} author="ChaléCAD">
      <Page size="A4" style={s.page}>
        <View style={s.head} fixed>
          <View style={s.headTop}>
            <Text style={s.headWork}>{spec.header.work}</Text>
            <Text>{spec.header.responsible}</Text>
          </View>
          <Text>
            Proprietário: {spec.header.owner} · Obra: {spec.header.address}
          </Text>
        </View>
        <Text style={s.title}>{spec.title}</Text>
        {spec.subtitle ? <Text style={s.subtitle}>{spec.subtitle}</Text> : <View style={{ height: 10 }} />}
        {spec.blocks.map((b, i) => (
          <Block key={i} b={b} />
        ))}
        <View style={s.foot} fixed>
          <Text style={s.notice}>{spec.notice}</Text>
          <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `Página ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Elemento <Document> pronto para `pdf()`. */
export const approvalElement = (spec: DocSpec) => ApprovalDocument({ spec });
