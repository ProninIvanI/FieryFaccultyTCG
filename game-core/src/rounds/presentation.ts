import type { ResolutionLayer, RoundActionReasonCode, TargetType } from '../types';

export const getTargetTypeLabel = (targetType: TargetType | null | undefined): string => {
  switch (targetType) {
    case 'enemyCharacter':
      return 'Р’СЂР°Р¶РµСЃРєРёР№ РјР°Рі';
    case 'allyCharacter':
      return 'РЎРѕСЋР·РЅС‹Р№ РјР°Рі';
    case 'creature':
      return 'РЎСѓС‰РµСЃС‚РІРѕ';
    case 'self':
      return 'РЎРµР±СЏ';
    case 'any':
      return 'Р›СЋР±Р°СЏ С†РµР»СЊ';
    default:
      return 'Р¦РµР»СЊ РЅРµ РѕРїСЂРµРґРµР»РµРЅР°';
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
      return 'Р”РµР№СЃС‚РІРёРµ СѓСЃРїРµС€РЅРѕ РІС‹РїРѕР»РЅРµРЅРѕ';
    case 'invalid_intent':
      return 'РќР°РјРµСЂРµРЅРёРµ Р±РѕР»СЊС€Рµ РЅРµРІР°Р»РёРґРЅРѕ';
    case 'card_unavailable':
      return 'РљР°СЂС‚Р° СѓР¶Рµ РЅРµРґРѕСЃС‚СѓРїРЅР°';
    case 'card_definition_missing':
      return 'РћРїРёСЃР°РЅРёРµ РєР°СЂС‚С‹ РЅРµ РЅР°Р№РґРµРЅРѕ';
    case 'target_invalidated':
      return 'Р¦РµР»СЊ СЃС‚Р°Р»Р° РЅРµРґРѕСЃС‚СѓРїРЅР°';
    case 'attack_source_unavailable':
      return 'РСЃС‚РѕС‡РЅРёРє Р°С‚Р°РєРё Р±РѕР»СЊС€Рµ РЅРµРґРѕСЃС‚СѓРїРµРЅ';
    case 'summoning_sickness':
      return 'РЎСѓС‰РµСЃС‚РІРѕ РїСЂРёР·РІР°РЅРѕ РІ СЌС‚РѕРј СЂР°СѓРЅРґРµ';
    case 'actor_unavailable':
      return 'РСЃС‚РѕС‡РЅРёРє РґРµР№СЃС‚РІРёСЏ Р±РѕР»СЊС€Рµ РЅРµРґРѕСЃС‚СѓРїРµРЅ';
    case 'command_unavailable':
      return 'РћР±СЂР°Р±РѕС‚С‡РёРє РґРµР№СЃС‚РІРёСЏ РЅРµ РЅР°Р№РґРµРЅ';
  }
};

export const getRoundDraftValidationCodeLabel = (code: string): string => {
  switch (code) {
    case 'player_not_in_session':
      return 'Игрок ещё не привязан к этой сессии';
    case 'player_not_found':
      return 'РРіСЂРѕРє РґР»СЏ СЌС‚РѕРіРѕ С‡РµСЂРЅРѕРІРёРєР° РЅРµ РЅР°Р№РґРµРЅ';
    case 'round_resolving':
      return 'Р Р°СѓРЅРґ СѓР¶Рµ РЅР°С…РѕРґРёС‚СЃСЏ РІ СЂРµР·РѕР»РІРµ';
    case 'draft_locked':
      return 'Р§РµСЂРЅРѕРІРёРє СѓР¶Рµ Р·Р°С„РёРєСЃРёСЂРѕРІР°РЅ';
    case 'round_number':
      return 'РќРѕРјРµСЂ СЂР°СѓРЅРґР° РЅРµ СЃРѕРІРїР°РґР°РµС‚';
    case 'actor_ownership':
      return 'РСЃС‚РѕС‡РЅРёРє РґРµР№СЃС‚РІРёСЏ РЅРµ РїСЂРёРЅР°РґР»РµР¶РёС‚ РёРіСЂРѕРєСѓ';
    case 'card_ownership':
      return 'РљР°СЂС‚Р° РЅРµ РїСЂРёРЅР°РґР»РµР¶РёС‚ РёРіСЂРѕРєСѓ';
    case 'card_location':
      return 'РљР°СЂС‚Р° Р±РѕР»СЊС€Рµ РЅРµ РЅР°С…РѕРґРёС‚СЃСЏ РІ СЂСѓРєРµ';
    case 'card_definition':
      return 'РћРїРёСЃР°РЅРёРµ РєР°СЂС‚С‹ РЅРµ РЅР°Р№РґРµРЅРѕ';
    case 'card_kind':
      return 'РўРёРї РєР°СЂС‚С‹ РЅРµ РїРѕРґС…РѕРґРёС‚ РґР»СЏ СЌС‚РѕРіРѕ РґРµР№СЃС‚РІРёСЏ';
    case 'target_type':
      return 'Р¦РµР»СЊ РЅРµ РїРѕРґС…РѕРґРёС‚ РїРѕРґ РїСЂР°РІРёР»Р° РєР°СЂС‚С‹';
    case 'intent_player':
      return 'РРіСЂРѕРє РІ intent РЅРµ СЃРѕРІРїР°РґР°РµС‚ СЃ РІР»Р°РґРµР»СЊС†РµРј С‡РµСЂРЅРѕРІРёРєР°';
    case 'intent_round':
      return 'Р Р°СѓРЅРґ РІ intent РЅРµ СЃРѕРІРїР°РґР°РµС‚ СЃ С‡РµСЂРЅРѕРІРёРєРѕРј';
    case 'queue_index':
      return 'РџРѕСЂСЏРґРѕРє РґРµР№СЃС‚РІРёР№ РІ С‡РµСЂРЅРѕРІРёРєРµ РЅРµРєРѕСЂСЂРµРєС‚РµРЅ';
    case 'creature_limit':
      return 'РџСЂРµРІС‹С€РµРЅ Р»РёРјРёС‚ СЃСѓС‰РµСЃС‚РІ РЅР° СЃС‚РѕР»Рµ';
    case 'attack_source':
      return 'РСЃС‚РѕС‡РЅРёРє Р°С‚Р°РєРё РЅРµРґРѕСЃС‚СѓРїРµРЅ';
    case 'attack_target':
      return 'Р¦РµР»СЊ Р°С‚Р°РєРё РЅРµРґРѕСЃС‚СѓРїРЅР°';
    case 'summoning_sickness':
      return 'РЎСѓС‰РµСЃС‚РІРѕ РїСЂРёР·РІР°РЅРѕ РІ СЌС‚РѕРј СЂР°СѓРЅРґРµ';
    case 'mana_budget':
      return 'РќРµ С…РІР°С‚Р°РµС‚ РјР°РЅС‹ РЅР° С‡РµСЂРЅРѕРІРёРє СЂР°СѓРЅРґР°';
    case 'action_budget':
      return 'РџСЂРµРІС‹С€РµРЅ Р»РёРјРёС‚ РґРµР№СЃС‚РІРёР№ РЅР° СЂР°СѓРЅРґ';
    default:
      return 'РџСЂР°РІРёР»Рѕ СЂР°СѓРЅРґР° РЅР°СЂСѓС€РµРЅРѕ';
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
