import type { JoinRejectedServerMessage, TransportRejectedServerMessage } from '@/types';
import styles from './PlayPvpPage.module.css';

type JoinRejectedSummary = Omit<JoinRejectedServerMessage, 'type'>;
type TransportRejectedSummary = Omit<TransportRejectedServerMessage, 'type'>;

interface SceneAlertsProps {
  transportRejected: TransportRejectedSummary | null;
  joinRejected: JoinRejectedSummary | null;
  inviteJoinRejectHint: string | null;
}

const getJoinRejectCodeLabel = (code: JoinRejectedServerMessage['code']): string => {
  switch (code) {
    case 'unauthorized':
      return 'Сессия входа недействительна или истекла';
    case 'deck_unavailable':
      return 'Выбранная колода недоступна для этого игрока';
    case 'deck_invalid':
      return 'Выбранная колода не проходит правила PvP';
    case 'session_full':
      return 'В матче уже заняты оба PvP-слота';
    case 'duplicate_character':
      return 'Этот персонаж уже занят в матче. Выберите колоду с другим магом';
    case 'seed_mismatch':
      return 'Seed не совпадает с уже созданной сессией';
    case 'invalid_payload':
      return 'Запрос на подключение содержит некорректные данные';
    default:
      return 'Подключение к матчу отклонено сервером';
  }
};

const getTransportRejectCodeLabel = (code: TransportRejectedServerMessage['code']): string => {
  switch (code) {
    case 'invalid_json':
      return 'Сообщение не удалось разобрать как JSON';
    case 'invalid_payload':
      return 'Сообщение пришло в некорректном формате';
    case 'unknown_message_type':
      return 'Тип WS-сообщения не поддерживается сервером';
    default:
      return 'Транспортный запрос отклонён сервером';
  }
};

export const SceneAlerts = ({ transportRejected, joinRejected, inviteJoinRejectHint }: SceneAlertsProps) => (
  <div className={styles.sceneAlerts}>
    {transportRejected || joinRejected ? (
      <>
        {transportRejected ? (
          <div className={styles.roundRejectBox}>
            <strong>
              Сервер отклонил сообщение {transportRejected.requestType ? `для ${transportRejected.requestType}` : 'без типа'}
            </strong>
            <div className={styles.roundQueueError}>
              <span className={styles.cardBadge}>{transportRejected.code}</span>
              <span>{getTransportRejectCodeLabel(transportRejected.code)}</span>
            </div>
            <span>{transportRejected.error}</span>
          </div>
        ) : null}
        {joinRejected ? (
          <div className={styles.roundRejectBox}>
            <strong>
              Сервер отклонил вход {joinRejected.sessionId ? `в сессию ${joinRejected.sessionId}` : 'в матч'}
            </strong>
            <div className={styles.roundQueueError}>
              <span className={styles.cardBadge}>{joinRejected.code}</span>
              <span>{getJoinRejectCodeLabel(joinRejected.code)}</span>
            </div>
            <span>{joinRejected.error}</span>
            {inviteJoinRejectHint ? <span>{inviteJoinRejectHint}</span> : null}
          </div>
        ) : null}
      </>
    ) : null}
  </div>
);
