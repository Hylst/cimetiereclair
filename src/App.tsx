import { InfoModal } from './components/InfoModal';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, H, W } from './game/engine';
import type { EndStats, Phase, UpgradeChoice } from './game/engine';

const fmtTime = (t: number) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;

export default function App() {
  const [showInfo, setShowInfo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [phase, setPhase] = useState<Phase>('menu');
  const [choices, setChoices] = useState<UpgradeChoice[]>([]);
  const [end, setEnd] = useState<EndStats | null>(null);
  const [muted, setMuted] = useState(false);
  const [best, setBest] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const game = new Game(canvas, {
      onPhase: (p) => {
        setPhase(p);
        if (p === 'menu') setBest(game.getBest());
      },
      onChoices: setChoices,
      onEnd: (s) => {
        setEnd(s);
        setBest(s.best);
      },
    });
    gameRef.current = game;
    setBest(game.getBest());
    game.attach();
    return () => game.destroy();
  }, []);

  const start = useCallback(() => gameRef.current?.start(), []);

  // raccourcis clavier des écrans
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g) return;
      const k = e.key.toLowerCase();
      if (k === 'm') setMuted(g.toggleMute());
      if ((phase === 'menu' || phase === 'gameover') && (k === 'enter' || k === ' ')) {
        e.preventDefault();
        start();
      }
      if (phase === 'levelup' && ['1', '2', '3', '&', 'é', '"'].includes(k)) {
        const idx = k === '1' || k === '&' ? 0 : k === '2' || k === 'é' ? 1 : 2;
        if (choices[idx]) g.choose(choices[idx].def.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, choices, start]);

  const overlay = 'absolute inset-0 flex flex-col items-center justify-center overflow-y-auto p-3 text-center';

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#05060f]">
      <div
        className="relative overflow-hidden shadow-[0_0_80px_rgba(255,120,30,0.15)]"
        style={{ aspectRatio: `${W} / ${H}`, width: `min(100vw, calc(100vh * ${W / H}))` }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            gameRef.current?.pointerDown(e.nativeEvent);
          }}
          onPointerMove={(e) => gameRef.current?.pointerMove(e.nativeEvent)}
          onPointerUp={(e) => gameRef.current?.pointerUp(e.nativeEvent)}
          onPointerCancel={(e) => gameRef.current?.pointerUp(e.nativeEvent)}
        />

        {/* boutons coin */}
        {(phase === 'playing' || phase === 'paused') && (
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button
              onClick={() => gameRef.current?.togglePause()}
              className="rounded-full border border-white/20 bg-black/50 px-3 py-1 text-xs text-amber-100/80 backdrop-blur hover:bg-black/70"
            >
              {phase === 'paused' ? '▶ Reprendre' : '⏸ Pause (P)'}
            </button>
          </div>
        )}
        <button
          onClick={() => setMuted(gameRef.current!.toggleMute())}
          className="absolute bottom-2 left-2 rounded-full border border-white/20 bg-black/50 px-3 py-1 text-xs text-amber-100/80 backdrop-blur hover:bg-black/70"
          aria-label="Son"
        >
          {muted ? '🔇 Son coupé' : '🔊 Son (M)'}
        </button>

        {/* MENU */}
        {phase === 'menu' && (
          <div className={`${overlay} bg-[radial-gradient(ellipse_at_center,rgba(5,6,15,0.55),rgba(5,6,15,0.92))]`}>
            <div className="pop flex max-w-xl flex-col items-center gap-3 sm:gap-5">
              <div className="text-4xl sm:text-6xl">🎃</div>
              <h1 className="glow-title font-creep text-4xl tracking-wide text-amber-300 sm:text-7xl">Cimetière Clair</h1>
              <p className="font-creep text-xs uppercase tracking-[0.3em] text-amber-200/70 sm:text-sm">Le Cimetière Lumineux</p>
              <p className="max-w-md text-xs leading-relaxed text-amber-50/80 sm:text-base">
                Tu es la citrouille magique qui veille sur le cimetière. Des vagues de squelettes sortent de terre :
                ta lumière est ta seule arme… et ton seul abri.
              </p>
              <div className="grid grid-cols-1 gap-x-8 gap-y-1 rounded-xl border border-amber-200/10 bg-black/40 px-4 py-2 text-[11px] text-amber-50/70 sm:grid-cols-2 sm:px-6 sm:py-3 sm:text-sm">
                <span>⌨️ <b className="text-amber-200">ZQSD / WASD / Flèches</b> : se déplacer</span>
                <span>📱 <b className="text-amber-200">Glisser</b> : joystick tactile</span>
                <span>✨ Tir <b className="text-amber-200">automatique</b> sur l’ennemi le plus proche</span>
                <span>🕯️ Les squelettes sont <b className="text-amber-200">ralentis dans la lumière</b></span>
              </div>
              <button
                onClick={start}
                className="rounded-full bg-gradient-to-b from-amber-300 to-orange-500 px-8 py-2 font-bold text-[#2b0f00] shadow-[0_0_30px_rgba(255,150,40,0.5)] transition hover:scale-105 active:scale-95 sm:px-10 sm:py-3 sm:text-lg"
              >
                Allumer la lumière
              </button>
              {best > 0 && <div className="text-xs text-amber-200/70 sm:text-sm">🏆 Meilleur score : {best}</div>}
              <p className="text-[10px] text-amber-200/60">Créé par Geoffroy Streit (Hylst) avec l'aide d'une IA.</p>
            </div>
          </div>
        )}

        {/* NIVEAU SUPÉRIEUR */}
        {phase === 'levelup' && (
          <div className={`${overlay} bg-black/65 backdrop-blur-[2px]`}>
            <h2 className="pop font-creep text-3xl text-amber-300 sm:text-5xl" style={{ textShadow: '0 0 24px rgba(255,160,40,.8)' }}>
              Niveau supérieur !
            </h2>
            <p className="mb-3 text-xs text-amber-50/70 sm:mb-6 sm:text-sm">Choisis un pouvoir (touches 1 · 2 · 3)</p>
            <div className="flex w-full max-w-3xl flex-col gap-2 sm:flex-row sm:gap-4">
              {choices.map((c, i) => (
                <button
                  key={c.def.id}
                  onClick={() => gameRef.current?.choose(c.def.id)}
                  style={{ animationDelay: `${i * 80}ms` }}
                  className="pop group flex flex-1 flex-row items-center gap-3 rounded-2xl border border-amber-200/20 bg-gradient-to-b from-[#2a1d3d] to-[#140f22] p-3 text-left transition hover:-translate-y-1 hover:border-amber-300/70 hover:shadow-[0_0_30px_rgba(255,170,60,0.35)] sm:flex-col sm:gap-2 sm:p-5 sm:text-center"
                >
                  <div className="text-3xl transition group-hover:scale-110 sm:text-5xl">{c.def.icon}</div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-amber-200 sm:text-base">{c.def.name}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-amber-50/70 sm:mt-1 sm:text-sm">{c.def.desc}</div>
                    <div className="mt-1 flex gap-1 sm:mt-2 sm:justify-center">
                      {Array.from({ length: c.def.max }).map((_, k) => (
                        <span
                          key={k}
                          className={`h-1.5 w-3 rounded-full sm:h-2 sm:w-4 ${k <= c.level ? 'bg-amber-400' : 'bg-white/15'} ${k === c.level ? 'animate-pulse' : ''}`}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="hidden rounded border border-white/20 px-2 text-xs text-white/50 sm:block">{i + 1}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PAUSE */}
        {phase === 'paused' && (
          <div className={`${overlay} gap-3 bg-black/60 backdrop-blur-[2px]`}>
            <h2 className="font-creep text-4xl text-amber-300 sm:text-6xl">Pause</h2>
            <div className="flex gap-3">
              <button onClick={() => gameRef.current?.togglePause()} className="rounded-full bg-amber-400 px-6 py-2 font-bold text-[#2b0f00] hover:bg-amber-300">
                Reprendre
              </button>
              <button onClick={() => gameRef.current?.toMenu()} className="rounded-full border border-amber-200/40 px-6 py-2 text-amber-100 hover:bg-white/10">
                Menu
              </button>
            </div>
            <p className="text-xs text-white/50">P ou Échap pour reprendre</p>
          </div>
        )}

        {/* FIN */}
        {phase === 'gameover' && end && (
          <div className={`${overlay} bg-[radial-gradient(ellipse_at_center,rgba(60,0,0,0.55),rgba(5,0,0,0.92))]`}>
            <div className="pop flex flex-col items-center gap-3 sm:gap-4">
              <div className="text-4xl sm:text-5xl">💀</div>
              <h2 className="font-creep text-4xl text-red-400 sm:text-6xl" style={{ textShadow: '0 0 28px rgba(255,40,20,.7)' }}>
                La lumière s’éteint…
              </h2>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 sm:gap-3">
                {[
                  ['Vague', end.wave],
                  ['Squelettes', end.kills],
                  ['Niveau', end.level],
                  ['Temps', fmtTime(end.time)],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-xl border border-white/10 bg-black/40 px-4 py-2">
                    <div className="text-[10px] uppercase tracking-widest text-white/50 sm:text-xs">{l}</div>
                    <div className="text-xl font-bold text-amber-200 sm:text-2xl">{v}</div>
                  </div>
                ))}
              </div>
              <div className="text-lg text-amber-100 sm:text-xl">
                Score : <b className="text-amber-300">{end.score}</b>
                {end.isBest ? <span className="ml-2 text-emerald-300">🏆 Nouveau record !</span> : <span className="ml-2 text-sm text-white/50">(record : {end.best})</span>}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={start}
                  className="rounded-full bg-gradient-to-b from-amber-300 to-orange-500 px-8 py-2 font-bold text-[#2b0f00] shadow-[0_0_30px_rgba(255,150,40,0.5)] transition hover:scale-105 active:scale-95"
                >
                  Rejouer
                </button>
                <button onClick={() => gameRef.current?.toMenu()} className="rounded-full border border-amber-200/40 px-6 py-2 text-amber-100 hover:bg-white/10">
                  Menu
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    
      {/* Bouton Infos technique */}
      <button
        onClick={() => setShowInfo(true)}
        className="fixed top-2.5 right-2.5 z-[100] flex items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-900/80 px-2 py-1 text-xs text-amber-200 shadow-md backdrop-blur hover:bg-slate-800 transition cursor-pointer select-none"
        title="Comment ce jeu a été fait"
        aria-label="Infos sur le jeu"
      >
        <span>ℹ️</span>
        <span className="hidden sm:inline">Infos</span>
      </button>
      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} />
</div>
  );
}
