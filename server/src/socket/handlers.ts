import { Server, Socket } from 'socket.io';
import { createHash, timingSafeEqual } from 'crypto';
import {
  cancelCustomQuestionRequest,
  getGame,
  getCustomQuestionRequest,
  listParticipantSummaries,
  registerParticipant,
  requestCustomQuestion,
  requireCustomQuestionRequestTarget,
  resolveCustomQuestionRequest,
  setSocketId,
  disconnectParticipant,
  startGame,
  resetGame,
  startRound,
  submitVote,
  closeVoting,
  selectBonusCell,
  getPublicGameState,
  getParticipantView,
} from '../services/gameService';
import {
  listCustomQuestions,
  reviewCustomQuestion,
  submitCustomQuestion,
} from '../services/customQuestionService';
import {
  createPreparedQuestion,
  getRandomUnusedPreparedQuestion,
  listPreparedQuestions,
  setPreparedQuestionActive,
} from '../services/preparedQuestionService';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'bingo-admin-secret';
if (!process.env.ADMIN_SECRET) {
  console.warn(
    '[WARNING] ADMIN_SECRET env var is not set – using the default value.' +
    ' Set it to a strong secret before deploying to production.',
  );
}

/** Constant-time comparison to prevent timing-based secret discovery */
function isAdminSecret(provided: unknown): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const expected = createHash('sha256').update(ADMIN_SECRET).digest();
  const actual = createHash('sha256').update(provided).digest();
  return timingSafeEqual(expected, actual);
}

interface SocketData {
  participantId?: string;
}

async function broadcastCustomQuestionList(io: Server): Promise<void> {
  const questions = await listCustomQuestions();
  io.to('admins').emit('admin:custom-question:list-updated', { questions });
}

async function broadcastPreparedQuestionList(io: Server): Promise<void> {
  const questions = await listPreparedQuestions(getGame().id);
  io.to('admins').emit('admin:prepared-question:list-updated', { questions });
}

function broadcastParticipantViews(io: Server): void {
  const game = getGame();
  for (const participant of Object.values(game.participants)) {
    if (participant.socketId) {
      io.to(participant.socketId).emit(
        'participant:state',
        getParticipantView(participant.id),
      );
    }
  }
}

function broadcastAdminParticipantState(io: Server): void {
  io.to('admins').emit('admin:participant-state', {
    participants: listParticipantSummaries(),
    activeRequest: getCustomQuestionRequest(),
  });
}

export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket<any, any, any, SocketData>) => {
    console.log(`[socket] connected: ${socket.id}`);

    // -----------------------------------------------------------------------
    // Participant: join the game
    // -----------------------------------------------------------------------
    socket.on(
      'participant:join',
      async (
        data: { name: string; sessionId: string; isNewEmployee?: boolean },
        ack?: Function,
      ) => {
        try {
          const participant = await registerParticipant(
            data.name,
            data.sessionId,
            !!data.isNewEmployee,
          );
          setSocketId(data.sessionId, socket.id);

          // Store participant id on the socket for quick lookup in event handlers
          socket.data.participantId = participant.id;

          socket.join('participants');
          socket.join(`participant:${participant.id}`);

          const view = getParticipantView(participant.id);
          socket.emit('participant:state', view);

          // Notify admin/projector of new count
          io.to('public').emit('game:state', getPublicGameState());
          broadcastAdminParticipantState(io);

          if (ack) ack({ ok: true, participantId: participant.id });
        } catch (err: any) {
          console.error('[participant:join]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Participant: reconnect (restore session)
    // -----------------------------------------------------------------------
    socket.on(
      'participant:reconnect',
      (data: { sessionId: string }, ack?: Function) => {
        try {
          const p = setSocketId(data.sessionId, socket.id);
          if (!p) {
            if (ack) ack({ ok: false, error: '参加情報が見つかりませんでした' });
            return;
          }
          socket.data.participantId = p.id;
          socket.join('participants');
          socket.join(`participant:${p.id}`);

          const view = getParticipantView(p.id);
          socket.emit('participant:state', view);
          broadcastAdminParticipantState(io);
          if (ack) ack({ ok: true, participantId: p.id });
        } catch (err: any) {
          console.error('[participant:reconnect]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Participant: vote
    // -----------------------------------------------------------------------
    socket.on(
      'vote:submit',
      async (data: { choice: unknown }, ack?: Function) => {
        const participantId = socket.data.participantId;
        if (!participantId) {
          if (ack) ack({ ok: false, error: 'まだ参加が完了していません' });
          return;
        }
        if (data.choice !== 'A' && data.choice !== 'B') {
          if (ack) ack({ ok: false, error: '選択肢はAまたはBを選んでください' });
          return;
        }
        try {
          await submitVote(participantId, data.choice);

          const view = getParticipantView(participantId);
          socket.emit('participant:state', view);

          // Broadcast updated vote count to public
          io.to('public').emit('game:state', getPublicGameState());

          if (ack) ack({ ok: true });
        } catch (err: any) {
          console.error('[vote:submit]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    socket.on(
      'bonus-cell:select',
      async (data: { cellIndex: unknown }, ack?: Function) => {
        const participantId = socket.data.participantId;
        if (!participantId) {
          if (ack) ack({ ok: false, error: 'まだ参加が完了していません' });
          return;
        }
        if (!Number.isInteger(data.cellIndex)) {
          if (ack) ack({ ok: false, error: '選択したマスが不正です' });
          return;
        }

        try {
          const beforeWinnerCount =
            getGame().currentRound?.newBingoWinners.length ?? 0;
          const round = await selectBonusCell(
            participantId,
            data.cellIndex as number,
          );

          broadcastParticipantViews(io);
          io.to('public').emit('game:state', getPublicGameState());

          const newWinnerIds = round.newBingoWinners.slice(beforeWinnerCount);
          if (newWinnerIds.length > 0) {
            const game = getGame();
            const winnerNames = newWinnerIds
              .map((id) => game.participants[id]?.name ?? id)
              .join(', ');
            io.emit('bingo:winner', {
              winners: newWinnerIds.map((id) => ({
                id,
                name: game.participants[id]?.name ?? '',
              })),
              message: `🎉 ビンゴ！ ${winnerNames} さんがビンゴしました！`,
            });
          }

          if (ack) ack({ ok: true, round });
        } catch (err: any) {
          console.error('[bonus-cell:select]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Participant: submit a custom question
    // -----------------------------------------------------------------------
    socket.on(
      'custom-question:submit',
      async (
        data: { question: string; optionA: string; optionB: string },
        ack?: Function,
      ) => {
        const participantId = socket.data.participantId;
        if (!participantId) {
          if (ack) ack({ ok: false, error: 'まだ参加が完了していません' });
          return;
        }

        try {
          requireCustomQuestionRequestTarget(participantId);
          const question = await submitCustomQuestion(participantId, data);
          resolveCustomQuestionRequest(participantId);
          await broadcastCustomQuestionList(io);
          broadcastParticipantViews(io);
          broadcastAdminParticipantState(io);
          socket.emit('custom-question:submitted', { question });
          if (ack) ack({ ok: true, question });
        } catch (err: any) {
          console.error('[custom-question:submit]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Public screens (projector, admin) subscribe to public updates
    // -----------------------------------------------------------------------
    socket.on('public:subscribe', () => {
      socket.join('public');
      socket.emit('game:state', getPublicGameState());
    });

    // -----------------------------------------------------------------------
    // Admin: subscribe to admin-only updates
    // -----------------------------------------------------------------------
    socket.on(
      'admin:subscribe',
      async (data: { secret: string }, ack?: Function) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: '管理者認証に失敗しました' });
          return;
        }

        socket.join('admins');
        try {
          const questions = await listCustomQuestions();
          socket.emit('admin:custom-question:list-updated', { questions });
          socket.emit('admin:prepared-question:list-updated', {
            questions: await listPreparedQuestions(getGame().id),
          });
          socket.emit('admin:participant-state', {
            participants: listParticipantSummaries(),
            activeRequest: getCustomQuestionRequest(),
          });
          if (ack) ack({ ok: true });
        } catch (err: any) {
          console.error('[admin:subscribe]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Admin: request a custom question from a selected participant
    // -----------------------------------------------------------------------
    socket.on(
      'admin:custom-question:request',
      (data: { secret: string; participantId: string }, ack?: Function) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: '管理者認証に失敗しました' });
          return;
        }

        try {
          const request = requestCustomQuestion(data.participantId);
          broadcastParticipantViews(io);
          broadcastAdminParticipantState(io);
          if (ack) ack({ ok: true, request });
        } catch (err: any) {
          console.error('[admin:custom-question:request]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Admin: cancel an active custom question request
    // -----------------------------------------------------------------------
    socket.on(
      'admin:custom-question:cancel-request',
      (data: { secret: string }, ack?: Function) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: '管理者認証に失敗しました' });
          return;
        }

        try {
          cancelCustomQuestionRequest();
          broadcastParticipantViews(io);
          broadcastAdminParticipantState(io);
          if (ack) ack({ ok: true });
        } catch (err: any) {
          console.error('[admin:custom-question:cancel-request]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Admin: start game
    // -----------------------------------------------------------------------
    socket.on(
      'admin:start-game',
      async (data: { secret: string }, ack?: Function) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: '管理者認証に失敗しました' });
          return;
        }
        try {
          await startGame();
          io.emit('game:state', getPublicGameState());
          if (ack) ack({ ok: true });
        } catch (err: any) {
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Admin: custom question list
    // -----------------------------------------------------------------------
    socket.on(
      'admin:custom-question:list',
      async (data: { secret: string }, ack?: Function) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: '管理者認証に失敗しました' });
          return;
        }

        try {
          const questions = await listCustomQuestions();
          if (ack) ack({ ok: true, questions });
        } catch (err: any) {
          console.error('[admin:custom-question:list]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Admin: prepared question list
    // -----------------------------------------------------------------------
    socket.on(
      'admin:prepared-question:list',
      async (data: { secret: string }, ack?: Function) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: '管理者認証に失敗しました' });
          return;
        }

        try {
          const questions = await listPreparedQuestions(getGame().id);
          if (ack) ack({ ok: true, questions });
        } catch (err: any) {
          console.error('[admin:prepared-question:list]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Admin: create a prepared question
    // -----------------------------------------------------------------------
    socket.on(
      'admin:prepared-question:create',
      async (
        data: {
          secret: string;
          kind?: 'MAJORITY' | 'QUIZ';
          question: string;
          optionA: string;
          optionB: string;
          imageUrl?: string | null;
          optionAImageUrl?: string | null;
          optionBImageUrl?: string | null;
          correctChoice?: 'A' | 'B' | null;
        },
        ack?: Function,
      ) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: '管理者認証に失敗しました' });
          return;
        }

        try {
          const question = await createPreparedQuestion(
            {
              question: data.question,
              optionA: data.optionA,
              optionB: data.optionB,
              kind: data.kind,
              imageUrl: data.imageUrl,
              optionAImageUrl: data.optionAImageUrl,
              optionBImageUrl: data.optionBImageUrl,
              correctChoice: data.correctChoice,
            },
            getGame().id,
          );
          await broadcastPreparedQuestionList(io);
          if (ack) ack({ ok: true, question });
        } catch (err: any) {
          console.error('[admin:prepared-question:create]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Admin: toggle prepared question availability
    // -----------------------------------------------------------------------
    socket.on(
      'admin:prepared-question:set-active',
      async (
        data: { secret: string; preparedQuestionId: string; isActive: boolean },
        ack?: Function,
      ) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: '管理者認証に失敗しました' });
          return;
        }

        try {
          const question = await setPreparedQuestionActive(
            data.preparedQuestionId,
            data.isActive,
            getGame().id,
          );
          await broadcastPreparedQuestionList(io);
          if (ack) ack({ ok: true, question });
        } catch (err: any) {
          console.error('[admin:prepared-question:set-active]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Admin: approve a custom question
    // -----------------------------------------------------------------------
    socket.on(
      'admin:custom-question:approve',
      async (
        data: { secret: string; customQuestionId: string },
        ack?: Function,
      ) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: '管理者認証に失敗しました' });
          return;
        }

        try {
          const question = await reviewCustomQuestion(
            data.customQuestionId,
            'APPROVED',
            'admin',
          );
          await broadcastCustomQuestionList(io);
          if (ack) ack({ ok: true, question });
        } catch (err: any) {
          console.error('[admin:custom-question:approve]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Admin: start round from a random prepared question
    // -----------------------------------------------------------------------
    socket.on(
      'admin:start-random-round',
      async (
        data: {
          secret: string;
          bonusRoundType?: 'NONE' | 'MAJORITY' | 'QUIZ';
        },
        ack?: Function,
      ) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: '管理者認証に失敗しました' });
          return;
        }

        try {
          if (data.bonusRoundType === 'QUIZ') {
            if (ack) {
              ack({
                ok: false,
                error: 'ランダム問題プールでは、まだボーナス問題を使えません',
              });
            }
            return;
          }

          const preparedQuestion = await getRandomUnusedPreparedQuestion(
            getGame().id,
            'MAJORITY',
          );
          const round = await startRound({
            question: preparedQuestion.question,
            optionA: preparedQuestion.optionA,
            optionB: preparedQuestion.optionB,
            questionImageUrl: preparedQuestion.imageUrl,
            optionAImageUrl: preparedQuestion.optionAImageUrl,
            optionBImageUrl: preparedQuestion.optionBImageUrl,
            sourceType: 'POOL',
            preparedQuestionId: preparedQuestion.id,
            bonusRoundType: data.bonusRoundType ?? 'NONE',
          });

          const publicState = getPublicGameState();
          io.emit('game:state', publicState);
          io.emit('round:started', {
            roundNumber: round.roundNumber,
            question: round.question,
            optionA: round.optionA,
            optionB: round.optionB,
            questionImageUrl: round.questionImageUrl,
            optionAImageUrl: round.optionAImageUrl,
            optionBImageUrl: round.optionBImageUrl,
            sourceType: round.sourceType,
            status: round.status,
          });

          broadcastParticipantViews(io);
          await broadcastPreparedQuestionList(io);

          if (ack) ack({ ok: true, round, preparedQuestion });
        } catch (err: any) {
          console.error('[admin:start-random-round]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Admin: reject a custom question
    // -----------------------------------------------------------------------
    socket.on(
      'admin:custom-question:reject',
      async (
        data: { secret: string; customQuestionId: string },
        ack?: Function,
      ) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: '管理者認証に失敗しました' });
          return;
        }

        try {
          const question = await reviewCustomQuestion(
            data.customQuestionId,
            'REJECTED',
            'admin',
          );
          await broadcastCustomQuestionList(io);
          if (ack) ack({ ok: true, question });
        } catch (err: any) {
          console.error('[admin:custom-question:reject]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Admin: start round
    // -----------------------------------------------------------------------
    socket.on(
      'admin:start-round',
      async (
        data: {
          secret: string;
          question: string;
          optionA: string;
          optionB: string;
          questionImageUrl?: string | null;
          optionAImageUrl?: string | null;
          optionBImageUrl?: string | null;
          bonusRoundType?: 'NONE' | 'MAJORITY' | 'QUIZ';
          correctChoice?: 'A' | 'B' | null;
        },
        ack?: Function,
      ) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: '管理者認証に失敗しました' });
          return;
        }
        try {
          const round = await startRound({
            question: data.question,
            optionA: data.optionA,
            optionB: data.optionB,
            questionImageUrl: data.questionImageUrl ?? null,
            optionAImageUrl: data.optionAImageUrl ?? null,
            optionBImageUrl: data.optionBImageUrl ?? null,
            bonusRoundType: data.bonusRoundType ?? 'NONE',
            correctChoice: data.correctChoice ?? null,
          });

          // Broadcast new round to everyone
          const publicState = getPublicGameState();
          io.emit('game:state', publicState);
          io.emit('round:started', {
            roundNumber: round.roundNumber,
            question: round.question,
            optionA: round.optionA,
            optionB: round.optionB,
            questionImageUrl: round.questionImageUrl,
            optionAImageUrl: round.optionAImageUrl,
            optionBImageUrl: round.optionBImageUrl,
            sourceType: round.sourceType,
            status: round.status,
          });

          // Update each participant's personal state
          broadcastParticipantViews(io);

          if (ack) ack({ ok: true, round });
        } catch (err: any) {
          console.error('[admin:start-round]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Admin: close voting
    // -----------------------------------------------------------------------
    socket.on(
      'admin:close-voting',
      async (data: { secret: string }, ack?: Function) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: '管理者認証に失敗しました' });
          return;
        }
        try {
          const round = await closeVoting();

          const publicState = getPublicGameState();
          io.emit('game:state', publicState);
          io.emit('round:completed', {
            roundNumber: round.roundNumber,
            drawnNumber: round.drawnNumber,
            isBonusRound: round.isBonusRound,
            bonusRoundType: round.bonusRoundType,
            correctChoice: round.correctChoice,
            majorityVote: round.majorityVote,
            cellOpeners: round.cellOpeners,
            newBingoWinners: round.newBingoWinners,
            pendingBonusSelectorCount: round.pendingBonusSelectors.length,
          });

          // Update each participant's personal state
          const game = getGame();
          broadcastParticipantViews(io);

          // Announce bingo winners
          if (round.newBingoWinners.length > 0) {
            const winnerNames = round.newBingoWinners
              .map((id) => game.participants[id]?.name ?? id)
              .join(', ');
            io.emit('bingo:winner', {
              winners: round.newBingoWinners.map((id) => ({
                id,
                name: game.participants[id]?.name ?? '',
              })),
              message: `🎉 ビンゴ！ ${winnerNames} さんがビンゴしました！`,
            });
          }

          if (ack) ack({ ok: true, round });
        } catch (err: any) {
          console.error('[admin:close-voting]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Admin: reset game
    // -----------------------------------------------------------------------
    socket.on(
      'admin:reset-game',
      async (data: { secret: string }, ack?: Function) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: '管理者認証に失敗しました' });
          return;
        }
        try {
          await resetGame();
          io.emit('game:state', getPublicGameState());
          io.emit('game:reset', { message: 'ゲームをリセットしました' });
          await broadcastCustomQuestionList(io);
          await broadcastPreparedQuestionList(io);
          broadcastAdminParticipantState(io);
          if (ack) ack({ ok: true });
        } catch (err: any) {
          console.error('[admin:reset-game]', err);
          if (ack) ack({ ok: false, error: err.message });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Disconnect
    // -----------------------------------------------------------------------
    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
      disconnectParticipant(socket.id);
      broadcastAdminParticipantState(io);
    });
  });
}
