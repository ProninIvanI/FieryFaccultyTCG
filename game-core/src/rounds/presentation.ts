import type { ResolutionLayer, RoundActionReasonCode, TargetType } from '../types';

export const getTargetTypeLabel = (targetType: TargetType | null | undefined): string => {
  switch (targetType) {
    case 'enemyCharacter':
      return 'Вражеский маг';
    case 'allyCharacter':
      return 'Союзный маг';
    case 'creature':
      return 'Существо';
    case 'self':
      return 'Себя';
    case 'any':
      return 'Любая цель';
    default:
      return 'Цель не определена';
  }
};

export const getResolutionLayerLabel = (layer: ResolutionLayer): string => {
  switch (layer) {
    case 'summon':
      return 'Summon';
    case 'defensive_modifiers':
      return 'Defensive modifiers';
    case 'defensive_spells':
      return 'Defensive spells';
    case 'other_modifiers':
      return 'Other modifiers';
    case 'offensive_control_spells':
      return 'Offensive/control spells';
    case 'attacks':
      return 'Attacks';
    case 'cleanup_end_of_round':
      return 'Cleanup';
  }
};

export const getRoundActionReasonLabel = (reasonCode: RoundActionReasonCode): string => {
  switch (reasonCode) {
    case 'resolved':
      return 'Действие успешно выполнено';
    case 'invalid_intent':
      return 'Намерение больше невалидно';
    case 'card_unavailable':
      return 'Карта уже недоступна';
    case 'card_definition_missing':
      return 'Описание карты не найдено';
    case 'target_invalidated':
      return 'Цель стала недоступна';
    case 'attack_source_unavailable':
      return 'Источник атаки больше недоступен';
    case 'summoning_sickness':
      return 'Существо призвано в этом раунде';
    case 'actor_unavailable':
      return 'Источник действия больше недоступен';
    case 'command_unavailable':
      return 'Обработчик действия не найден';
    case 'evade_disabled':
      return 'Уклонение запрещено эффектом контроля';
    case 'action_skipped':
      return 'Действие пропущено эффектом контроля';
    case 'interrupted':
      return 'Заклинание прервано эффектом контроля';
  }
};

export const getRoundDraftValidationCodeLabel = (code: string): string => {
  switch (code) {
    case 'player_not_in_session':
      return 'Игрок ещё не привязан к этой сессии';
    case 'player_not_found':
      return 'Игрок для этого черновика не найден';
    case 'round_resolving':
      return 'Раунд уже находится в резолве';
    case 'draft_locked':
      return 'Черновик уже зафиксирован';
    case 'round_number':
      return 'Номер раунда не совпадает';
    case 'actor_ownership':
      return 'Источник действия не принадлежит игроку';
    case 'card_ownership':
      return 'Карта не принадлежит игроку';
    case 'card_location':
      return 'Карта больше не находится в руке';
    case 'card_definition':
      return 'Описание карты не найдено';
    case 'card_kind':
      return 'Тип карты не подходит для этого действия';
    case 'target_type':
      return 'Цель не подходит под правила карты';
    case 'intent_player':
      return 'Игрок в intent не совпадает с владельцем черновика';
    case 'intent_round':
      return 'Раунд в intent не совпадает с черновиком';
    case 'queue_index':
      return 'Порядок действий в черновике некорректен';
    case 'creature_limit':
      return 'Превышен лимит существ на столе';
    case 'attack_source':
      return 'Источник атаки недоступен';
    case 'attack_target':
      return 'Цель атаки недоступна';
    case 'summoning_sickness':
      return 'Существо призвано в этом раунде';
    case 'mana_budget':
      return 'Не хватает маны на черновик раунда';
    case 'action_budget':
      return 'Превышен лимит действий на раунд';
    default:
      return 'Правило раунда нарушено';
  }
};

export const getRoundDraftRejectCodeLabel = (code: string): string => {
  switch (code) {
    case 'validation_failed':
      return 'Черновик раунда не прошёл валидацию';
    case 'join_required':
      return 'Сначала нужно подключиться к матчу';
    case 'session_not_found':
      return 'Сессия матча не найдена';
    case 'player_not_in_session':
      return 'Игрок не состоит в этой сессии';
    case 'invalid_payload':
      return 'Черновик раунда содержит некорректные данные';
    case 'player_mismatch':
      return 'Игрок в intent не совпадает с текущим подключением';
    case 'round_number_mismatch':
      return 'Номер раунда в сообщении не совпадает с intent';
    default:
      return 'Черновик раунда отклонён сервером';
  }
};
