// Multi-touch check: stick finger held + tap on item strip slot (2nd pointer) must reach the click handler once.
import { open } from './pw-lib.mjs';
const { browser, page, errors } = await open('scene=hunt&quest=jaggo&god=1&touch=1');
const r = await page.evaluate(() => {
  const pe = (t, id, x, y, el) => (el || document.body).dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const d = document.createElement('div'); d.className = 'ui-hit';
  d.style.cssText = 'position:fixed;left:400px;top:300px;z-index:99';
  d.innerHTML = '<button class="hh-slot" data-i="2">x</button>'; document.body.appendChild(d);
  let clicks = 0; d.addEventListener('click', () => clicks++);
  const b = d.firstChild;
  pe('pointerdown', 1, 80, 250); pe('pointermove', 1, 130, 250);
  pe('pointerdown', 2, 410, 310, b); pe('pointerup', 2, 410, 310, b);
  const afterTap = clicks;
  b.dispatchEvent(new PointerEvent('click', { pointerType: 'touch', bubbles: true, cancelable: true })); // native touch click: swallowed
  const out = { afterTap, afterNative: clicks };
  pe('pointerup', 1, 130, 250);
  return out;
});
console.log(JSON.stringify(r), errors);
await browser.close();
