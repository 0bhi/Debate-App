import { DebateRoom } from "../../../components/DebateRoom";

interface DebatePageProps {
  params: {
    id: string;
  };
}

export default async function DebatePage({ params }: DebatePageProps) {
  const { id } = await params;
  return <DebateRoom sessionId={id} />;
}
