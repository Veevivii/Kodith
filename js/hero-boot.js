/* ==========================================================================
   Hero art direction.

   Deliberately tiny, deliberately render-blocking. It only sets classes on
   <html>, so the CSS knows which hero to paint on the very first frame and
   the page never flashes the wrong one. All real work happens in main.js.
   ========================================================================== */
(function () {
  var root = document.documentElement;

  /* Marks that JS is alive. Reveal/entrance animations hide their elements
     only under `.js`, so with JS disabled everything renders visible. */
  root.className += " js";

  var reduced = false;
  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  var conn = navigator.connection || navigator.webkitConnection || {};
  var saveData = conn.saveData === true;
  var slowNet = /(^|-)2g$/.test(conn.effectiveType || "");

  /* No looping video for people who asked for less motion, are on Data Saver,
     or are on a 2G-class connection — they get the static frame instead. */
  root.className += (reduced || saveData || slowNet) ? " hero-static" : " hero-motion";

  /* Narrow viewports get the lighter 540p encode. matchMedia rather than
     innerWidth: it is reliable this early and matches the CSS breakpoint. */
  var small = true;
  try { small = window.matchMedia("(max-width: 768px)").matches; }
  catch (e) { small = window.innerWidth <= 768; }
  if (small) root.className += " hero-small";
})();
