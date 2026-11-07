import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChaléCAD',
  description: 'Desenhe seu chalé em 3D e receba materiais, peso e orçamento na hora.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
