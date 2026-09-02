/* ==========================================================================
   KODITH ADMIN — member cards.

   Members arrive as a CSV produced by the offline card-image script. That
   script is the single source of truth for hex_id and mint_number, so this
   page imports both exactly as given and never generates either. What is
   left of the manual form is a single-row escape hatch for patching one
   entry by hand.

   toast / api / the login flow come from admin-shared.js, the same module
   /admin uses — this page is gated by the same session, and every endpoint
   it calls is behind requireAuth() on the server.
   ========================================================================== */
(function () {
  "use strict";

  var toast = window.KodithAdmin.toast;
  var api = window.KodithAdmin.api;

  var ENDPOINT = "/api/admin/members";
  var IMPORT_ENDPOINT = "/api/admin/members-import";
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
  var resultEl = document.getElementById("importResult");

  function closeForm() {
    formEl.hidden = true;
    formEl.innerHTML = "";
  }

  /* --------------------------------------------------------------- list */

  function renderList() {
    bodyEl.innerHTML = "";

    if (!members.length) {
      var tr = el("tr");
      var td = el("td", "admin-empty", "No members yet — upload the CSV from the card script to get started.");
      td.colSpan = 6;
      tr.appendChild(td);
      bodyEl.appendChild(tr);
      return;
    }

    members.forEach(function (m) {
      var row = el("tr");
      row.appendChild(el("td", null, m.name));
      row.appendChild(el("td", "admin-table__muted", m.email));

      // The hex ID is the card's identity — link it to the public
      // verification page so it can be checked in one click.
      var idCell = el("td");
      var idLink = el("a", "admin-table__hex", m.hex_id);
      idLink.href = "/id/" + encodeURIComponent(m.hex_id);
      idLink.target = "_blank";
      idLink.rel = "noopener noreferrer";
      idCell.appendChild(idLink);
      row.appendChild(idCell);

      row.appendChild(el("td", "admin-table__mono", "#" + m.mint_number));
      row.appendChild(el("td", "admin-table__mono", m.issued_at));

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
      row.appendChild(actionCell);

      bodyEl.appendChild(row);
    });
  }

  function reload() {
    return api(ENDPOINT).then(function (rows) {
      members = rows;
      renderList();
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

  /* ------------------------------------------------------------- import */

  var dropZone = document.getElementById("dropZone");
  var csvInput = document.getElementById("csvInput");

  function showResult(kind, heading, lines) {
    resultEl.hidden = false;
    resultEl.className = "admin-import-result is-" + kind;
    resultEl.innerHTML = "";
    resultEl.appendChild(el("p", "admin-import-result__head", heading));
    if (lines && lines.length) {
      var list = el("ul", "admin-import-result__list");
      lines.forEach(function (line) { list.appendChild(el("li", null, line)); });
      resultEl.appendChild(list);
    }
  }

  function importCsv(file) {
    if (!file) return;

    // Checked by extension only as a courtesy — the server validates the
    // actual contents, and browsers report CSV MIME types inconsistently
    // (text/csv, application/vnd.ms-excel, or empty, depending on the OS).
    if (!/\.csv$/i.test(file.name)) {
      showResult("error", "That doesn't look like a CSV file.", ["Expected a .csv file; got " + file.name + "."]);
      return;
    }

    dropZone.disabled = true;
    showResult("busy", "Reading " + file.name + "…", null);

    var reader = new FileReader();
    reader.onerror = function () {
      dropZone.disabled = false;
      showResult("error", "Couldn't read that file.", null);
    };
    reader.onload = function () {
      // Posted as JSON rather than as a raw upload: Vercel only auto-parses
      // a fixed set of content types, and JSON is the one this project has
      // already proven end-to-end.
      api(IMPORT_ENDPOINT, { method: "POST", jsonBody: { csv: String(reader.result) } })
        .then(function (out) {
          var summary = out.added + " added, " + out.updated + " updated.";
          showResult("ok", summary, null);
          toast(summary);
          return reload();
        })
        .catch(function (err) {
          // The server sends a `problems` list for a rejected file; showing
          // the line numbers is the difference between a fixable error and
          // a mystery.
          var problems = (err.data && err.data.problems) || null;
          var extra = null;
          if (problems && err.data.totalProblems > problems.length) {
            extra = problems.concat(["…and " + (err.data.totalProblems - problems.length) + " more."]);
          }
          showResult("error", err.message, extra || problems);
        })
        .then(function () { dropZone.disabled = false; });
    };
    reader.readAsText(file);
  }

  dropZone.addEventListener("click", function () { csvInput.click(); });
  csvInput.addEventListener("change", function () {
    importCsv(csvInput.files && csvInput.files[0]);
    csvInput.value = ""; // so re-picking the same file fires `change` again
  });

  ["dragenter", "dragover"].forEach(function (type) {
    dropZone.addEventListener(type, function (e) {
      e.preventDefault();
      dropZone.classList.add("is-over");
    });
  });
  ["dragleave", "dragend"].forEach(function (type) {
    dropZone.addEventListener(type, function () { dropZone.classList.remove("is-over"); });
  });
  dropZone.addEventListener("drop", function (e) {
    e.preventDefault();
    dropZone.classList.remove("is-over");
    importCsv(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  // Without this, dropping a file anywhere else on the page makes the
  // browser navigate to it, losing the admin session view.
  ["dragover", "drop"].forEach(function (type) {
    window.addEventListener(type, function (e) {
      if (!dropZone.contains(e.target)) e.preventDefault();
    });
  });

  /* --------------------------------------------------------------- form */

  // hex_id and mint_number are plain text fields: this form patches a row
  // that the offline script already minted an ID for. It is deliberately not
  // a way to create new identities.
  var FIELDS = [
    { name: "name", label: "Name" },
    { name: "email", label: "Email", type: "email" },
    { name: "hex_id", label: "Card ID", hint: "8 hex characters, from the card script" },
    { name: "mint_number", label: "Mint number", hint: "whole number" },
  ];

  function renderForm(existing) {
    formEl.innerHTML = "";
    formEl.hidden = false;

    var inputs = {};
    FIELDS.forEach(function (field) {
      var wrap = el("label", "admin-field");
      wrap.appendChild(el("span", null, field.label));
      var input = document.createElement("input");
      input.type = field.type || "text";
      input.value = existing ? (existing[field.name] == null ? "" : String(existing[field.name])) : "";
      input.required = true;
      if (field.hint) input.placeholder = field.hint;
      inputs[field.name] = input;
      wrap.appendChild(input);
      formEl.appendChild(wrap);
    });

    var errorEl = el("p", "admin-form__error");
    errorEl.hidden = true;
    formEl.appendChild(errorEl);

    var actions = el("div", "admin-form__actions");
    var saveBtn = el("button", "btn btn--primary", existing ? "Save changes" : "Add entry");
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
        hex_id: inputs.hex_id.value.trim(),
        mint_number: inputs.mint_number.value.trim(),
      };

      var method = existing ? "PATCH" : "POST";
      var url = ENDPOINT + (existing ? "?id=" + existing.id : "");

      saveBtn.disabled = true;
      api(url, { method: method, jsonBody: payload })
        .then(function (row) {
          if (existing) {
            members = members.map(function (r) { return r.id === existing.id ? row : r; });
          } else {
            members = members.concat([row]);
          }
          members.sort(function (a, b) { return a.mint_number - b.mint_number; });
          closeForm();
          renderList();
          toast(existing ? "Saved." : "Entry added.");
        })
        .catch(function (err) {
          saveBtn.disabled = false;
          errorEl.textContent = err.message;
          errorEl.hidden = false;
        });
    });
  }

  document.getElementById("addBtn").addEventListener("click", function () { renderForm(null); });

  /* ----------------------------------------------------------------- go */

  window.KodithAdmin.start(function () {
    reload().catch(function (err) { toast(err.message, true); });
  });
})();
