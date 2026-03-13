import { Router, Request, Response } from 'express';
import {
  getPublicGameState,
  getGame,
} from '../services/gameService';
import { getPrisma } from '../lib/prisma';

const router = Router();

/** GET /api/health */
router.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

/** GET /api/game/state – public game state */
router.get('/game/state', (_req: Request, res: Response) => {
  res.json(getPublicGameState());
});

/** GET /api/game/rounds – completed rounds history */
router.get('/game/rounds', (_req: Request, res: Response) => {
  const game = getGame();
  res.json(
    game.completedRounds.map((r) => ({
      id: r.id,
      roundNumber: r.roundNumber,
      drawnNumber: r.drawnNumber,
      question: r.question,
      optionA: r.optionA,
      optionB: r.optionB,
      majorityVote: r.majorityVote,
      voteCount: Object.keys(r.votes).length,
    })),
  );
});

/**
 * GET /api/game/participants – list participants (admin use)
 * Returns name and hasBingo status only
 */
router.get('/game/participants', (_req: Request, res: Response) => {
  const game = getGame();
  const list = Object.values(game.participants).map((p) => ({
    id: p.id,
    name: p.name,
    hasBingo: p.hasBingo,
    online: !!p.socketId,
  }));
  res.json(list);
});

/** GET /api/participants/:sessionId/card – get a participant's bingo card */
router.get('/participants/:sessionId/card', (req: Request, res: Response) => {
  const game = getGame();
  const participant = Object.values(game.participants).find(
    (p) => p.sessionId === req.params.sessionId,
  );
  if (!participant) {
    res.status(404).json({ error: 'Participant not found' });
    return;
  }
  res.json({
    participantId: participant.id,
    name: participant.name,
    card: participant.card,
  });
});

export default router;
