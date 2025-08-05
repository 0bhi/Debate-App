import { DebateRoom } from "../../../components/DebateRoom";

interface DebatePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function DebatePage({ params }: DebatePageProps) {
  const { id } = await params;
  return <DebateRoom sessionId={id} />;
}
