/* ==========================================================================
   KODITH ADMIN — member cards.

   Table of card-holding members, add/edit/remove, and the CSV export that
   feeds the offline card-image generator.

   toast / api / the login flow come from admin-shared.js, the same module
   /admin uses — this page is gated by the same session, and every endpoint
   it calls is behind requireAuth() on the server.
   ========================================================================== */
(function () {
  "use strict";

  var toast = window.KodithAdmin.toast;
  var api = window.KodithAdmin.api;

  var ENDPOINT = "/api/admin/members";
  var members = [];

  /* -------------------------------------------------------------- utils */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var formEl = document.getElementById("form-members");
  var bodyEl = document.getElementById("members-body");

  function closeForm() {
    formEl.hidden = true;
    formEl.innerHTML = "";
  }

  /* --------------------------------------------------------------- list */

  function renderList() {
    bodyEl.innerHTML = "";

    if (!members.length) {
      var tr = el("tr");
      var td = el("td", "admin-empty", "No members yet — add the first one above.");
      td.colSpan = 6;
      tr.appendChild(td);
      bodyEl.appendChild(tr);
      return;
    }

    members.forEach(function (m) {
      var tr = el("tr");
      tr.appendChild(el("td", null, m.name));
      tr.appendChild(el("td", "admin-table__muted", m.email));

      // The hex ID is the card's identity — link it to the public
      // verification page so it can be checked in one click.
      var idCell = el("td");
      var idLink = el("a", "admin-table__hex", m.hex_id);
      idLink.href = "/id/" + encodeURIComponent(m.hex_id);
      idLink.target = "_blank";
      idLink.rel = "noopener noreferrer";
      idCell.appendChild(idLink);
      tr.appendChild(idCell);

      tr.appendChild(el("td", "admin-table__mono", "#" + m.mint_number));
      tr.appendChild(el("td", "admin-table__mono", m.issued_at));

      var actions = el("div", "admin-row__actions");
      var editBtn = el("button", null, "Edit");
      editBtn.type = "button";
      editBtn.addEventListener("click", function () { renderForm(m); });
      var delBtn = el("button", "is-danger", "Remove");
      delBtn.type = "button";
      delBtn.addEventListener("click", function () { handleDelete(m); });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      var actionCell = el("td");
      actionCell.appendChild(actions);
      tr.appendChild(actionCell);

      bodyEl.appendChild(tr);
    });
  }

  function handleDelete(m) {
    if (!window.confirm(
      "Remove " + (m.name || "this member") + " (#" + m.mint_number + ")?\n\n" +
      "Their card ID " + m.hex_id + " will stop verifying. This can't be undone."
    )) return;

    api(ENDPOINT + "?id=" + m.id, { method: "DELETE" })
      .then(function () {
        members = members.filter(function (r) { return r.id !== m.id; });
        renderList();
        toast("Member removed.");
      })
      .catch(function (err) { toast(err.message, true); });
  }

  /* --------------------------------------------------------------- form */

  function renderForm(existing) {
    formEl.innerHTML = "";
    formEl.hidden = false;

    var inputs = {};
    [
      { name: "name", label: "Name" },
      { name: "email", label: "Email", type: "email" },
    ].forEach(function (field) {
      var wrap = el("label", "admin-field");
      wrap.appendChild(el("span", null, field.label));
      var input = document.createElement("input");
      input.type = field.type || "text";
      input.value = existing ? (existing[field.name] || "") : "";
      input.required = true;
      inputs[field.name] = input;
      wrap.appendChild(input);
      formEl.appendChild(wrap);
    });

    // Editing must not silently reissue a card that may already be printed
    // or shared, so make it explicit that the ID and mint number are fixed.
    if (existing) {
      var fixed = el("p", "admin-form__note",
        "Card ID " + existing.hex_id + " and mint #" + existing.mint_number +
        " stay the same — the card is already issued.");
      fixed.classList.add("admin-field--wide");
      formEl.appendChild(fixed);
    }

    var errorEl = el("p", "admin-form__error");
    errorEl.hidden = true;
    formEl.appendChild(errorEl);

    var actions = el("div", "admin-form__actions");
    var saveBtn = el("button", "btn btn--primary", existing ? "Save changes" : "Add member");
    saveBtn.type = "button";
    var cancelBtn = el("button", "btn btn--ghost", "Cancel");
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", closeForm);
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    formEl.appendChild(actions);

    saveBtn.addEventListener("click", function () {
      var payload = {
        name: inputs.name.value.trim(),
        email: inputs.email.value.trim(),
      };
      if (!payload.name || !payload.email) {
        errorEl.textContent = "Name and email are both required.";
        errorEl.hidden = false;
        return;
      }

      var method = existing ? "PATCH" : "POST";
      var url = ENDPOINT + (existing ? "?id=" + existing.id : "");

      saveBtn.disabled = true;
      api(url, { method: method, jsonBody: payload })
        .then(function (row) {
          if (existing) {
            members = members.map(function (r) { return r.id === existing.id ? row : r; });
          } else {
            members = members.concat([row]);
            members.sort(function (a, b) { return a.mint_number - b.mint_number; });
          }
          closeForm();
          renderList();
          toast(existing ? "Saved." : "Member added — card ID " + row.hex_id + ", mint #" + row.mint_number + ".");
        })
        .catch(function (err) {
          saveBtn.disabled = false;
          errorEl.textContent = err.message;
          errorEl.hidden = false;
        });
    });
  }

  document.getElementById("addBtn").addEventListener("click", function () { renderForm(null); });

  /* ------------------------------------------------------------- export */

  // The export is a plain authenticated GET, so a normal link would work —
  // but a failure would then replace the page with raw JSON. Fetching it
  // lets a failure surface as a toast and keeps the admin page intact.
  document.getElementById("exportBtn").addEventListener("click", function (e) {
    e.preventDefault();
    toast("Preparing CSV…");
    fetch("/api/admin/members-export")
      .then(function (r) {
        if (r.status === 401) throw new Error("Session expired — log in again.");
        if (!r.ok) throw new Error("Export failed (" + r.status + ")");
        var disposition = r.headers.get("content-disposition") || "";
        var match = /filename="([^"]+)"/.exec(disposition);
        var filename = match ? match[1] : "kodith-members.csv";
        return r.blob().then(function (blob) { return { blob: blob, filename: filename }; });
      })
      .then(function (out) {
        var url = URL.createObjectURL(out.blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = out.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast("CSV downloaded.");
      })
      .catch(function (err) { toast(err.message, true); });
  });

  /* ----------------------------------------------------------------- go */

  window.KodithAdmin.start(function () {
    api(ENDPOINT)
      .then(function (rows) {
        members = rows;
        renderList();
      })
      .catch(function (err) { toast(err.message, true); });
  });
})();
