import { SessionRegistry } from './domain/game/SessionRegistry';
import { GameService } from './application/GameService';
import { WsGateway } from './transport/ws/WsGateway';
import { createEngine } from './engine/createEngine';
import { logger } from './infrastructure/logger';
import { HttpMatchPersistenceClient } from './infrastructure/matches/MatchPersistenceClient';

const port = Number(process.env.WS_PORT ?? 4000);

const sessions = new SessionRegistry((seed, players) => createEngine(seed, players));
const gameService = new GameService(sessions);
const gateway = new WsGateway(gameService, undefined, new HttpMatchPersistenceClient());

gateway.start(port);
logger.info(`WS server running on port ${port}`);

const shutdown = () => {
  gateway.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
