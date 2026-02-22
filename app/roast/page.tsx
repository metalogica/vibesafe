import SecurityAuditApp from '@/src/frontend/components/SecurityAuditApp';

export default async function RoastPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
  return <SecurityAuditApp initialUrl={url} />;
}
