// =============================================================================
// Ducks Unlimited — Slideshow (for the "Slideshow" homepage section)
// =============================================================================
// The section's HTML (from /js/section-templates.js) stacks all slides and
// hides every slide but the first — so without JavaScript, the first slide
// shows. This file adds:
//   - Previous / Next arrows and one dot per slide
//   - changing slides every few seconds (if "Change slides automatically")
//   - pausing while the mouse is over it or a button inside has focus
//   - a Pause / Play button (phones have no "mouse over", and everyone must
//     be able to stop moving content — an accessibility rule)
//   - no automatic changes for people whose device asks for less motion
//
// It runs on page load, and again whenever the homepage sections are redrawn
// (the editor's live preview redraws them as you type).
// =============================================================================

const started = new WeakSet();

export function initSlideshows(root = document) {
  root.querySelectorAll('[data-slideshow]').forEach((el) => {
    if (started.has(el)) return;
    started.add(el);
    setUp(el);
  });
}

function setUp(show) {
  const slides = [...show.querySelectorAll('.slideshow__slide')];
  if (slides.length < 2) return;

  let current = 0;
  let timer = null;
  let paused = false;

  // Arrows + dots.
  const controls = document.createElement('div');
  controls.className = 'slideshow__controls';
  controls.innerHTML = `
    <button type="button" class="slideshow__arrow" data-dir="-1" aria-label="Previous slide">‹</button>
    <div class="slideshow__dots">
      ${slides.map((_, i) => `<button type="button" class="slideshow__dot" data-go="${i}" aria-label="Show slide ${i + 1}"></button>`).join('')}
    </div>
    <button type="button" class="slideshow__arrow" data-dir="1" aria-label="Next slide">›</button>
  `;
  show.appendChild(controls);

  controls.addEventListener('click', (e) => {
    const arrow = e.target.closest('[data-dir]');
    const dot = e.target.closest('[data-go]');
    if (arrow) go(current + Number(arrow.dataset.dir));
    if (dot) go(Number(dot.dataset.go));
  });

  function go(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach((s, i) => { s.hidden = i !== current; });
    controls.querySelectorAll('.slideshow__dot').forEach((d, i) => {
      d.setAttribute('aria-current', i === current ? 'true' : 'false');
    });
  }
  go(0);

  // Automatic changes.
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const autoplay = show.dataset.autoplay !== 'false' && !reduceMotion;
  const seconds = Math.min(10, Math.max(3, Number(show.dataset.seconds) || 5));
  if (!autoplay) return;

  // Pause / Play button — stays paused until pressed again.
  let stopped = false;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'slideshow__toggle';
  const label = () => {
    toggle.textContent = stopped ? '▶' : '❚❚';
    toggle.setAttribute('aria-label', stopped ? 'Play slideshow' : 'Pause slideshow');
  };
  label();
  toggle.addEventListener('click', () => { stopped = !stopped; label(); });
  controls.appendChild(toggle);

  show.addEventListener('mouseenter', () => { paused = true; });
  show.addEventListener('mouseleave', () => { paused = false; });
  show.addEventListener('focusin',    () => { paused = true; });
  show.addEventListener('focusout',   () => { paused = false; });

  timer = setInterval(() => {
    // The section was redrawn or removed → stop this timer.
    if (!show.isConnected) { clearInterval(timer); return; }
    if (!paused && !stopped && !document.hidden) go(current + 1);
  }, seconds * 1000);
}

// Run on load, and whenever sections are redrawn. "sections:rendered" doesn't
// bubble, so we listen in the capture phase, which sees it anyway.
initSlideshows();
document.addEventListener('sections:rendered', (e) => initSlideshows(e.target), true);
