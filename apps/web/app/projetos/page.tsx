import type { Metadata } from 'next';
import { ProjectsPage } from '@/components/projects/ProjectsPage';

export const metadata: Metadata = { title: 'Projetos' };

export default function Page() {
  return <ProjectsPage />;
}
