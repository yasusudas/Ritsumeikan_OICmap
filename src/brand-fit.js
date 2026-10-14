// Header title fallback for narrow screens.
// When the full site name ("立命館OICマップ" / "Ritsumeikan OIC Map") would be
// cut off with an ellipsis, show the short name ("OICマップ" / "OIC Map")
// instead, and switch back once the full name fits again.
//
// Markup: a [data-brand-fit] box holding
//   [data-brand-full]  the full name; a shrinkable one-line span with
//                      overflow: hidden and text-overflow: ellipsis
//   [data-brand-short] the short name; hidden by default and aria-hidden
// While the short name shows, the full name stays in the accessibility tree
// (visually hidden), so screen readers still read the full name.
//
// The check measures the real text, so it holds for any font, language or
// device width: on resize, after web fonts load, and when the language switch
// rewrites the name.

function fitBrand(box) {
  const full = box.querySelector('[data-brand-full]');
  const short = box.querySelector('[data-brand-short]');
  if (!full || !short) {
    return;
  }

  // Measure the full name in its normal state. Both class changes happen in
  // the same frame, so the browser never paints the intermediate state.
  full.classList.remove('visually-hidden');
  short.hidden = true;
  const isCut = full.scrollWidth - full.clientWidth > 1;
  full.classList.toggle('visually-hidden', isCut);
  short.hidden = !isCut;
  box.classList.toggle('is-brand-compact', isCut);
}

export function initBrandFit(root = document) {
  const boxes = Array.from(root.querySelectorAll('[data-brand-fit]'));
  if (boxes.length === 0) {
    return;
  }

  const fitAll = () => boxes.forEach(fitBrand);
  fitAll();

  // Watch the header row, whose width follows the viewport. (Not the title
  // itself: its width changes when the name is swapped.)
  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(fitAll);
    boxes.forEach((box) => {
      resizeObserver.observe(box.closest('.site-header-inner') ?? box.parentElement ?? box);
    });
  } else {
    window.addEventListener('resize', fitAll);
  }

  document.fonts?.ready.then(fitAll).catch(() => {});

  const textObserver = new MutationObserver(fitAll);
  boxes.forEach((box) => {
    box.querySelectorAll('[data-brand-full], [data-brand-short]').forEach((node) => {
      textObserver.observe(node, { childList: true, characterData: true, subtree: true });
    });
  });
}
