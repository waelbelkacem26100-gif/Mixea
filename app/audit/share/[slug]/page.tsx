interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AuditSharePage({ params }: Props) {
  const { slug } = await params;

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-8">
      <h1 className="text-2xl font-bold text-white">Rapport partagé — {slug}</h1>
    </main>
  );
}
