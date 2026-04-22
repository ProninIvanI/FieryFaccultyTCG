import { describe, expect, it } from 'vitest';
import { PresenceRegistry } from './PresenceRegistry';

describe('PresenceRegistry', () => {
  it('reports offline before any socket is bound', () => {
    const registry = new PresenceRegistry();

    expect(registry.getPresence('user_alpha')).toBe('offline');
  });

  it('reports online when authenticated socket is connected', () => {
    const registry = new PresenceRegistry();

    registry.bindSocket('socket_1', 'user_alpha');

    expect(registry.getPresence('user_alpha')).toBe('online');
  });

  it('reports in_match when any socket is marked as match participant', () => {
    const registry = new PresenceRegistry();

    registry.bindSocket('socket_1', 'user_alpha');
    registry.bindSocket('socket_2', 'user_alpha');
    registry.setSocketInMatch('socket_2', true);

    expect(registry.getPresence('user_alpha')).toBe('in_match');
  });

  it('falls back to online when match socket disconnects but another socket remains', () => {
    const registry = new PresenceRegistry();

    registry.bindSocket('socket_1', 'user_alpha');
    registry.bindSocket('socket_2', 'user_alpha');
    registry.setSocketInMatch('socket_2', true);
    registry.unbindSocket('socket_2');

    expect(registry.getPresence('user_alpha')).toBe('online');
  });
});
