import React from 'react';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-sm select-none">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-purple-500/40 bg-slate-900 shadow-2xl shadow-purple-500/10">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 p-4 sm:p-5 text-white">
          <div className="flex items-center gap-2.5">
            <span className="text-xl sm:text-2xl">ℹ️</span>
            <h2 className="text-lg sm:text-xl font-bold tracking-wide">Comment Cimetière Clair a été fait</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 p-2 text-slate-400 hover:bg-slate-700 hover:text-white transition cursor-pointer"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6 space-y-3.5 text-slate-300 text-xs sm:text-sm leading-relaxed">
          <p>
            <strong className="text-purple-400">Stack :</strong> React 19, TypeScript 5.9, Tailwind CSS 4, Vite 7, typage strict, single-file HTML autonome.
          </p>
          <p>
            <strong className="text-purple-400">Graphismes :</strong> Canvas 2D haute performance avec système de halo lumineux dynamique : éclairage radial d ambiance, dégradés d ombres portées des tombes, vagues d ennemis spectraux.
          </p>
          <p>
            <strong className="text-purple-400">Musique &amp; sons :</strong> Moteur sonore Web Audio API générant une pulsation de tension sourde et des effets arcaniques d impacts spectraux.
          </p>
          <p>
            <strong className="text-purple-400">Interactions :</strong> Déplacement ZQSD / Flèches, orientation du halo de lumière protecteur à la souris ou au joystick tactile virtuel.
          </p>
          <p>
            <strong className="text-purple-400">Architecture :</strong> Moteur de jeu orienté entités (héros, orbes lumineuses, spectres, améliorations), transitions d état fluides (menu, jeu, montée de niveau, pause, fin).
          </p>
          <p>
            <strong className="text-purple-400">Algorithmes notables :</strong> Système d éclairage avec masques de composition destination-out / source-over, répulsion circulaire des ennemis par le cône de lumière, tirage aléatoire pondéré des cartes d amélioration (arbre de talents roguelite).
          </p>
        </div>

        <p className="px-4 pb-1 text-center text-[11px] text-slate-400">Créé par Geoffroy Streit (Hylst) avec l'aide d'une IA.</p>
        <div className="bg-slate-950 p-3 sm:p-4 text-center border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl font-bold text-white bg-purple-600 hover:bg-purple-500 transition cursor-pointer text-sm shadow-md"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
