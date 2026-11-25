import type { SpectatorRoom } from '../shared/protocol';
import { cardName } from './GameTable';
import { BarScene } from './BarScene';

type Props = {
  room: SpectatorRoom | null;
  connected: boolean;
  threeD: boolean
  onReconnect?: () => void
  onExit: () => void;
};

export function SpectatorTable({ room, connected, threeD, onReconnect, onExit }: Props) {
  const currentPlayer = room?.players.find(player => player.seat === room.turnSeat);
  const duo = room?.playerCount === 4;
  const teamName = (team: number) => {
    const names = room?.players
      .filter(player => player.team === team)
      .map(player => player.nickname)
      .join(' + ');

    return names || (duo ? `Dupla ${team + 1}` : 'Lugar vazio');
  };

  let status = 'Carregando a mesa…';
  if (!connected) {
    status = 'Reconectando à mesa…';
  } else if (room?.phase === 'WAITING') {
    const missing = room.playerCount - room.players.length;
    status = missing > 0
      ? `Aguardando ${missing} ${missing === 1 ? 'jogador' : 'jogadores'}.`
      : 'Aguardando os jogadores confirmarem o início.';
  } else if (room?.paused) {
    status = 'Partida pausada. Aguardando os jogadores voltarem.';
  } else if (room?.phase === 'PLAYING') {
    status = currentPlayer ? `Vez de ${currentPlayer.nickname}.` : 'Vaza em andamento.';
  } else if (room?.phase === 'TRICK') {
    status = 'Aguardando a próxima vaza.';
  } else if (room?.phase === 'HAND_FINISHED') {
    status = 'Aguardando a próxima mão.';
  } else if (room?.phase === 'MATCH_FINISHED') {
    status = 'Partida encerrada.';
  }

  return (
  <section className="spectator-page" aria-label="Mesa de truco em modo espectador">
    {!threeD && <div className="spectator-backdrop"><BarScene interior /></div>}

    <header className="spectator-header">
      <button className="back-link" onClick={onExit}>← Voltar ao salão</button>
      <h1>{room ? `Assistindo à mesa ${room.code}` : 'Assistindo à mesa'}</h1>
      {room && (
        <div className="spectator-score" aria-label="Placar">
          <span>{teamName(0)}</span>
          <strong>{room.score[0]} × {room.score[1]}</strong>
          <span>{teamName(1)}</span>
        </div>
      )}
    </header>

    <div className="spectator-hud">
      {room && room.phase !== 'WAITING' && (
        <small>Mão {room.handNumber} · Vaza {room.trickNumber} de 3</small>
      )}
      <p role="status">{status}</p>
      {onReconnect && (
        <button className="back-link" onClick={onReconnect}>Tentar reconectar</button>
      )}
      {room && (
        <ul className="spectator-players" aria-label="Jogadores da mesa">
          {room.players.map(player => {
            const card = room.played[player.seat];
            const hasTurn = connected && !room.paused &&
              room.phase === 'PLAYING' && player.seat === room.turnSeat;

            return (
              <li key={player.id} className={hasTurn ? 'spectator-turn' : undefined}>
                <strong>{player.nickname}</strong>
                {duo && <span>Dupla {player.team + 1}</span>}
                {room.phase !== 'WAITING' && <span>Cartas restantes: {player.cardCount}</span>}
                {card && (threeD
                  ? <span>Jogou {cardName(card)}</span>
                  : <img src={`/cards/${card}.png`} alt={cardName(card)} width={48} />)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  </section>
);
}