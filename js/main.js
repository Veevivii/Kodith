/* ==========================================================================
   KODITH — behaviour

   Renders the three data-driven sections and wires up the nav, reveals,
   hero video and FAQ. Content comes from GET /api/data (the database-backed
   admin dashboard) when that's reachable, falling back to the bundled
   /site-data.js otherwise — see boot() at the bottom of this file.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduced = false;
  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  var data = { upcoming: [], projects: [], team: [] };   /* replaced by boot() once real data arrives */

  /* ---------------------------------------------------------------- utils */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* Same mascot markup as the two static placements in index.html (hero CTA,
     Join section) — kept here too since this one is conditional (only shown
     when there's nothing on the calendar) and has to be JS-rendered. */
  var MASCOT_SVG =
    '<svg class="mascot" aria-hidden="true" viewBox="0 0 15 21" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">' +
    '<rect x="4" y="0" width="1" height="1" fill="var(--text)"/><rect x="10" y="0" width="1" height="1" fill="var(--text)"/>' +
    '<rect x="4" y="1" width="1" height="1" fill="var(--text)"/><rect x="10" y="1" width="1" height="1" fill="var(--text)"/>' +
    '<rect x="3" y="2" width="2" height="1" fill="var(--text)"/><rect x="10" y="2" width="2" height="1" fill="var(--text)"/>' +
    '<rect x="3" y="3" width="2" height="1" fill="var(--text)"/><rect x="10" y="3" width="2" height="1" fill="var(--text)"/>' +
    '<rect x="4" y="4" width="1" height="1" fill="var(--text)"/><rect x="10" y="4" width="1" height="1" fill="var(--text)"/>' +
    '<rect x="2" y="5" width="11" height="1" fill="var(--accent-warm)"/><rect x="1" y="6" width="13" height="1" fill="var(--accent-warm)"/>' +
    '<rect x="1" y="7" width="3" height="1" fill="var(--accent-warm)"/><rect x="4" y="7" width="1" height="1" fill="var(--bg)"/>' +
    '<rect x="5" y="7" width="3" height="1" fill="var(--accent-warm)"/><rect x="8" y="7" width="1" height="1" fill="var(--bg)"/>' +
    '<rect x="9" y="7" width="5" height="1" fill="var(--accent-warm)"/><rect x="1" y="8" width="3" height="1" fill="var(--accent-warm)"/>' +
    '<rect x="4" y="8" width="1" height="1" fill="var(--bg)"/><rect x="5" y="8" width="2" height="1" fill="var(--accent-warm)"/>' +
    '<rect x="7" y="8" width="1" height="1" fill="var(--bg)"/><rect x="8" y="8" width="6" height="1" fill="var(--accent-warm)"/>' +
    '<rect x="1" y="9" width="3" height="1" fill="var(--accent-warm)"/><rect x="4" y="9" width="3" height="1" fill="var(--bg)"/>' +
    '<rect x="7" y="9" width="7" height="1" fill="var(--accent-warm)"/><rect x="1" y="10" width="3" height="1" fill="var(--accent-warm)"/>' +
    '<rect x="4" y="10" width="1" height="1" fill="var(--bg)"/><rect x="5" y="10" width="2" height="1" fill="var(--accent-warm)"/>' +
    '<rect x="7" y="10" width="1" height="1" fill="var(--bg)"/><rect x="8" y="10" width="6" height="1" fill="var(--accent-warm)"/>' +
    '<rect x="1" y="11" width="3" height="1" fill="var(--accent-warm)"/><rect x="4" y="11" width="1" height="1" fill="var(--bg)"/>' +
    '<rect x="5" y="11" width="3" height="1" fill="var(--accent-warm)"/><rect x="8" y="11" width="1" height="1" fill="var(--bg)"/>' +
    '<rect x="9" y="11" width="5" height="1" fill="var(--accent-warm)"/><rect x="2" y="12" width="11" height="1" fill="var(--accent-warm)"/>' +
    '<rect x="2" y="13" width="13" height="1" fill="var(--text)"/><rect x="1" y="14" width="14" height="1" fill="var(--text)"/>' +
    '<rect x="1" y="15" width="2" height="1" fill="var(--text)"/><rect class="mascot__eye" x="3" y="15" width="1" height="1" fill="var(--bg)"/>' +
    '<rect x="4" y="15" width="9" height="1" fill="var(--text)"/><rect class="mascot__eye" x="13" y="15" width="1" height="1" fill="var(--bg)"/>' +
    '<rect x="14" y="15" width="1" height="1" fill="var(--text)"/><rect x="1" y="16" width="14" height="1" fill="var(--text)"/>' +
    '<rect x="1" y="17" width="14" height="1" fill="var(--text)"/><rect x="2" y="18" width="13" height="1" fill="var(--text)"/>' +
    '<rect x="4" y="19" width="1" height="1" fill="var(--text)"/><rect x="12" y="19" width="1" height="1" fill="var(--text)"/>' +
    '<rect x="5" y="20" width="7" height="1" fill="var(--text)"/></svg>';

  /* Dates are authored as YYYY-MM-DD. Parsed by hand rather than with
     new Date(string), which reads them as UTC and can land on the wrong day. */
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function formatDate(d) {
    var day = d.getDate() < 10 ? "0" + d.getDate() : "" + d.getDate();
    return day + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }

  function isoDate(d) {
    var mo = d.getMonth() + 1, da = d.getDate();
    return d.getFullYear() + "-" + (mo < 10 ? "0" + mo : mo) + "-" + (da < 10 ? "0" + da : da);
  }

  /* A link is only real if someone filled it in — placeholders left in
     site-data.js should not render as broken links. */
  function hasLink(v) {
    v = String(v || "").trim();
    return v !== "" && v.charAt(0) !== "[";
  }

  /* ------------------------------------------------------- hero video */

  function setupHero() {
    var hero = document.querySelector(".hero");
    var video = document.getElementById("heroVideo");
    if (!hero) return;

    var small = root.className.indexOf("hero-small") > -1;
    var poster = small ? "assets/img/hero-poster-mobile.jpg" : "assets/img/hero-poster.jpg";

    if (video) {
      if (root.className.indexOf("hero-static") > -1) {
        /* Reduced motion / Data Saver: swap the video out entirely. */
        var img = el("img", "hero__still");
        img.src = poster;
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        video.parentNode.replaceChild(img, video);
      } else {
        video.poster = poster;
        video.src = small
          ? "assets/video/light-leaks-mobile.mp4"
          : "assets/video/light-leaks.mp4";

        /* If the file is missing the CSS gradient fallback is already
           painted underneath — just drop the empty element. */
        video.addEventListener("error", function () {
          if (video.parentNode) video.parentNode.removeChild(video);
        });

        video.load();
        var playing = video.play();
        if (playing && playing.catch) playing.catch(function () { /* autoplay blocked: poster stands in */ });
      }
    }

    /* Fire the one orchestrated entrance. */
    requestAnimationFrame(function () { hero.classList.add("is-ready"); });
  }

  /* ------------------------------------------------------------- nav */

  function setupNav() {
    var nav = document.getElementById("nav");
    var hero = document.querySelector(".hero");
    var toggle = document.getElementById("navToggle");
    var menu = document.getElementById("navMenu");

    /* Transparent over the hero, glass once the hero is fully behind us.
       Observing the hero itself means "not intersecting" is exactly
       "scrolled past hero height" — no sentinel needed. */
    if (nav && hero && "IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        nav.classList.toggle("is-stuck", !entries[0].isIntersecting);
      }, { threshold: 0 }).observe(hero);
    }

    if (!toggle || !menu) return;

    function setMenu(open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      menu.classList.toggle("is-open", open);
    }

    toggle.addEventListener("click", function () {
      setMenu(toggle.getAttribute("aria-expanded") !== "true");
    });

    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setMenu(false);
        toggle.focus();
      }
    });

    /* Leaving mobile width should not strand an open panel. */
    window.addEventListener("resize", function () {
      if (window.innerWidth >= 768) setMenu(false);
    });
  }

  /* --------------------------------------------------------- upcoming */

  function renderEvents() {
    var list = document.getElementById("eventsList");
    if (!list) return;

    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var items = (data.upcoming || [])
      .map(function (ev) {
        var d = parseDate(ev.date);
        return d ? { ev: ev, date: d } : null;
      })
      .filter(function (x) { return x && x.date >= today; })   /* past events drop off on their own */
      .sort(function (a, b) { return a.date - b.date; });

    if (!items.length) {
      var empty = el("li", "empty");
      empty.innerHTML = MASCOT_SVG + '<span>Nothing on the calendar right now — the Discord always has the latest.</span>';
      list.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      var ev = item.ev;
      var li = el("li", "event");
      li.setAttribute("data-reveal", "");

      var when = el("div", "event__when");
      var time = el("time", null, formatDate(item.date));
      time.setAttribute("datetime", isoDate(item.date));
      when.appendChild(time);
      if (ev.time) {
        when.appendChild(document.createTextNode(" "));
        when.appendChild(el("span", "event__time", ev.time));
      }
      li.appendChild(when);

      var body = el("div", "event__body");
      body.appendChild(el("p", "event__title", ev.title || ""));
      if (ev.blurb) body.appendChild(el("p", "event__blurb", ev.blurb));

      var meta = el("div", "event__meta");
      if (ev.format) {
        var isOnline = /online/i.test(ev.format);
        meta.appendChild(el("span", "tag" + (isOnline ? " tag--online" : ""), ev.format));
      }
      /* A raw placeholder in `place` is not worth showing to a visitor. */
      if (ev.place && ev.place.charAt(0) !== "[") meta.appendChild(el("span", null, ev.place));
      if (hasLink(ev.link)) {
        var a = el("a", "event__link", "Details");
        a.href = ev.link;
        meta.appendChild(a);
      }
      if (meta.childNodes.length) body.appendChild(meta);

      li.appendChild(body);
      list.appendChild(li);
    });
  }

  /* --------------------------------------------------------- projects */

  function renderProjects() {
    var list = document.getElementById("projectsList");
    if (!list) return;

    (data.projects || []).forEach(function (p) {
      var li = el("li", "project");
      li.setAttribute("data-reveal", "");

      var top = el("div", "project__top");
      var name = el("p", "project__name");
      if (hasLink(p.link)) {
        var a = el("a", null, p.name || "");
        a.href = p.link;
        a.rel = "noopener";
        name.appendChild(a);
      } else {
        name.textContent = p.name || "";
      }
      top.appendChild(name);
      if (p.tag) top.appendChild(el("span", "project__tag", p.tag));
      li.appendChild(top);

      if (p.blurb) li.appendChild(el("p", "project__blurb", p.blurb));

      if (p.status) {
        var st = el("p", "project__status");
        var cls = /progress/i.test(p.status) ? "dot dot--wip"
                : /live/i.test(p.status) ? "dot dot--live"
                : "dot";
        st.appendChild(el("span", cls));
        st.appendChild(el("span", null, p.status));
        li.appendChild(st);
      }

      list.appendChild(li);
    });
  }

  /* ------------------------------------------------------------- team */

  function initials(name) {
    return String(name || "")
      .replace(/[\[\]]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (w) { return w.charAt(0).toUpperCase(); })
      .join("") || "—";
  }

  function renderTeam() {
    var list = document.getElementById("teamList");
    if (!list) return;

    (data.team || []).forEach(function (m) {
      var li = el("li", "member");
      li.setAttribute("data-reveal", "");

      if (m.photo) {
        var img = el("img", "member__photo");
        img.src = m.photo;
        img.alt = m.name ? m.name : "";
        img.loading = "lazy";
        img.decoding = "async";
        li.appendChild(img);
      } else {
        /* No photo yet: initials read better than an empty box. */
        var ph = el("div", "member__photo member__initials", initials(m.name));
        ph.setAttribute("aria-hidden", "true");
        li.appendChild(ph);
      }

      var name = el("p", "member__name");
      if (hasLink(m.link)) {
        var a = el("a", "member__link", m.name || "");
        a.href = m.link;
        a.rel = "noopener";
        name.appendChild(a);
      } else {
        name.textContent = m.name || "";
      }
      li.appendChild(name);

      if (m.role) li.appendChild(el("p", "member__role", m.role));
      list.appendChild(li);
    });
  }

  /* -------------------------------------------------------------- faq */

  function setupFaq() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll(".faq__btn"));

    /* Run `fn` when the height transition ends, but never depend on it: if
       the browser coalesces the two style writes there is no transition and
       so no event, and the panel would be left half-managed. */
    function afterHeight(panel, fn) {
      var done = false;
      function finish(e) {
        if (done || (e && e.propertyName !== "height")) return;
        done = true;
        panel.removeEventListener("transitionend", finish);
        clearTimeout(timer);
        fn();
      }
      var timer = setTimeout(finish, 400);
      panel.addEventListener("transitionend", finish);
    }

    function close(btn, animate) {
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      if (!panel || btn.getAttribute("aria-expanded") !== "true") return;
      btn.setAttribute("aria-expanded", "false");

      if (!animate) { panel.hidden = true; panel.style.height = ""; return; }

      panel.style.height = panel.scrollHeight + "px";
      void panel.offsetHeight;              /* flush, so 0px actually animates */
      panel.style.height = "0px";
      afterHeight(panel, function () {
        panel.hidden = true;
        panel.style.height = "";
      });
    }

    function open(btn, animate) {
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      if (!panel) return;
      btn.setAttribute("aria-expanded", "true");
      panel.hidden = false;

      if (!animate) { panel.style.height = ""; return; }

      panel.style.height = "auto";
      var target = panel.scrollHeight;
      panel.style.height = "0px";
      void panel.offsetHeight;
      panel.style.height = target + "px";
      afterHeight(panel, function () {
        panel.style.height = "";   /* back to auto, so it reflows if text wraps */
      });
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var isOpen = btn.getAttribute("aria-expanded") === "true";
        /* One panel at a time. */
        buttons.forEach(function (other) { if (other !== btn) close(other, !reduced); });
        if (isOpen) close(btn, !reduced); else open(btn, !reduced);
      });
    });
  }

  /* ---------------------------------------------------------- reveals */

  function setupReveals() {
    var targets = document.querySelectorAll("[data-reveal]");

    if (reduced || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(targets, function (n) { n.classList.add("is-in"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });

    Array.prototype.forEach.call(targets, function (n) { io.observe(n); });
  }

  /* -------------------------------------------------------------- go */

  function boot(loadedData) {
    data = loadedData;

    var year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();

    setupHero();
    setupNav();
    renderEvents();
    renderProjects();
    renderTeam();
    setupFaq();
    setupReveals();   /* last — it must see the nodes the renderers just made */
  }

  /* Live site: fetch the database-backed feed. If it's unreachable — the
     admin backend isn't running (e.g. a plain `python -m http.server`
     preview), or the deploy has no API — fall back to the bundled
     site-data.js so the page still renders exactly as it always has. */
  fetch("/api/data")
    .then(function (r) { if (!r.ok) throw new Error("bad status " + r.status); return r.json(); })
    .then(boot)
    .catch(function () {
      boot(typeof KODITH_DATA !== "undefined" ? KODITH_DATA : { upcoming: [], projects: [], team: [] });
    });
})();
