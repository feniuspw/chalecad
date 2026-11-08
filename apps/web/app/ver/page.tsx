import type { Metadata } from 'next';
import { ViewerPage } from '@/components/viewer/ViewerPage';

export const metadata: Metadata = { title: 'Ver projeto' };

export default function Page() {
  return <ViewerPage />;
}
