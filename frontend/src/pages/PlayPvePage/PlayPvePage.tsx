import { Card, HomeLinkButton, PageShell } from '@/components';

export const PlayPvePage = () => {
  return (
    <PageShell
      title="Испытание академии"
      subtitle="Учебные дуэли и одиночные сценарии против соперников."
      actions={<HomeLinkButton />}
    >
      <Card title="Сценарий">
        <p>Выбор AI-профиля и сложности.</p>
      </Card>
    </PageShell>
  );
};

