import { Card, HomeLinkButton, PageShell } from '@/components';

export const DemoPage = () => {
  return (
    <PageShell
      title="Демо-тур"
      subtitle="Пошаговый разбор фаз раунда и применения эффектов."
      actions={<HomeLinkButton />}
    >
      <Card title="Шаг 1: RecoveryPhase">
        <p>Восстанавливаем ману, сбрасываем лимиты действий.</p>
      </Card>
      <Card title="Шаг 2: DrawPhase">
        <p>Добор карты в руку. Проверка лимитов.</p>
      </Card>
      <Card title="Шаг 3: ActionPhase">
        <p>Розыгрыш карты, атака, уклонение, эффекты.</p>
      </Card>
      <Card title="Шаг 4: EndPhase">
        <p>Закрытие хода, запись логов, переход к следующему игроку.</p>
      </Card>
    </PageShell>
  );
};

