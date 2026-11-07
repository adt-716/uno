import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { View } from '../shared/types';
import { cardName, labels } from './card-labels';

type Props = { game: View; now: number; disabled: boolean; start: () => void };
type SeatPlayer = View['players'][number];

function CardPreview({ player, close }: { player: SeatPlayer; close: () => void }) {
 const ref = useRef<HTMLDialogElement>(null);
 useEffect(() => { ref.current?.showModal(); }, []);
 return <dialog className="card-preview panel" ref={ref} onCancel={close} aria-label={'Mặt ngược của ' + player.name}>
  <div className="preview-heading"><h2>Mặt ngược · {player.name}</h2><button className="quiet" onClick={close}>Đóng</button></div>
  <p className="muted">Các mặt ngược này công khai trong UNO Flip.</p>
  <div className="preview-cards">{player.backs?.map((image, i) => <img key={i} src={'/img/' + image} alt={'Mặt ngược lá ' + (i + 1)} />)}</div>
 </dialog>;
}

export function RoundTable({ game, now, disabled, start }: Props) {
 const [preview, setPreview] = useState<string | null>(null);
 const [roster, setRoster] = useState(false);
 const [results, setResults] = useState(false);
 const resultsRef = useRef<HTMLDialogElement>(null);
 useEffect(() => { setResults(game.status === 'finished'); }, [game.status, game.round]);
 useEffect(() => { if (results) resultsRef.current?.showModal(); }, [results]);
 const rosterRef = useRef<HTMLDialogElement>(null);
 useEffect(() => { if (roster) rosterRef.current?.showModal(); }, [roster]);
 const me = Math.max(0, game.players.findIndex(p => p.id === game.me));
 // Rotate only the presentation: the player's server index and turn order stay intact.
 const players = [...game.players.slice(me), ...game.players.slice(0, me)];
 const count = game.status === 'waiting' ? game.maxPlayers : players.length;
 const seats = Array.from({ length: count }, (_, i) => players[i]);
 const dark = game.mode === 'flip' && game.side === 'dark';
 const myTurn = game.status === 'playing' && game.players[game.turn]?.id === game.me;
 const selected = game.players.find(p => p.id === preview);
 const turnName = game.players[game.turn]?.name;
 const placements = game.placements ?? (game.winner ? [game.winner] : []);
 const back = game.mode === 'classic' ? 'backs/classic_back.png' : dark ? 'backs/flip_light_back.png' : 'backs/flip_dark_back.png';
 return <section className={'round-table ' + (dark ? 'night-table' : '')} aria-label="Bàn chơi tròn">
  <div className="table-meta">
   <span className="edition-pill">{game.mode === 'flip' ? 'UNO FLIP' : 'UNO CLASSIC'}{game.mode === 'flip' && <b> / {dark ? 'MẶT TỐI' : 'MẶT SÁNG'}</b>}</span>
   <span><button className="roster-button" onClick={() => setRoster(true)}>{game.kind === 'solo' ? 'Bạn + 3 máy' : game.players.length + '/' + game.maxPlayers + ' người'}</button><i />Ván {game.round || 1}</span>
  </div>
  <div className={'table-arena ' + (count > 6 ? 'many-seats' : '')} data-seat-count={count}>
   <div className="table-shadow" aria-hidden="true" />
   <div className="felt" aria-hidden="true"><div className="felt-stitch" /><span className="felt-mark">UNO<span>CLUB</span></span></div>
   <div className="table-direction" title={game.direction === 1 ? 'Theo chiều kim đồng hồ' : 'Ngược chiều kim đồng hồ'}>
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: game.direction === 1 ? undefined : 'scaleX(-1)' }}><path d="M19 8A8 8 0 1 0 20 15M19 3v5h-5" /></svg>
    <span>Chiều chơi</span>
   </div>
   <div className="table-seats" role="list" aria-label="Người chơi quanh bàn">
    {seats.map((p, i) => {
     const angle = Math.PI / 2 + 2 * Math.PI * i / count;
     const position = { '--seat-x': (50 + Math.cos(angle) * 40) + '%', '--seat-y': (50 + Math.sin(angle) * 38) + '%', '--seat-hue': (i * 61 + 145) % 360 } as CSSProperties;
     const active = p && game.status === 'playing' && game.players[game.turn]?.id === p.id;
     if (!p) return <div key={'empty-' + i} className="seat empty-seat" style={position} role="listitem" aria-label="Ghế trống"><span className="empty-avatar">+</span><span>Ghế trống</span></div>;
     const mine = p.id === game.me;
     const images = p.backs ?? Array.from({ length: Math.min(p.count, 5) }, () => back);
     const fan = images.slice(0, 5);
     const fanCards = <>{fan.map((image, j) => <img key={j} src={'/img/' + image} alt="" style={{ '--fan-angle': ((j - (fan.length - 1) / 2) * 11) + 'deg', '--fan-offset': ((j - (fan.length - 1) / 2) * 10) + 'px' } as CSSProperties} />)}<span className="card-count">{p.count}</span></>;
     return <div key={p.id} className={'seat ' + (mine ? 'my-seat ' : '') + (active ? 'active-seat ' : '') + (p.uno ? 'uno-seat' : '')} style={position} role="listitem" aria-label={p.name + (mine ? ', bạn' : '') + ', ' + p.count + ' lá, ' + p.score + ' điểm' + (active ? ', đang đến lượt' : '')}>
      <div className="seat-avatar"><span>{p.name.trim().split(/\s+/).at(-1)?.slice(0, 1).toUpperCase()}</span>{p.bot && <b className="machine-dot" title="Người chơi máy">M</b>}{game.status !== 'waiting' && game.players[game.dealer]?.id === p.id && <b className="dealer-dot" title="Người chia bài">D</b>}</div>
      <div className="seat-name" title={p.name}>{p.name}{mine && <b> BẠN</b>}</div>
      <div className="seat-info">{placements.includes(p.id) ? 'HẠNG ' + (placements.indexOf(p.id) + 1) : game.status === 'waiting' ? 'Sẵn sàng' : p.count + ' lá'}<span> · {p.score} đ</span></div>
      {!mine && game.status !== 'waiting' && fan.length > 0 && (p.backs ? <button className="seat-fan" onClick={() => setPreview(p.id)} aria-label={'Xem ' + p.count + ' mặt ngược của ' + p.name}>{fanCards}</button> : <div className="seat-fan" aria-hidden="true">{fanCards}</div>)}
      {active && <span className="seat-turn">ĐANG ĐÁNH</span>}
      {p.uno && <span className="seat-uno">UNO!</span>}
      {game.unoDeadlines?.[p.id] && <span className="uno-countdown">UNO · {Math.max(0, Math.ceil((game.unoDeadlines[p.id] - now) / 1000))}s</span>}
     </div>;
    })}
   </div>
   <div className="table-center">
    {game.status === 'waiting' ? <div className="center-waiting"><span className="center-kicker">MỜI BẠN VÀO BÀN</span><h2>Ngồi xuống,<br />chia cuộc vui.</h2><p>Cần ít nhất 2 người.</p>{game.host === game.me ? <button className="primary" disabled={game.players.length < 2 || disabled} onClick={start}>Chia bài →</button> : <p>Chờ chủ phòng…</p>}</div> : <>
     <div className={'felt-turn ' + (myTurn ? 'is-mine' : '')} aria-live="polite"><span>{game.status === 'finished' ? 'VÁN ĐÃ KẾT THÚC' : game.pending ? 'CHỜ XỬ LÝ WILD' : 'ĐẾN LƯỢT'}</span>{game.status === 'playing' && <><strong>{myTurn ? 'BẠN' : turnName}</strong><div className="felt-direction"><b aria-hidden="true">{game.direction === 1 ? '↻' : '↺'}</b><span>{game.direction === 1 ? 'Thuận kim đồng hồ' : 'Ngược kim đồng hồ'}</span></div></>}</div>
     <div className="center-piles">
      <div className="draw-pile"><b className="pile-label">CHỒNG RÚT</b><img src={'/img/' + (game.drawBack ?? back)} alt="Chồng bài rút — không phải lá đang đánh" /><span>{game.remaining} lá</span></div>
      <div className="discard-pile"><b className="pile-label">LÁ ĐANG ĐÁNH</b><img key={game.top?.id + game.side} src={'/img/' + game.top?.image} alt={game.top ? 'Lá đang đánh: ' + cardName(game.top) : ''} /><span className={'table-color ' + game.color}>{game.choosingColor ? 'Chọn màu…' : labels[game.color]}</span></div>
     </div>
     {game.status === 'finished' && <div className="center-result"><strong>{game.players.find(p => p.id === game.winner)?.name} về nhất!</strong><button className="quiet" onClick={() => setResults(true)}>Xem thứ hạng</button>{game.host === game.me && <button className="primary" disabled={disabled} onClick={start}>{game.champion ? 'Trận mới' : 'Ván tiếp'} →</button>}</div>}
    </>}
   </div>
  </div>
  <div className={'table-status ' + (myTurn ? 'your-turn' : '')} role="status"><i />{game.status === 'waiting' ? 'Chia sẻ mã phòng để mời bạn bè ngồi quanh bàn.' : game.status === 'finished' ? 'Một ván hay! Sẵn sàng cho ván tiếp theo?' : game.pending ? 'Chờ ' + turnName + ' nhận phạt hoặc thách thức.' : game.choosingColor ? 'Chờ ' + turnName + ' chọn màu.' : myTurn ? 'Đến lượt bạn — chọn một lá trên tay.' : turnName + ' đang suy nghĩ…'}</div>
  {selected && <CardPreview player={selected} close={() => setPreview(null)} />}
  {results && <dialog ref={resultsRef} className="card-preview panel rankings-dialog" aria-label="Kết quả ván chơi" onCancel={() => setResults(false)}>
   <div className="preview-heading"><h2>Thứ hạng · Ván {game.round}</h2><button className="quiet" onClick={() => setResults(false)}>Đóng</button></div>
   <p className="muted">Xếp theo thứ tự hết bài. Người còn lại cuối cùng xếp cuối.</p>
   <ol className="rankings">{placements.map((id, i) => { const p = game.players.find(p => p.id === id)!; return <li key={id} className={i === 0 ? 'rank-winner' : ''}><b>#{i + 1}</b><strong>{p.name}{id === game.me ? ' (bạn)' : ''}</strong><span>{p.count ? p.count + ' lá còn lại' : 'Đã hết bài'}</span></li>; })}</ol>
   {game.host === game.me ? <button className="primary" disabled={disabled} onClick={start}>Chơi ván tiếp →</button> : <p className="muted">Chờ chủ phòng mở ván tiếp.</p>}
  </dialog>}
  {roster && <dialog ref={rosterRef} className="card-preview panel" aria-label="Người chơi quanh bàn" onCancel={() => setRoster(false)}><div className="preview-heading"><h2>Người chơi</h2><button className="quiet" onClick={() => setRoster(false)}>Đóng</button></div><div className="roster-list">{players.map(p => <article key={p.id}><strong>{p.name}{p.id === game.me ? ' (bạn)' : ''}</strong><p>{p.count} lá · {p.score} điểm{p.bot ? ' · Máy' : ''}</p>{p.backs && <div className="preview-cards">{p.backs.map((image,i) => <img key={i} src={'/img/' + image} alt={'Mặt ngược lá ' + (i+1)} />)}</div>}</article>)}</div></dialog>}
 </section>;
}
