import { Card, HomeLinkButton, PageShell } from '@/components';

export const PlayPvePage = () => {
  return (
    <PageShell
      title="PvE матч"
      subtitle="Сценарий против ботов и заданий."
      actions={<HomeLinkButton />}
    >
      <Card title="Сценарий">
        <p>Выбор AI-профиля и сложности.</p>
      </Card>
    </PageShell>
  );
};

