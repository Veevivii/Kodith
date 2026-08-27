/* ==========================================================================
   KODITH ADMIN — login, session check, and CRUD for events/projects/team.

   All three panels share the same shape (list + add-or-edit form), so one
   generic renderer drives all three from a small per-resource field config
   below, rather than writing the same list/form logic three times.
   ========================================================================== */
(function () {
  "use strict";

  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  function toast(message, isError) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastEl.classList.toggle("is-error", !!isError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3200);
  }

  // Set once auth flow is wired up below — lets api() bounce back to the
  // login form on a 401 without this function needing to know about it.
  var onSessionExpired = function () {};

  function api(path, options) {
    options = options || {};
    options.headers = options.headers || {};
    if (options.jsonBody !== undefined) {
      options.headers["content-type"] = "application/json";
      options.body = JSON.stringify(options.jsonBody);
      delete options.jsonBody;
    }
    return fetch(path, options).then(function (r) {
      if (r.status === 401 && path !== "/api/auth/session") onSessionExpired();
      if (r.status === 204) return null;
      return r.json().then(function (body) {
        if (!r.ok) throw new Error(body.error || ("Request failed (" + r.status + ")"));
        return body;
      });
    });
  }

  /* ---------------------------------------------------------- resources */

  var RESOURCES = {
    events: {
      endpoint: "/api/admin/events",
      title: function (row) { return row.title || "(untitled)"; },
      meta: function (row) { return (row.date || "") + (row.time ? " · " + row.time : "") + (row.format ? " · " + row.format : ""); },
      fields: [
        { name: "date", label: "Date (YYYY-MM-DD)", type: "date", required: true },
        { name: "time", label: "Time", type: "text" },
        { name: "title", label: "Title", type: "text", required: true },
        { name: "format", label: "Format", type: "select", options: ["Online", "In person", "Hybrid"] },
        { name: "place", label: "Place", type: "text" },
        { name: "link", label: "Link", type: "text" },
        { name: "blurb", label: "Blurb", type: "textarea", wide: true },
      ],
    },
    projects: {
      endpoint: "/api/admin/projects",
      title: function (row) { return row.name || "(untitled)"; },
      meta: function (row) { return (row.tag || "") + (row.status ? " · " + row.status : ""); },
      fields: [
        { name: "name", label: "Name", type: "text", required: true },
        { name: "tag", label: "Tag", type: "text" },
        { name: "status", label: "Status", type: "select", options: ["Live", "In progress", "Archived"] },
        { name: "link", label: "Link", type: "text" },
        { name: "blurb", label: "Blurb", type: "textarea", wide: true },
      ],
    },
    team: {
      endpoint: "/api/admin/team",
      title: function (row) { return row.name || "(untitled)"; },
      meta: function (row) { return row.role || ""; },
      fields: [
        { name: "name", label: "Name", type: "text", required: true },
        { name: "role", label: "Role", type: "text" },
        { name: "link", label: "Link", type: "text" },
        { name: "photo", label: "Photo", type: "photo", wide: true },
      ],
    },
  };

  var state = { events: [], projects: [], team: [] };

  /* -------------------------------------------------------------- utils */

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function closeForm(key) {
    var formEl = document.getElementById("form-" + key);
    formEl.hidden = true;
    formEl.innerHTML = "";
  }

  /* ---------------------------------------------------------------- list */

  function renderList(key) {
    var resource = RESOURCES[key];
    var listEl = document.getElementById("list-" + key);
    listEl.innerHTML = "";

    var rows = state[key];
    if (!rows.length) {
      var empty = el("li", "admin-empty");
      empty.textContent = "Nothing here yet — add the first one above.";
      listEl.appendChild(empty);
      return;
    }

    rows.forEach(function (row) {
      var li = el("li", "admin-row");

      var body = el("div", "admin-row__body");
      var title = el("p", "admin-row__title");
      title.textContent = resource.title(row);
      var meta = el("p", "admin-row__meta");
      meta.textContent = resource.meta(row);
      body.appendChild(title);
      body.appendChild(meta);

      var actions = el("div", "admin-row__actions");
      var editBtn = el("button");
      editBtn.type = "button";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () { renderForm(key, row); });

      var delBtn = el("button", "is-danger");
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", function () { handleDelete(key, row); });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      li.appendChild(body);
      li.appendChild(actions);
      listEl.appendChild(li);
    });
  }

  function handleDelete(key, row) {
    var resource = RESOURCES[key];
    if (!window.confirm("Delete \"" + resource.title(row) + "\"? This can't be undone.")) return;

    api(resource.endpoint + "?id=" + row.id, { method: "DELETE" })
      .then(function () {
        state[key] = state[key].filter(function (r) { return r.id !== row.id; });
        renderList(key);
        toast("Deleted.");
      })
      .catch(function (err) { toast(err.message, true); });
  }

  /* ---------------------------------------------------------------- form */

  function renderForm(key, existingRow) {
    var resource = RESOURCES[key];
    var formEl = document.getElementById("form-" + key);
    formEl.innerHTML = "";
    formEl.hidden = false;

    var inputs = {};
    var uploadedPhotoUrl = existingRow ? existingRow.photo || "" : "";

    resource.fields.forEach(function (field) {
      var wrap = el("label", "admin-field" + (field.wide ? " admin-field--wide" : ""));
      var span = el("span");
      span.textContent = field.label;
      wrap.appendChild(span);

      if (field.type === "select") {
        var select = document.createElement("select");
        field.options.forEach(function (opt) {
          var o = document.createElement("option");
          o.value = opt; o.textContent = opt;
          select.appendChild(o);
        });
        if (existingRow && existingRow[field.name]) select.value = existingRow[field.name];
        inputs[field.name] = select;
        wrap.appendChild(select);
        formEl.appendChild(wrap);
      } else if (field.type === "textarea") {
        var textarea = document.createElement("textarea");
        textarea.value = existingRow ? (existingRow[field.name] || "") : "";
        inputs[field.name] = textarea;
        wrap.appendChild(textarea);
        formEl.appendChild(wrap);
      } else if (field.type === "photo") {
        var photoWrap = el("div", "admin-form__photo");
        var preview = document.createElement("img");
        preview.alt = "";
        preview.src = uploadedPhotoUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
        preview.style.visibility = uploadedPhotoUrl ? "visible" : "hidden";
        var fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.addEventListener("change", function () {
          var file = fileInput.files[0];
          if (!file) return;
          toast("Uploading photo…");
          file.arrayBuffer().then(function (buf) {
            return fetch("/api/admin/upload", {
              method: "POST",
              headers: { "content-type": file.type || "application/octet-stream", "x-filename": file.name },
              body: buf,
            });
          }).then(function (r) { return r.json(); }).then(function (body) {
            if (body.error) throw new Error(body.error);
            uploadedPhotoUrl = body.url;
            preview.src = body.url;
            preview.style.visibility = "visible";
            toast("Photo uploaded.");
          }).catch(function (err) { toast(err.message, true); });
        });
        photoWrap.appendChild(preview);
        photoWrap.appendChild(fileInput);
        wrap.appendChild(photoWrap);
        formEl.appendChild(wrap);
      } else {
        var input = document.createElement("input");
        input.type = field.type;
        input.value = existingRow ? (existingRow[field.name] || "") : "";
        if (field.required) input.required = true;
        inputs[field.name] = input;
        wrap.appendChild(input);
        formEl.appendChild(wrap);
      }
    });

    var errorEl = el("p", "admin-form__error");
    errorEl.hidden = true;
    formEl.appendChild(errorEl);

    var actions = el("div", "admin-form__actions");
    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = existingRow ? "Save changes" : "Add";
    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", function () { closeForm(key); });
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    formEl.appendChild(actions);

    saveBtn.addEventListener("click", function () {
      var payload = {};
      resource.fields.forEach(function (field) {
        payload[field.name] = field.type === "photo" ? uploadedPhotoUrl : inputs[field.name].value.trim();
      });

      var missing = resource.fields.filter(function (f) { return f.required && !payload[f.name]; });
      if (missing.length) {
        errorEl.textContent = missing.map(function (f) { return f.label; }).join(", ") + " required.";
        errorEl.hidden = false;
        return;
      }

      var method = existingRow ? "PATCH" : "POST";
      var url = resource.endpoint + (existingRow ? "?id=" + existingRow.id : "");

      api(url, { method: method, jsonBody: payload })
        .then(function (row) {
          if (existingRow) {
            state[key] = state[key].map(function (r) { return r.id === existingRow.id ? row : r; });
          } else {
            state[key] = state[key].concat([row]);
          }
          closeForm(key);
          renderList(key);
          toast(existingRow ? "Saved." : "Added.");
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
        });
    });
  }

  /* ------------------------------------------------------------- loading */

  function loadAll() {
    return Promise.all(Object.keys(RESOURCES).map(function (key) {
      return api(RESOURCES[key].endpoint).then(function (rows) {
        state[key] = rows;
        renderList(key);
      });
    }));
  }

  Object.keys(RESOURCES).forEach(function (key) {
    document.querySelector('[data-add="' + key + '"]').addEventListener("click", function () {
      renderForm(key, null);
    });
  });

  /* ---------------------------------------------------------- auth flow */

  var loginScreen = document.getElementById("loginScreen");
  var dashboard = document.getElementById("dashboard");
  var loginForm = document.getElementById("loginForm");
  var loginError = document.getElementById("loginError");

  function showDashboard(who) {
    loginScreen.hidden = true;
    dashboard.hidden = false;
    document.getElementById("whoami").textContent = who.name ? who.name + " (" + who.email + ")" : who.email;
    loadAll();
    // The login card can leave the page scrolled partway down; without this
    // the dashboard renders starting from wherever that scroll position
    // happened to land, which reads as "nothing happened" until you scroll.
    window.scrollTo(0, 0);
  }

  function showLogin() {
    dashboard.hidden = true;
    loginScreen.hidden = false;
  }

  // A 401 from any admin call means the session expired mid-use — bounce
  // back to the login form rather than leaving a half-broken dashboard up.
  onSessionExpired = function () { showLogin(); };

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    loginError.hidden = true;
    var formData = new FormData(loginForm);
    api("/api/auth/login", {
      method: "POST",
      jsonBody: { email: formData.get("email"), password: formData.get("password") },
    })
      .then(function (body) { showDashboard(body); })
      .catch(function (err) {
        loginError.textContent = err.message;
        loginError.hidden = false;
      });
  });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    api("/api/auth/logout", { method: "POST" }).then(showLogin).catch(function () { showLogin(); });
  });

  api("/api/auth/session").then(function (body) {
    if (body.authenticated) showDashboard(body); else showLogin();
  }).catch(showLogin);
})();
