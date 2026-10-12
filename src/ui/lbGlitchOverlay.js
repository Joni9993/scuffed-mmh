// [LB] Vollbild-Overlay "Buffer Overflow" (Synthwave-Zielfernrohr): Vignette, Sonnen-Gitter-Horizont, Fadenkreuz mit rotierenden Ticks,
// Lauftext-Baender, grosses ∞, Scanlines. Reines DOM/CSS (keine Per-Frame-Arbeit im JS), liegt unter dem HUD (#fxlayer), pointer-events: none.
const CSS = `
#lbg{position:fixed;inset:0;pointer-events:none;z-index:5;overflow:hidden;font-family:monospace;opacity:0;transition:opacity .2s}
#lbg.on{opacity:1}
#lbg .vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 38%,rgba(255,43,214,.28) 70%,rgba(24,230,255,.5) 100%);mix-blend-mode:screen;animation:lbgv .5s steps(2) infinite}
#lbg .scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 2px,transparent 2px 4px);mix-blend-mode:multiply}
#lbg .rgb{position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,43,214,.1),transparent 12%,transparent 88%,rgba(24,230,255,.12));animation:lbgs 1.6s linear infinite}
#lbg .grid{position:absolute;left:-25%;right:-25%;bottom:0;height:30%;background:linear-gradient(rgba(255,43,214,.75) 2px,transparent 2px) 0 0/100% 18%,linear-gradient(90deg,rgba(24,230,255,.75) 2px,transparent 2px) 0 0/8% 100%;transform:perspective(40vmin) rotateX(62deg);transform-origin:50% 100%;-webkit-mask-image:linear-gradient(transparent,#000 60%);mask-image:linear-gradient(transparent,#000 60%);animation:lbgg .8s linear infinite}
#lbg .ret{position:absolute;left:var(--rx,50vw);top:var(--ry,44vh);width:30vmin;height:30vmin;margin:-15vmin 0 0 -15vmin}
#lbg .ret svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
#lbg .ret .tk{transform-origin:50% 50%;animation:lbgr 4s linear infinite}
#lbg .ret .tk2{transform-origin:50% 50%;animation:lbgr 2.4s linear infinite reverse}
#lbg .inf{position:absolute;left:calc(var(--rx,50vw) + 17vmin);top:calc(var(--ry,44vh) - 7vmin);font-size:max(30px,13vmin);font-weight:bold;color:#fff;text-shadow:3px 0 #ff2bd6,-3px 0 #18e6ff;animation:lbgf .3s steps(2) infinite}
#lbg .band{position:absolute;left:0;right:0;height:4.2vmin;overflow:hidden;white-space:nowrap;font-size:max(11px,3vmin);font-weight:bold;line-height:4.2vmin;color:#fff;background:linear-gradient(90deg,rgba(255,43,214,.75),rgba(24,230,255,.75))}
#lbg .band.t{top:11vmin}#lbg .band.b{bottom:30%;opacity:.8}
#lbg .band span{display:inline-block;padding-left:100%;animation:lbgm 7s linear infinite}
#lbg .band.b span{animation-direction:reverse}
@keyframes lbgm{to{transform:translateX(-100%)}}
@keyframes lbgr{to{transform:rotate(360deg)}}
@keyframes lbgg{to{background-position:0 18%,8% 0}}
@keyframes lbgv{50%{opacity:.7}}
@keyframes lbgs{50%{transform:translateX(1.2vmin)}}
@keyframes lbgf{50%{transform:translate(.6vmin,-.3vmin)}}
`;
const TEXT = 'BUFFER OVERFLOW ∞ NaN/∞ ∞ AMMO = undefined ∞ 0xDEADBEEF ∞ ';
let el = null;
export function startLbGlitch(root = (typeof document !== 'undefined' ? document.getElementById('fxlayer') ?? document.body : null)) {
  if (typeof document === 'undefined' || !root) return null;
  if (!document.getElementById('lbg-css')) { const s = document.createElement('style'); s.id = 'lbg-css'; s.textContent = CSS; document.head.appendChild(s); }
  if (!el) {
    el = document.createElement('div');
    el.id = 'lbg';
    const ticks = (n, r1, r2, c) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return `<line x1="${50 + Math.cos(a) * r1}" y1="${50 + Math.sin(a) * r1}" x2="${50 + Math.cos(a) * r2}" y2="${50 + Math.sin(a) * r2}" stroke="${c}" stroke-width="1.6"/>`; }).join('');
    el.innerHTML = `<div class="vig"></div><div class="rgb"></div><div class="grid"></div>
      <div class="band t"><span>${TEXT.repeat(4)}</span></div><div class="band b"><span>${TEXT.repeat(4)}</span></div>
      <div class="ret"><svg viewBox="0 0 100 100"><g class="tk">${ticks(24, 44, 49, '#18e6ff')}</g><g class="tk2">${ticks(8, 36, 42, '#ff2bd6')}</g>
        <circle cx="50" cy="50" r="30" fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="6 4"/><circle cx="50" cy="50" r="2" fill="#ff2bd6"/>
        <path d="M50 8v18M50 74v18M8 50h18M74 50h18" stroke="#fff" stroke-width="1.6"/></svg></div>
      <div class="inf">∞</div><div class="scan"></div>`;
  }
  if (el.parentNode !== root) root.appendChild(el);
  void el.offsetWidth;
  el.classList.add('on');
  return el;
}
export function stopLbGlitch() { if (!el) return; el.classList.remove('on'); const e = el; setTimeout(() => { if (!e.classList.contains('on')) e.remove(); }, 260); }
/** Fadenkreuz exakt auf den Lock-/Zielpunkt (Bildschirm 0..1) legen */
export function setLbReticle(x, y) { if (!el || !el.classList.contains('on')) return; el.style.setProperty('--rx', (x * 100).toFixed(2) + 'vw'); el.style.setProperty('--ry', (y * 100).toFixed(2) + 'vh'); }
export const lbGlitchActive = () => !!el && el.classList.contains('on');
