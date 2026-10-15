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
  var STATUSES = ["new", "shortlisted", "contacted", "rejected"];
  var LABEL = { all: "All", new: "New", shortlisted: "Shortlisted", contacted: "Contacted", rejected: "Rejected" };
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var apps = [];
  var filter = "all";
  var host = document.getElementById("apps");
  var filtersEl = document.getElementById("filters");
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

  /* ---------------------------------------------------------- list */
  function renderApp(a) {
    var card = el("article", "cce-app");

    var head = el("div", "cce-app__head");
    var who = el("div", "cce-app__who");
    who.appendChild(el("h3", "cce-app__name", a.name));
    var sub = [a.college, a.course_year].filter(Boolean).join(" · ");
    who.appendChild(el("p", "cce-app__sub", sub));
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
    host.innerHTML = "";
    var shown = filter === "all" ? apps : apps.filter(function (a) { return a.status === filter; });
    if (!shown.length) {
      host.appendChild(el("p", "admin-empty", apps.length
        ? "No " + LABEL[filter].toLowerCase() + " applications."
        : "No applications yet. They'll appear here as soon as someone sends the form at kodith.vercel.app/cce."));
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
