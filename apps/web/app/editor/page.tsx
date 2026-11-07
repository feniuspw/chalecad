import type { Metadata } from 'next';
import { EditorShell } from '@/components/editor/EditorShell';
import { gableModel } from '@/fixtures';

export const metadata: Metadata = { title: 'Editor' };

export default function EditorPage() {
  return <EditorShell model={gableModel} />;
}
