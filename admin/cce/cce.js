/* ==========================================================================
   KODITH ADMIN — Chief Campus Executive applications.

   Read-and-triage only: applications arrive from the public form at /cce.
   Everything an applicant typed is rendered with textContent, never as HTML,
   and links are only built from values that pass a strict check, because
   this content comes from strangers.

   toast / api / login come from admin-shared.js, like the other admin pages.
   ========================================================================== */
(function () {
  "use strict";

  var toast = window.KodithAdmin.toast;
  var api = window.KodithAdmin.api;
  var ENDPOINT = "/api/admin/cce";
  var STATUSES = ["new", "shortlisted", "contacted", "accepted", "rejected"];
  var LABEL = { all: "All", new: "New", shortlisted: "Shortlisted", contacted: "Contacted", accepted: "Accepted", rejected: "Rejected" };
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var apps = [];
  var filter = "all";
  var collegeFilter = "all";
  var host = document.getElementById("apps");
  var filtersEl = document.getElementById("filters");
  var collegeSel = document.getElementById("collegeFilter");
  var alertEl = document.getElementById("alertStatus");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function link(href, text, external) {
    var a = el("a", null, text);
    a.href = href;
    if (external) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    return a;
  }

  /* ---------------------------------------------------------- filters */
  function renderFilters() {
    filtersEl.innerHTML = "";
    ["all"].concat(STATUSES).forEach(function (key) {
      var n = key === "all" ? apps.length : apps.filter(function (a) { return a.status === key; }).length;
      var b = el("button", "cce-filter" + (filter === key ? " is-current" : ""), LABEL[key] + " · " + n);
      b.type = "button";
      b.setAttribute("aria-pressed", filter === key ? "true" : "false");
      b.addEventListener("click", function () { filter = key; render(); });
      filtersEl.appendChild(b);
    });
  }

  /* ---------------------------------------------------------- colleges */
  /* Applications group by the AISHE college they're linked to (picked on the
     form, or linked here), and typed-in ones by their text, ignoring case and
     spacing, so "SKITM" and "skitm " count together until someone links them. */
  function tidy(s) { return String(s || "").trim().replace(/\s+/g, " "); }
  function collegeKey(a) {
    return a.college_id ? "c" + a.college_id : "t:" + tidy(a.college).toLowerCase();
  }
  /* district (and state) to show after the name, unless the name already says
     it: "Indian Institute of Technology, Indore", not "…, Indore, Indore" */
  function placeOf(a, withState) {
    var name = String(a.college_name || "").toLowerCase(), parts = [];
    if (a.college_district && name.indexOf(a.college_district.toLowerCase()) === -1) parts.push(a.college_district);
    if (withState && a.college_state) parts.push(a.college_state);
    return parts;
  }
  function collegeLabel(a) {
    return a.college_id ? [a.college_name].concat(placeOf(a, false)).join(", ") : (tidy(a.college) || "(no college)");
  }
  function renderCollegeFilter() {
    var groups = {}, order = [];
    apps.forEach(function (a) {
      var k = collegeKey(a);
      if (!groups[k]) { groups[k] = { key: k, label: collegeLabel(a), linked: !!a.college_id, n: 0 }; order.push(groups[k]); }
      groups[k].n++;
    });
    order.sort(function (x, y) { return (y.linked - x.linked) || (y.n - x.n) || x.label.localeCompare(y.label); });
    if (collegeFilter !== "all" && !groups[collegeFilter]) collegeFilter = "all";
    collegeSel.innerHTML = "";
    var all = el("option", null, "All colleges · " + order.length);
    all.value = "all"; collegeSel.appendChild(all);
    order.forEach(function (g) {
      var o = el("option", null, g.label + " · " + g.n + (g.linked ? "" : " · not in list"));
      o.value = g.key; collegeSel.appendChild(o);
    });
    collegeSel.value = collegeFilter;
  }
  collegeSel.addEventListener("change", function () { collegeFilter = collegeSel.value; render(); });

  /* Search the same AISHE list as the form, and link this application to the
     college picked. Typed or older entries then count under that college. */
  function openLinkBox(a, card, anchor) {
    if (card.querySelector(".cce-link")) { card.querySelector(".cce-link input").focus(); return; }
    var box = el("div", "cce-link");
    var lid = "link-" + a.id;
    var lab = el("label", "cce-app__label", a.college_id ? "Change the college" : "Link to the official college");
    lab.htmlFor = lid;
    var wrap = el("div", "cs-wrap");
    var input = el("input", "cce-link__input"); input.id = lid; input.type = "text"; input.maxLength = 80;
    input.placeholder = "Search the AISHE list";
    input.value = a.college_id ? "" : String(a.college || "");
    var ul = el("ul");
    wrap.appendChild(input); wrap.appendChild(ul);
    var cancel = el("button", "cce-link__cancel", "Cancel"); cancel.type = "button";
    cancel.addEventListener("click", function () { box.remove(); });
    box.appendChild(lab); box.appendChild(wrap); box.appendChild(cancel);
    anchor.after(box);
    var picker = window.KodithCollegeSearch.attach(input, {
      listbox: ul,
      onPick: function (c) {
        api(ENDPOINT + "?id=" + a.id, { method: "PATCH", jsonBody: { college_id: c.id } })
          .then(function (row) {
            a.college_id = row.college_id; a.college_name = row.college_name; a.college_district = row.college_district; a.college_state = row.college_state;
            render(); toast("Linked to " + row.college_name + ".");
          })
          .catch(function (err) { toast(err.message, true); });
      },
    });
    input.focus();
    if (input.value.trim().length >= 2) picker.search();
  }
  function collegeLine(a, card) {
    var line = el("p", "cce-app__sub cce-app__college");
    if (a.college_id) {
      var go = el("button", "cce-app__collegeBtn", [a.college_name].concat(placeOf(a, true)).join(", "));
      go.type = "button"; go.title = "Show only applications from this college";
      go.addEventListener("click", function () { collegeFilter = collegeKey(a); render(); });
      line.appendChild(go);
      var typed = tidy(a.college);
      if (typed && typed.toLowerCase() !== String(a.college_name || "").toLowerCase()) line.appendChild(el("span", "cce-app__wrote", "(they wrote: " + typed + ")"));
    } else {
      line.appendChild(el("span", null, tidy(a.college) || "(no college)"));
      line.appendChild(el("span", "cce-app__notlisted", "Not in list"));
    }
    var act = el("button", "cce-app__linkBtn", a.college_id ? "Change" : "Link to college"); act.type = "button";
    act.addEventListener("click", function () { openLinkBox(a, card, line); });
    line.appendChild(act);
    return line;
  }

  /* ---------------------------------------------------------- list */
  function renderApp(a) {
    var card = el("article", "cce-app");

    var head = el("div", "cce-app__head");
    var who = el("div", "cce-app__who");
    who.appendChild(el("h3", "cce-app__name", a.name));
    if (a.course_year) who.appendChild(el("p", "cce-app__sub", a.course_year));
    head.appendChild(who);

    var right = el("div", "cce-app__right");
    if (a.notify_error) {
      var tag = el("span", "cce-app__noalert", "No email alert");
      tag.title = a.notify_error;
      right.appendChild(tag);
    }
    right.appendChild(el("span", "cce-app__date", a.submitted + " IST"));
    var select = el("select", "cce-status cce-status--" + a.status);
    select.setAttribute("aria-label", "Status for " + a.name);
    STATUSES.forEach(function (s) {
      var o = el("option", null, LABEL[s]); o.value = s; if (s === a.status) o.selected = true; select.appendChild(o);
    });
    select.addEventListener("change", function () {
      var next = select.value, prev = a.status;
      api(ENDPOINT + "?id=" + a.id, { method: "PATCH", jsonBody: { status: next } })
        .then(function () { a.status = next; render(); toast("Marked as " + LABEL[next].toLowerCase() + "."); })
        .catch(function (err) { select.value = prev; toast(err.message, true); });
    });
    right.appendChild(select);
    head.appendChild(right);
    card.appendChild(head);
    card.appendChild(collegeLine(a, card));

    var contact = el("p", "cce-app__contact");
    if (EMAIL_RE.test(a.email)) contact.appendChild(link("mailto:" + a.email, a.email));
    else contact.appendChild(el("span", null, a.email));
    if (a.phone) { contact.appendChild(el("span", "cce-dot", "·")); contact.appendChild(link("tel:" + a.phone.replace(/[^0-9+]/g, ""), a.phone)); }
    if (a.city) { contact.appendChild(el("span", "cce-dot", "·")); contact.appendChild(el("span", null, a.city)); }
    if (/^https?:\/\//i.test(a.linkedin)) { contact.appendChild(el("span", "cce-dot", "·")); contact.appendChild(link(a.linkedin, "LinkedIn", true)); }
    card.appendChild(contact);

    [["About", a.about], ["Why Kodith at their college", a.motivation]].forEach(function (pair) {
      var block = el("div", "cce-app__block");
      block.appendChild(el("p", "cce-app__label", pair[0]));
      block.appendChild(el("p", "cce-app__text", pair[1]));
      card.appendChild(block);
    });

    var notesWrap = el("div", "cce-app__notes");
    var notesLabel = el("label", "cce-app__label", "Notes (only admins see these)");
    var notes = el("textarea", "cce-app__notesInput");
    notes.rows = 2; notes.maxLength = 4000; notes.value = a.notes || "";
    var nid = "notes-" + a.id; notes.id = nid; notesLabel.htmlFor = nid;
    notesWrap.appendChild(notesLabel); notesWrap.appendChild(notes);
    card.appendChild(notesWrap);

    var actions = el("div", "admin-row__actions cce-app__actions");
    var save = el("button", null, "Save notes"); save.type = "button";
    save.addEventListener("click", function () {
      save.disabled = true;
      api(ENDPOINT + "?id=" + a.id, { method: "PATCH", jsonBody: { notes: notes.value } })
        .then(function () { a.notes = notes.value; toast("Notes saved."); })
        .catch(function (err) { toast(err.message, true); })
        .then(function () { save.disabled = false; });
    });
    var del = el("button", "is-danger", "Delete"); del.type = "button";
    del.addEventListener("click", function () {
      if (!window.confirm("Delete the application from " + a.name + "? This can't be undone.")) return;
      api(ENDPOINT + "?id=" + a.id, { method: "DELETE" })
        .then(function () { apps = apps.filter(function (x) { return x.id !== a.id; }); render(); toast("Application deleted."); })
        .catch(function (err) { toast(err.message, true); });
    });
    actions.appendChild(save); actions.appendChild(del);
    card.appendChild(actions);
    return card;
  }

  /* Only the newest application decides the banner: once alerts work again,
     it goes away, while older cards keep their "No email alert" tag. */
  function renderAlertStatus() {
    var latest = apps[0];
    alertEl.hidden = !(latest && latest.notify_error);
    alertEl.textContent = alertEl.hidden ? ""
      : "No email alert went out for the newest application. " + latest.notify_error
        + " Setup steps are in the README, under \"CCE applications\".";
  }

  function render() {
    renderAlertStatus();
    renderFilters();
    renderCollegeFilter();
    host.innerHTML = "";
    var shown = apps.filter(function (a) {
      return (filter === "all" || a.status === filter) && (collegeFilter === "all" || collegeKey(a) === collegeFilter);
    });
    if (!shown.length) {
      host.appendChild(el("p", "admin-empty", !apps.length
        ? "No applications yet. They'll appear here as soon as someone sends the form at kodith.vercel.app/cce."
        : collegeFilter !== "all" ? "No " + (filter === "all" ? "" : LABEL[filter].toLowerCase() + " ") + "applications from this college."
        : "No " + LABEL[filter].toLowerCase() + " applications."));
      return;
    }
    shown.forEach(function (a) { host.appendChild(renderApp(a)); });
  }

  window.KodithAdmin.start(function () {
    api(ENDPOINT)
      .then(function (rows) { apps = rows; render(); })
      .catch(function (err) { toast(err.message, true); });
  });
})();
