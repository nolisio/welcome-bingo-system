import { Router, Request, Response } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import {
  getPublicGameState,
  getGame,
} from '../services/gameService';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'bingo-admin-secret';

/** Constant-time comparison to prevent timing-based secret discovery */
function isAdminSecret(provided: string | string[] | undefined): boolean {
  if (typeof provided !== 'string') return false;
  const expected = createHash('sha256').update(ADMIN_SECRET).digest();
  const actual = createHash('sha256').update(provided).digest();
  return timingSafeEqual(expected, actual);
}

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
      isBonusRound: r.isBonusRound,
      bonusRoundType: r.bonusRoundType,
      correctChoice: r.correctChoice,
      question: r.question,
      optionA: r.optionA,
      optionB: r.optionB,
      questionImageUrl: r.questionImageUrl,
      optionAImageUrl: r.optionAImageUrl,
      optionBImageUrl: r.optionBImageUrl,
      sourceType: r.sourceType,
      majorityVote: r.majorityVote,
      voteCount: Object.keys(r.votes).length,
      bonusSelectionCount: Object.keys(r.bonusSelections).length,
      pendingBonusSelectorCount: r.pendingBonusSelectors.length,
    })),
  );
});

/**
 * GET /api/game/participants – list participants (admin only)
 * Returns name, online status, and bingo flag for each participant.
 */
router.get('/game/participants', (req: Request, res: Response) => {
  if (!isAdminSecret(req.headers['x-admin-secret'])) {
    res.status(401).json({ error: '管理者認証に失敗しました' });
    return;
  }
  const game = getGame();
  const list = Object.values(game.participants).map((p) => ({
    id: p.id,
    name: p.name,
    isNewEmployee: p.isNewEmployee,
    hasBingo: p.hasBingo,
    online: !!p.socketId,
  }));
  res.json(list);
});

/** GET /api/participants/:sessionId/card – get a participant's bingo card (admin only) */
router.get('/participants/:sessionId/card', (req: Request, res: Response) => {
  if (!isAdminSecret(req.headers['x-admin-secret'])) {
    res.status(401).json({ error: '管理者認証に失敗しました' });
    return;
  }
  const game = getGame();
  const participant = Object.values(game.participants).find(
    (p) => p.sessionId === req.params.sessionId,
  );
  if (!participant) {
    res.status(404).json({ error: '参加者が見つかりません' });
    return;
  }
  res.json({
    participantId: participant.id,
    name: participant.name,
    isNewEmployee: participant.isNewEmployee,
    card: participant.card,
  });
});

export default router;
