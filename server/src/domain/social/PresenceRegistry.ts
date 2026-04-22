export type PresenceState = 'offline' | 'online' | 'in_match';

type SocketPresence = {
  userId: string;
  inMatch: boolean;
};

export class PresenceRegistry {
  private readonly sockets = new Map<string, SocketPresence>();

  bindSocket(socketId: string, userId: string): PresenceState {
    const previous = this.sockets.get(socketId);
    this.sockets.set(socketId, {
      userId,
      inMatch: previous?.inMatch ?? false,
    });

    return this.getPresence(userId);
  }

  setSocketInMatch(socketId: string, inMatch: boolean): PresenceState | null {
    const binding = this.sockets.get(socketId);
    if (!binding) {
      return null;
    }

    binding.inMatch = inMatch;
    return this.getPresence(binding.userId);
  }

  unbindSocket(socketId: string): { userId: string; status: PresenceState } | null {
    const binding = this.sockets.get(socketId);
    if (!binding) {
      return null;
    }

    this.sockets.delete(socketId);
    return {
      userId: binding.userId,
      status: this.getPresence(binding.userId),
    };
  }

  getPresence(userId: string): PresenceState {
    let hasOnline = false;

    for (const binding of this.sockets.values()) {
      if (binding.userId !== userId) {
        continue;
      }

      if (binding.inMatch) {
        return 'in_match';
      }

      hasOnline = true;
    }

    return hasOnline ? 'online' : 'offline';
  }

  getPresences(userIds: string[]): Array<{ userId: string; status: PresenceState }> {
    return userIds.map((userId) => ({
      userId,
      status: this.getPresence(userId),
    }));
  }

  isOnline(userId: string): boolean {
    return this.getPresence(userId) !== 'offline';
  }
}
