/* ==========================================================================
   KODITH — college picker

   An ARIA 1.2 combobox over GET /api/cce?q= (the AISHE college list, see
   api/_lib/colleges.js). Used by the CCE form (/cce) and by the admin's
   "Link to college" (/admin/cce):

     KodithCollegeSearch.attach(input, {
       listbox,          // an empty <ul> placed right after the input
       allowUnlisted,    // add "My college isn't listed" as the last option
       onPick(college),  // {id, name, district, state, kind}
       onUnlisted(text), // they chose to keep what they typed
       onEdit(),         // the text changed (any earlier pick no longer holds)
     })

   Everything shown comes from the list or from what the person typed, so it
   is all set with textContent. If the search can't be reached, the
   "not listed" option still appears, so nobody is blocked from applying.
   ========================================================================== */
(function () {
  "use strict";

  var ENDPOINT = "/api/cce?q=";
  var DEBOUNCE_MS = 160;
  var uid = 0;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function attach(input, opts) {
    opts = opts || {};
    var list = opts.listbox;
    var base = "cs" + (++uid);
    list.id = list.id || base + "-list";
    list.className = (list.className ? list.className + " " : "") + "cs-list";
    list.setAttribute("role", "listbox");
    list.hidden = true;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", list.id);
    input.setAttribute("autocomplete", "off");

    var items = [], active = -1, timer = 0, ctrl = null;

    function close() {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      active = -1;
    }
    function setActive(i) {
      active = i;
      [].forEach.call(list.children, function (li, k) { li.setAttribute("aria-selected", k === i ? "true" : "false"); });
      if (i >= 0 && list.children[i]) {
        input.setAttribute("aria-activedescendant", list.children[i].id);
        list.children[i].scrollIntoView({ block: "nearest" });
      } else input.removeAttribute("aria-activedescendant");
    }
    function choose(i) {
      var it = items[i];
      if (!it) return;
      close();
      if (it.type === "college") { input.value = it.row.name; if (opts.onPick) opts.onPick(it.row); }
      else if (opts.onUnlisted) opts.onUnlisted(it.text);
    }
    function render(rows, failed) {
      list.innerHTML = "";
      items = rows.map(function (r) { return { type: "college", row: r }; });
      var typed = input.value.trim();
      if (opts.allowUnlisted && typed.length >= 2) items.push({ type: "unlisted", text: typed });
      if (!items.length) {
        if (failed || typed.length >= 2) {           // say why the list is empty rather than showing nothing
          list.appendChild(el("li", "cs-note", failed ? "College search isn't available right now." : "No college in the list matches that."));
          list.hidden = false; input.setAttribute("aria-expanded", "true");
        } else close();
        return;
      }
      items.forEach(function (it, i) {
        var li = el("li", "cs-opt" + (it.type === "unlisted" ? " cs-opt--unlisted" : ""));
        li.id = base + "-o" + i;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        if (it.type === "college") {
          var r = it.row;
          li.appendChild(el("span", "cs-name", r.name));
          li.appendChild(el("span", "cs-meta", [r.district, r.state].filter(Boolean).join(", ") + " · " + (r.kind === "university" ? "University" : "College")));
        } else {
          li.appendChild(el("span", "cs-name", "My college isn't listed"));
          li.appendChild(el("span", "cs-meta", (rows.length ? "" : failed ? "Search is unavailable. " : "No match in the list. ") + "Use “" + it.text + "” as typed"));
        }
        // pointerdown, not click: keeps focus in the input, so the list isn't closed by blur first
        li.addEventListener("pointerdown", function (e) { e.preventDefault(); choose(i); });
        list.appendChild(li);
      });
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      setActive(-1);
    }
    function search() {
      var q = input.value.trim();
      if (ctrl) ctrl.abort();
      if (q.length < 2) { close(); return; }
      ctrl = typeof AbortController === "function" ? new AbortController() : null;
      fetch(ENDPOINT + encodeURIComponent(q.slice(0, 80)), ctrl ? { signal: ctrl.signal } : {})
        .then(function (r) { if (!r.ok) throw new Error("search " + r.status); return r.json(); })
        .then(function (rows) { if (input.value.trim() === q) render(rows, false); })
        .catch(function (err) { if (err && err.name === "AbortError") return; if (input.value.trim() === q) render([], true); });
    }

    input.addEventListener("input", function () {
      if (opts.onEdit) opts.onEdit();
      clearTimeout(timer);
      timer = setTimeout(search, DEBOUNCE_MS);
    });
    input.addEventListener("keydown", function (e) {
      var open = !list.hidden && items.length > 0;
      if (e.key === "ArrowDown") { e.preventDefault(); if (!open) search(); else setActive(Math.min(items.length - 1, active + 1)); }
      else if (e.key === "ArrowUp") { if (open) { e.preventDefault(); setActive(Math.max(0, active - 1)); } }
      else if (e.key === "Enter") {
        if (open) { e.preventDefault(); if (active >= 0) choose(active); }   // with the list open, Enter picks rather than submits
      }
      else if (e.key === "Escape") { if (!list.hidden) { e.preventDefault(); close(); } }
    });
    input.addEventListener("blur", function () { setTimeout(close, 100); });

    return { close: close, search: search };
  }

  window.KodithCollegeSearch = { attach: attach };
})();
