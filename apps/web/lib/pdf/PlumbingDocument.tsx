/** Documento PDF da hidráulica (@react-pdf/renderer, Helvetica). Todo texto vem de `PlumbingPdf`. */
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { PlumbingPdf } from './plumbing';

export interface PlumbingDocumentProps {
  data: PlumbingPdf;
  images: { title: string; src: string; aspect: number }[];
}

const C = { ink: '#1c1917', text: '#44403c', muted: '#78716c', line: '#e7e5e4', soft: '#fafaf9', sunken: '#f5f5f4', accent: '#d97706', accentDark: '#92400e', accentSoft: '#fef3c7', ok: '#15803d', fail: '#b91c1c' };

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: C.text, paddingTop: 46, paddingBottom: 70, paddingHorizontal: 42, lineHeight: 1.35 },
  head: { position: 'absolute', top: 20, left: 42, right: 42, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: C.muted, borderBottomWidth: 0.5, borderBottomColor: C.line, paddingBottom: 5 },
  brand: { fontFamily: 'Helvetica-Bold', color: C.ink },
  footer: { position: 'absolute', bottom: 24, left: 42, right: 42, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 6, fontSize: 7, color: C.accentDark },
  h1: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.ink, marginBottom: 4 },
  sub: { fontSize: 9, color: C.muted, marginBottom: 10 },
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, color: C.ink, marginTop: 14, marginBottom: 6 },
  table: { borderWidth: 0.6, borderColor: C.line, borderRadius: 3 },
  thead: { flexDirection: 'row', backgroundColor: C.sunken, borderBottomWidth: 0.6, borderBottomColor: C.line },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7.2, color: C.muted, paddingVertical: 4, paddingHorizontal: 4, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: C.line },
  td: { paddingVertical: 3, paddingHorizontal: 4, fontSize: 8.2 },
  kv: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 0.4, borderBottomColor: C.line },
  kvl: { flex: 1, color: C.muted },
  kvv: { flex: 2, color: C.ink },
  fig: { alignItems: 'center', marginTop: 6 },
  img: { borderWidth: 0.6, borderColor: C.line },
  cap: { fontSize: 7.5, color: C.muted, marginTop: 4 },
});

const W = { fixture: 26, level: 12, mca: 10, kpa: 10, min: 15, status: 12, adjust: 15 };

function Frame({ title, children, art }: { title: string; children: React.ReactNode; art: string }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.head} fixed>
        <Text style={s.brand}>ChaléCAD</Text>
        <Text>{title}</Text>
      </View>
      {children}
      <Text style={s.footer} fixed>
        Aviso importante: {art}
      </Text>
    </Page>
  );
}

export function PlumbingDocument({ data, images }: PlumbingDocumentProps) {
  const maxW = 510;
  return (
    <Document title={data.title} author="ChaléCAD">
      {images.map((im, i) => (
        <Frame key={im.title} title={data.title} art={data.disclaimer}>
          {i === 0 ? <Text style={s.h1}>Planta hidráulica</Text> : null}
          {i === 0 ? <Text style={s.sub}>{data.dateText} · água fria (azul), água quente (vermelho), esgoto (marrom, com setas e declividade) e ventilação (verde tracejado). Selos verdes atendem a pressão mínima; vermelhos não.</Text> : null}
          <View style={s.fig}>
            <Image src={im.src} style={{ ...s.img, width: maxW, height: Math.min(maxW / im.aspect, 560) }} />
            <Text style={s.cap}>{im.title}</Text>
          </View>
        </Frame>
      ))}
      <Frame title={data.title} art={data.disclaimer}>
        <Text style={s.h1}>Pressão por ponto de água</Text>
        <Text style={s.sub}>{data.summary}</Text>
        <View style={s.table}>
          <View style={s.thead}>
            {(['Aparelho', 'Nível', 'm.c.a.', 'kPa', 'Mínimo', 'Situação', 'Ajuste'] as const).map((h, i) => (
              <Text key={h} style={[s.th, { flex: Object.values(W)[i]! }, i >= 2 && i <= 4 ? { textAlign: 'right' } : {}]}>
                {h}
              </Text>
            ))}
          </View>
          {data.pressure.map((r, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={[s.td, { flex: W.fixture }]}>
                {r.fixture} ({r.system.toLowerCase()})
              </Text>
              <Text style={[s.td, { flex: W.level }]}>{r.level}</Text>
              <Text style={[s.td, { flex: W.mca, textAlign: 'right' }]}>{r.mca}</Text>
              <Text style={[s.td, { flex: W.kpa, textAlign: 'right' }]}>{r.kpa}</Text>
              <Text style={[s.td, { flex: W.min, textAlign: 'right' }]}>{r.min}</Text>
              <Text style={[s.td, { flex: W.status, color: r.ok ? C.ok : C.fail, fontFamily: 'Helvetica-Bold' }]}>{r.status}</Text>
              <Text style={[s.td, { flex: W.adjust }]}>{r.adjust}</Text>
            </View>
          ))}
        </View>
        <Text style={s.h2}>Caixa d’água e esgoto</Text>
        <View style={s.table}>
          {data.tank.map((r) => (
            <View key={r.label} style={s.kv}>
              <Text style={s.kvl}>{r.label}</Text>
              <Text style={s.kvv}>{r.value}</Text>
            </View>
          ))}
        </View>
        <Text style={s.h2}>Tubos de água</Text>
        <View style={s.table}>
          <View style={s.thead}>
            {['Tubo', 'Sistema', 'DN', 'Vazão', 'Velocidade', 'Perda'].map((h) => (
              <Text key={h} style={[s.th, { flex: 1 }]}>
                {h}
              </Text>
            ))}
          </View>
          {data.pipes.map((p, i) => (
            <View key={i} style={s.tr} wrap={false}>
              {[p.id, p.system, p.dn, p.flow, p.velocity, p.loss].map((v, j) => (
                <Text key={j} style={[s.td, { flex: 1 }]}>
                  {v}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </Frame>
    </Document>
  );
}

export const plumbingPdfElement = (props: PlumbingDocumentProps) => PlumbingDocument(props);
