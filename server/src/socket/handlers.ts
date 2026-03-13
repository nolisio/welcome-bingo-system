import { Server, Socket } from 'socket.io';
import { createHash, timingSafeEqual } from 'crypto';
import {
  getGame,
  registerParticipant,
  setSocketId,
  disconnectParticipant,
  startGame,
  resetGame,
  startRound,
  submitVote,
  closeVoting,
  getPublicGameState,
  getParticipantView,
} from '../services/gameService';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'bingo-admin-secret';
if (!process.env.ADMIN_SECRET) {
  console.warn(
    '[WARNING] ADMIN_SECRET env var is not set – using the default value.' +
    ' Set it to a strong secret before deploying to production.',
  );
}

/** Constant-time comparison to prevent timing-based secret discovery */
function isAdminSecret(provided: string): boolean {
  const expected = createHash('sha256').update(ADMIN_SECRET).digest();
  const actual = createHash('sha256').update(provided).digest();
  return timingSafeEqual(expected, actual);
}

interface SocketData {
  participantId?: string;
}

export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket<any, any, any, SocketData>) => {
    console.log(`[socket] connected: ${socket.id}`);

    // -----------------------------------------------------------------------
    // Participant: join the game
    // -----------------------------------------------------------------------
    socket.on(
      'participant:join',
      async (data: { name: string; sessionId: string }, ack?: Function) => {
        try {
          const participant = await registerParticipant(data.name, data.sessionId);
          setSocketId(data.sessionId, socket.id);

          // Store participant id on the socket for quick lookup in event handlers
          socket.data.participantId = participant.id;

          socket.join('participants');
          socket.join(`participant:${participant.id}`);

          const view = getParticipantView(participant.id);
          socket.emit('participant:state', view);

          // Notify admin/projector of new count
          io.to('public').emit('game:state', getPublicGameState());

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
            if (ack) ack({ ok: false, error: 'Session not found' });
            return;
          }
          socket.data.participantId = p.id;
          socket.join('participants');
          socket.join(`participant:${p.id}`);

          const view = getParticipantView(p.id);
          socket.emit('participant:state', view);
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
      async (data: { choice: 'A' | 'B' }, ack?: Function) => {
        const participantId = socket.data.participantId;
        if (!participantId) {
          if (ack) ack({ ok: false, error: 'Not joined' });
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

    // -----------------------------------------------------------------------
    // Public screens (projector, admin) subscribe to public updates
    // -----------------------------------------------------------------------
    socket.on('public:subscribe', () => {
      socket.join('public');
      socket.emit('game:state', getPublicGameState());
    });

    // -----------------------------------------------------------------------
    // Admin: start game
    // -----------------------------------------------------------------------
    socket.on(
      'admin:start-game',
      async (data: { secret: string }, ack?: Function) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: 'Unauthorized' });
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
        },
        ack?: Function,
      ) => {
        if (!isAdminSecret(data.secret)) {
          if (ack) ack({ ok: false, error: 'Unauthorized' });
          return;
        }
        try {
          const round = await startRound({
            question: data.question,
            optionA: data.optionA,
            optionB: data.optionB,
          });

          // Broadcast new round to everyone
          const publicState = getPublicGameState();
          io.emit('game:state', publicState);
          io.emit('round:started', {
            roundNumber: round.roundNumber,
            question: round.question,
            optionA: round.optionA,
            optionB: round.optionB,
            status: round.status,
          });

          // Update each participant's personal state
          const game = getGame();
          for (const p of Object.values(game.participants)) {
            if (p.socketId) {
              io.to(p.socketId).emit('participant:state', getParticipantView(p.id));
            }
          }

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
          if (ack) ack({ ok: false, error: 'Unauthorized' });
          return;
        }
        try {
          const round = await closeVoting();

          const publicState = getPublicGameState();
          io.emit('game:state', publicState);
          io.emit('round:completed', {
            roundNumber: round.roundNumber,
            drawnNumber: round.drawnNumber,
            majorityVote: round.majorityVote,
            cellOpeners: round.cellOpeners,
            newBingoWinners: round.newBingoWinners,
          });

          // Update each participant's personal state
          const game = getGame();
          for (const p of Object.values(game.participants)) {
            if (p.socketId) {
              io.to(p.socketId).emit('participant:state', getParticipantView(p.id));
            }
          }

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
              message: `🎉 Bingo! ${winnerNames} got bingo!`,
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
          if (ack) ack({ ok: false, error: 'Unauthorized' });
          return;
        }
        try {
          await resetGame();
          io.emit('game:state', getPublicGameState());
          io.emit('game:reset', { message: 'Game has been reset' });
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
    });
  });
}
