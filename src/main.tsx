import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { colors, darkColors, type Action, type Color, type Mode, type RoomKind, type PublicCard, type View } from '../shared/types';
import { Rules } from './rules';
import { RoundTable } from './round-table';
import { cardName, labels } from './card-labels';
import './style.css';

const socket = io({ autoConnect: false });
function ColorDialog({ choices, close, choose }: { choices: readonly Color[]; close: () => void; choose: (c: Color) => void }) {
 const ref = useRef<HTMLDialogElement>(null);
 useEffect(() => { ref.current?.showModal(); }, []);
 return <dialog ref={ref} className="color-dialog panel" onCancel={close} aria-label="Chọn màu tiếp theo">
  <h2>Chọn màu tiếp theo</h2>
  <div className="color-picker">{choices.map(c => <button key={c} className={c} onClick={() => choose(c)}>{labels[c]}</button>)}</div>
  <button className="quiet" onClick={close}>Hủy</button>
 </dialog>;
}
function Overlay({ label, close, children }: { label: string; close?: () => void; children: React.ReactNode }) {
 const ref = useRef<HTMLDialogElement>(null);
 useEffect(() => { ref.current?.showModal(); }, []);
 return <dialog ref={ref} className="screen-overlay panel" aria-label={label} onCancel={e => { if (close) close(); else e.preventDefault(); }}>
  <div className="overlay-heading"><h2>{label}</h2>{close && <button className="quiet" onClick={close}>Đóng</button>}</div>
  <div className="overlay-content">{children}</div>
 </dialog>;
}
function App() {
 const [game, setGame] = useState<View | null>(null);
 const [name, setName] = useState('');
 const [code, setCode] = useState(new URLSearchParams(location.search).get('room') ?? '');
 const [mode, setMode] = useState<Mode>('classic');
 const [kind, setKind] = useState<RoomKind>('online'), [maxPlayers, setMaxPlayers] = useState(10);
 const [online, setOnline] = useState(false), [busy, setBusy] = useState(false);
 const [error, setError] = useState(''), [notice, setNotice] = useState('');
 const [selected, setSelected] = useState<PublicCard | null>(null);
 const [uno, setUno] = useState(false), [rules, setRules] = useState(false);
 const [history, setHistory] = useState(false), [evidence, setEvidence] = useState(false);
 const [clock, setClock] = useState(Date.now()), [offset, setOffset] = useState(0);
 function accept(v: View) { setOffset(Date.now() - (v.serverNow ?? Date.now())); setGame(old => !old || old.code !== v.code || v.version >= old.version ? v : old); }
 useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 100); return () => clearInterval(timer); }, []);
 useEffect(() => { if (!game?.reveal) setEvidence(false); }, [game?.reveal]);
 useEffect(() => {
  socket.on('state', (v: View) => { if (!sessionStorage.getItem('uno-show-lobby')) accept(v); });
  socket.on('connect', () => {
   setOnline(true);
   const token = localStorage.getItem('uno-session');
   if (token && !sessionStorage.getItem('uno-show-lobby')) {
    socket.timeout(8000).emit('resume', token, (err: Error | null, r: any) => {
     if (err || !r?.ok) { setError(r?.error ?? 'Không thể khôi phục phiên.'); return; }
     if (!sessionStorage.getItem('uno-show-lobby')) accept(r.state);
    });
   }
  });
  socket.on('disconnect', () => setOnline(false));
  socket.on('connect_error', () => { setOnline(false); setError('Không kết nối được server.'); });
  socket.connect();
  return () => { socket.removeAllListeners(); socket.disconnect(); };
 }, []);
 useEffect(() => { setSelected(null); setUno(false); }, [game?.code, game?.me, game?.round, game?.turn, game?.side, game?.hand.length]);
 // An unrelated UNO call increments the room version without invalidating this move.
 useEffect(() => {
  setSelected(current => {
   if (!current) return null;
   return game?.status === 'playing' && game.players[game.turn]?.id === game.me &&
    !game.pending && !game.choosingColor && (!game.drawn || game.drawn === current.id) &&
    game.hand.some(c => c.id === current.id) ? current : null;
  });
 }, [game]);
 async function request(event: string, data: unknown) {
  setBusy(true); setError(''); setNotice('');
  try {
   const r: any = await socket.timeout(10000).emitWithAck(event, data);
   if (!r.ok) throw new Error(r.error);
   if (r.token) localStorage.setItem('uno-session', r.token);
   if (event === 'enter' || event === 'resume') sessionStorage.removeItem('uno-show-lobby');
   if (r.state) accept(r.state);
  } catch (e) { setError(e instanceof Error ? e.message : 'Kết nối bị gián đoạn.'); }
  finally { setBusy(false); }
 }
 function send(a: Action) { if (game) void request('action', { ...a, version: game.version }); }
 function play(c: PublicCard) { if (c.color === 'wild') setSelected(c); else send({ type: 'play', cardId: c.id, uno }); }
 const myTurn = game?.status === 'playing' && game.players[game.turn]?.id === game.me;
 const blocked = busy || !online;
 const canAct = myTurn && !game?.pending && !game?.choosingColor;
 const canPlay = (c: PublicCard) => canAct && (!game?.drawn || game.drawn === c.id) &&
  (c.color === 'wild' || c.color === game?.color || c.value === game?.top?.value);
 const choices = game?.mode === 'flip' && game.side === 'dark' ? darkColors : colors;
 const title = game?.mode === 'flip' ? 'UNO FLIP' : 'UNO CLASSIC';
 function toLobby() { sessionStorage.setItem('uno-show-lobby', '1'); setSelected(null); setGame(null); }
 const now = clock - offset;
 const unoLeft = game?.unoDeadlines?.[game.me] ? Math.max(0, Math.ceil((game.unoDeadlines[game.me] - now) / 1000)) : 0;
 return <div className={'shell ' + (game ? 'in-game' : 'in-lobby')}>
  <header className="flex items-center justify-between gap-4">
   <a className="brand" href="/">UNO<span>CLUB</span><i /></a>
   <div className="flex items-center gap-4"><span className="connection"><i className={online ? 'on' : ''} />{online ? 'Đã kết nối' : 'Đang kết nối'}</span>
    {game && <button className="quiet" onClick={() => setHistory(true)}>Diễn biến</button>}
    <button className="quiet" onClick={() => setRules(!rules)} aria-expanded={rules}>Luật chơi</button></div>
  </header>
  <main>
   {error && <div role="alert" className="error">{error}<button aria-label="Đóng thông báo" onClick={() => setError('')}>×</button></div>}
   {notice && <p role="status" className="notice">{notice}</p>}
   {!game ? <div className="welcome">
    <section>
     <p className="eyebrow">MỘT BỘ BÀI. CẢ HỘI BẠN.</p>
     <h1>Thêm một lá.<br /><em>Thêm cuộc vui.</em></h1>
     <p className="intro">Chọn Classic quen thuộc hoặc Flip hai mặt.<br />Hẹn hội bạn vào bàn và cùng hô UNO.</p>
     <div className="hero-cards" aria-hidden="true">{['blue/number_7', 'red/skip', 'yellow/number_8', 'wild/wild'].map((p, i) =>
      <img key={p} style={{ '--i': i } as React.CSSProperties} src={'/img/cards/classic/' + p + '.png'} alt="" />)}</div>
     <div className="features"><span>02–10 người chơi</span><span>Bạn + 3 máy</span><span>Classic & Flip</span></div>
    </section>
    <section className="entry panel">
     <p className="eyebrow">SẴN SÀNG CHƯA?</p><h2>Vào bàn thôi.</h2><p className="muted">Một ván bài vui bắt đầu từ đây.</p>
     <form onSubmit={e => { e.preventDefault(); void request('enter', { name, mode, kind, maxPlayers, ...(code ? { code: code.toUpperCase() } : {}) }); }}>
      <label className="name-field">Tên của bạn<input required maxLength={24} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)} placeholder="Bạn bè gọi bạn là…" /></label>
      <label className="room-field">Mã phòng <span className="muted">· để trống tạo mới</span><input maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="VD: ABC234" className="room-input" /></label>
      {!code && <fieldset className="mode-picker kind-picker"><legend>Chơi cùng ai?</legend>{(['online', 'solo'] as const).map(k =>
       <label key={k} className={kind === k ? 'chosen' : ''}><input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} /><strong>{k === 'online' ? 'Bạn bè' : 'Chơi với máy'}</strong><small>{k === 'online' ? 'Phòng 2–10 người' : 'Bạn và 3 máy'}</small></label>)}</fieldset>}
      {!code && kind === 'online' && <label className="capacity-field">Sức chứa phòng<select value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))}>{Array.from({length:9},(_,i)=>i+2).map(n=><option key={n} value={n}>{n} người</option>)}</select></label>}
      {!code && <fieldset className="mode-picker game-picker"><legend>Chế độ chơi</legend>{(['classic', 'flip'] as const).map(m =>
       <label key={m} className={mode === m ? 'chosen' : ''}><input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} /><strong>{m === 'classic' ? 'Classic' : 'Flip'}</strong><small>{m === 'classic' ? '108 lá · Quen thuộc' : '112 lá · Hai mặt'}</small></label>)}</fieldset>}
      {code && <p className="muted text-xs mb-4">Chế độ sẽ theo phòng bạn tham gia.</p>}
      <button className="primary w-full" disabled={blocked}>{busy ? 'Đang mở bàn…' : code ? 'Tham gia phòng →' : kind === 'solo' ? 'Chơi với 3 máy →' : 'Tạo phòng mới →'}</button>
     </form>
     {sessionStorage.getItem('uno-show-lobby') && localStorage.getItem('uno-session') && <button className="quiet w-full mt-3" disabled={blocked} onClick={() => void request('resume', localStorage.getItem('uno-session'))}>Quay lại phòng trước</button>}
     <div className="entry-note">CLASSIC & FLIP <span>•</span> BẠN BÈ & MÁY</div>
    </section>
   </div> : <>
    <div className="room-heading"><div><p className="eyebrow">BÀN CHƠI CỦA BẠN · {title}</p><h2>Phòng <span className="code">{game.code}</span></h2></div>
     <div className="flex gap-2 flex-wrap justify-end"><button className="quiet" disabled={busy} onClick={toLobby}>Về sảnh</button>{game.kind !== 'solo' && <button className="quiet" onClick={() => {
      void navigator.clipboard.writeText(location.origin + '/?room=' + game.code).then(() => setNotice('Đã sao chép link mời.'), () => setNotice('Mã phòng: ' + game.code));
     }}>Sao chép link mời</button>}</div></div>
    <div className="game-layout">
     <RoundTable game={game} now={now} disabled={blocked} start={() => send({ type: 'start' })} />
    </div>
    {game.status === 'playing' && game.choosingColor === game.me && <Overlay label="Chọn màu để tiếp tục"><div className="color-picker">{choices.map(c => <button className={c} key={c} disabled={blocked} onClick={() => send({ type: 'chooseColor', color: c })}>{labels[c]}</button>)}</div></Overlay>}
    {game.status === 'playing' && game.pending?.target === game.me && <Overlay label={labels[game.pending.kind] + ' · Bạn chọn gì?'}>
     {game.unoDeadlines?.[game.me] && <button className="primary uno-call" disabled={blocked || !unoLeft} onClick={() => send({ type: 'uno' })}>UNO! · {unoLeft}s</button>}
     <p>{game.pending.kind === 'wild_draw_color' ? 'Nhận phạt: rút đến khi có lá ' + labels[game.pending.color] + ', rồi mất lượt.' : 'Nhận phạt: rút ' + (game.pending.kind === 'wild_draw_four' ? '4' : '2') + ' lá rồi mất lượt.'}</p>
     <p className="muted">Màu trước khi đánh Wild: {labels[game.pending.previousColor]}. Thách thức nếu người đánh vẫn có lá màu này. Đúng: họ nhận phạt, bạn giữ lượt. Sai: bạn nhận phạt thêm 2 lá và mất lượt.</p>
     <div className="flex gap-3 flex-wrap"><button className="primary" disabled={blocked} onClick={() => send({ type: 'accept' })}>Nhận phạt</button><button className="quiet" disabled={blocked} onClick={() => send({ type: 'challenge' })}>Thách thức</button></div>
    </Overlay>}
    {game.reveal && evidence && <Overlay label="Bài được mở sau thách thức" close={() => setEvidence(false)}><p className="muted">Chỉ bạn thấy các lá người bị thách thức còn giữ tại thời điểm đánh Wild.</p><div className="revealed-cards">{game.reveal.cards.length ? game.reveal.cards.map(c => <img key={c.id} src={'/img/' + c.image} alt={cardName(c)} />) : <p>Người này không còn lá nào.</p>}</div></Overlay>}
    {game.status !== 'waiting' && <section className="hand-area">
     <div className="hand-heading"><div><p className="eyebrow">{game.placements?.includes(game.me) ? 'THỨ HẠNG CỦA BẠN' : 'BÀI CỦA BẠN'}</p><h3>{game.placements?.includes(game.me) ? 'Hạng ' + (game.placements.indexOf(game.me) + 1) : <>{game.hand.length} lá <span className="hand-title-detail">trên tay</span></>}</h3></div>
      <div className="hand-actions">
       {game.status === 'playing' && game.unoDeadlines?.[game.me] && <button className="primary uno-call" disabled={blocked || !unoLeft} onClick={() => send({ type: 'uno' })}>UNO! · {unoLeft}s</button>}
       {game.reveal && <button className="quiet" onClick={() => setEvidence(true)}>Bằng chứng</button>}
       {!game.unoDeadlines?.[game.me] && <label className="uno-check" title="Hô UNO tự động khi đánh còn 1 lá"><input type="checkbox" checked={uno} onChange={e => setUno(e.target.checked)} disabled={!canAct || blocked} />UNO tự động</label>}
       <button className="primary" disabled={!canAct || blocked} onClick={() => send({ type: game.drawn ? 'pass' : 'draw' })}>{game.drawn ? 'Bỏ lượt' : 'Rút +1'}</button>
      </div>
     </div>
     <div className="hand">{game.hand.map(c => <button key={c.id} className={'hand-card ' + (canPlay(c) ? 'playable' : '')} title={cardName(c)} disabled={!canPlay(c) || blocked} onClick={() => play(c)}><img src={'/img/' + c.image} alt={cardName(c)} /></button>)}</div>
    </section>}
    {game.status === 'waiting' && <div className="waiting-dock">Mời bạn bè bằng mã <strong>{game.code}</strong><span> · Bắt đầu khi đủ 2 người</span></div>}
   </>}
   {rules && <Overlay label="Luật chơi" close={() => setRules(false)}><Rules /></Overlay>}
   {history && game && <Overlay label="Diễn biến & điểm" close={() => setHistory(false)}><div className="score-list">{game.players.map(p => <p key={p.id}><strong>{p.name}</strong><span>{p.score} điểm · {p.count} lá</span></p>)}</div><ol className="event-list">{game.log.map((line, i) => <li key={i}>{line}</li>)}</ol></Overlay>}
  </main>
  <footer><span>UNO CLUB <b> / </b> Một chút chiến thuật. Rất nhiều niềm vui.</span><span>CLASSIC & FLIP · MỤC TIÊU 500 ĐIỂM</span></footer>
  {selected && <ColorDialog choices={choices} close={() => setSelected(null)} choose={color => { send({ type: 'play', cardId: selected.id, color, uno }); setSelected(null); }} />}
 </div>;
}
createRoot(document.getElementById('root')!).render(<App />);


