import { Card, HomeLinkButton, PageShell } from '@/components';

export const DebugPage = () => {
  return (
    <PageShell
      title="Панель дебага"
      subtitle="Состояние персонажей, активные эффекты, журнал действий."
      actions={<HomeLinkButton />}
    >
      <Card title="Статусы">
        <div>HP: 18</div>
        <div>Mana: 6</div>
        <div>Shields: 1</div>
        <div>Effects: 2</div>
      </Card>
      <Card title="Журнал действий">
        <div>[Turn 3] Cast Spell: Fireball → 5 dmg</div>
        <div>[Turn 3] Shield absorbs 3 dmg</div>
        <div>[Turn 3] Summon: Arcane Golem</div>
      </Card>
    </PageShell>
  );
};

