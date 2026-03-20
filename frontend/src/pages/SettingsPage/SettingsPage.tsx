import { Card, HomeLinkButton, PageShell } from '@/components';

export const SettingsPage = () => {
  return (
    <PageShell
      title="Настройки тестирования"
      subtitle="Seed симуляций, режим купола, UI-параметры."
      actions={<HomeLinkButton />}
    >
      <Card title="Симуляции">
        <label>
          Seed:
          <input type="text" defaultValue="12345" />
        </label>
      </Card>
      <Card title="Режим купола">
        <select defaultValue="standard">
          <option value="standard">Стандарт</option>
          <option value="fast">Быстрый</option>
          <option value="sandbox">Sandbox</option>
        </select>
      </Card>
      <Card title="UI">
        <label>
          Масштаб:
          <input type="range" min="80" max="120" defaultValue="100" />
        </label>
      </Card>
    </PageShell>
  );
};

