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

  /* ------------------------------------------------------------- cropper */

  var CROP_STAGE = 320;      // on-screen preview size, CSS px — display only
  var CROP_OUTPUT_CAP = 2000; // upper bound on exported resolution, px

  /**
   * Opens a drag-to-pan, slider-to-zoom square cropper over `file`.
   * Resolves with:
   *   - `file` unchanged, if the image is already square (no cropping needed
   *     — the original bytes are never touched, so this path is lossless)
   *   - a cropped Blob, if the user confirmed a crop. Exported at the crop's
   *     actual native pixel size (not shrunk to some fixed small thumbnail
   *     size) — CROP_OUTPUT_CAP only guards against pathological source
   *     sizes, it's not a "make everything this size" target. PNG sources
   *     stay PNG (lossless); everything else exports as high-quality JPEG,
   *     since a JPEG source's compression artifacts are already baked into
   *     its pixels and re-wrapping it in PNG wouldn't recover anything.
   *   - `null`, if the user cancelled
   */
  function openCropper(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();

      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(file); // can't preview it — let the server have the original rather than block the upload
      };

      img.onload = function () {
        URL.revokeObjectURL(url);
        var iw = img.naturalWidth, ih = img.naturalHeight;

        if (Math.abs(iw - ih) <= 2) { resolve(file); return; } // already square — nothing to crop

        var overlay = el("div", "crop-modal");
        var box = el("div", "crop-modal__box");
        box.appendChild(el("p", "crop-modal__title", "Crop photo"));

        var stage = el("div", "crop-modal__stage");
        var canvas = document.createElement("canvas");
        canvas.width = CROP_STAGE;
        canvas.height = CROP_STAGE;
        canvas.className = "crop-modal__canvas";
        stage.appendChild(canvas);
        box.appendChild(stage);

        var zoomRow = el("label", "crop-modal__zoom");
        zoomRow.appendChild(el("span", null, "Zoom"));
        var zoomInput = document.createElement("input");
        zoomInput.type = "range";
        zoomInput.min = "1";
        zoomInput.max = "3";
        zoomInput.step = "0.01";
        zoomInput.value = "1";
        zoomRow.appendChild(zoomInput);
        box.appendChild(zoomRow);

        var actions = el("div", "crop-modal__actions");
        var useBtn = document.createElement("button");
        useBtn.type = "button";
        useBtn.className = "btn btn--primary";
        useBtn.textContent = "Use this crop";
        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn btn--ghost";
        cancelBtn.textContent = "Cancel";
        actions.appendChild(useBtn);
        actions.appendChild(cancelBtn);
        box.appendChild(actions);

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        /* Crop state lives in SOURCE image pixel space: (panX, panY) is the
           top-left corner of the current square crop, srcSize its side —
           srcSize shrinks as zoom increases (zooming in = sampling a
           smaller region of the source, stretched to fill the stage). */
        var minDim = Math.min(iw, ih);
        var zoom = 1;
        var srcSize = minDim;
        var panX = (iw - srcSize) / 2;
        var panY = (ih - srcSize) / 2;

        function clampPan() {
          panX = Math.max(0, Math.min(panX, iw - srcSize));
          panY = Math.max(0, Math.min(panY, ih - srcSize));
        }

        function draw() {
          var ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, CROP_STAGE, CROP_STAGE);
          ctx.drawImage(img, panX, panY, srcSize, srcSize, 0, 0, CROP_STAGE, CROP_STAGE);
        }
        draw();

        zoomInput.addEventListener("input", function () {
          // re-centre on whatever point was in the middle of the old crop,
          // so zooming doesn't yank the view back to the image's centre
          var cx = panX + srcSize / 2, cy = panY + srcSize / 2;
          zoom = parseFloat(zoomInput.value);
          srcSize = minDim / zoom;
          panX = cx - srcSize / 2;
          panY = cy - srcSize / 2;
          clampPan();
          draw();
        });

        var dragging = false, lastX = 0, lastY = 0;
        canvas.addEventListener("pointerdown", function (e) {
          dragging = true;
          lastX = e.clientX;
          lastY = e.clientY;
          canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener("pointermove", function (e) {
          if (!dragging) return;
          var dx = e.clientX - lastX, dy = e.clientY - lastY;
          lastX = e.clientX;
          lastY = e.clientY;
          var factor = srcSize / CROP_STAGE; // stage px -> source px
          panX -= dx * factor;
          panY -= dy * factor;
          clampPan();
          draw();
        });
        canvas.addEventListener("pointerup", function () { dragging = false; });
        canvas.addEventListener("pointercancel", function () { dragging = false; });

        function close(result) {
          document.body.removeChild(overlay);
          resolve(result);
        }

        cancelBtn.addEventListener("click", function () { close(null); });

        useBtn.addEventListener("click", function () {
          // Export at the crop's own native pixel size — no forced shrink
          // to a fixed thumbnail size. The cap only stops a pathologically
          // huge source (e.g. a 6000px photo with no zoom applied) from
          // producing an equally huge file; it never shrinks below what
          // the crop actually is.
          var outSize = Math.round(Math.min(srcSize, CROP_OUTPUT_CAP));
          var out = document.createElement("canvas");
          out.width = outSize;
          out.height = outSize;
          out.getContext("2d").drawImage(img, panX, panY, srcSize, srcSize, 0, 0, outSize, outSize);

          // PNG sources stay lossless; anything else (JPEG, WebP, HEIC-as-
          // JPEG from iOS, etc.) exports as high-quality JPEG — those
          // formats are already lossy, so there's nothing to preserve by
          // switching to PNG, only file size to lose.
          var isPng = file.type === "image/png";
          out.toBlob(function (blob) { close(blob); }, isPng ? "image/png" : "image/jpeg", 0.95);
        });
      };

      img.src = url;
    });
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
      reorderable: true, // team display order matters on the public site; events sort by date and projects have no visible order, so only this one gets Up/Down controls
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

    rows.forEach(function (row, index) {
      var li = el("li", "admin-row");

      var body = el("div", "admin-row__body");
      var title = el("p", "admin-row__title");
      title.textContent = resource.title(row);
      var meta = el("p", "admin-row__meta");
      meta.textContent = resource.meta(row);
      body.appendChild(title);
      body.appendChild(meta);

      var actions = el("div", "admin-row__actions");

      if (resource.reorderable) {
        var upBtn = el("button");
        upBtn.type = "button";
        upBtn.textContent = "↑";
        upBtn.setAttribute("aria-label", "Move up");
        upBtn.disabled = index === 0;
        upBtn.addEventListener("click", function () { handleReorder(key, index, -1); });

        var downBtn = el("button");
        downBtn.type = "button";
        downBtn.textContent = "↓";
        downBtn.setAttribute("aria-label", "Move down");
        downBtn.disabled = index === rows.length - 1;
        downBtn.addEventListener("click", function () { handleReorder(key, index, 1); });

        actions.appendChild(upBtn);
        actions.appendChild(downBtn);
      }

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

  /* Swaps `index` with its neighbour (direction -1 = up, +1 = down), then
     persists both rows' new sort_order. The PATCH endpoint requires the
     full field set, not a partial patch (see api/admin/*.js), so each
     request resends that row's existing name/role/etc. unchanged alongside
     the new sort_order — state[key] already holds complete rows, so this
     needs no extra fetch. */
  function handleReorder(key, index, direction) {
    var resource = RESOURCES[key];
    var rows = state[key];
    var target = index + direction;
    if (target < 0 || target >= rows.length) return;

    // Optimistic: swap array positions so the UI updates immediately.
    var moved = rows[index];
    rows[index] = rows[target];
    rows[target] = moved;
    renderList(key);

    // Renumber against the array's new positions rather than swapping the
    // two rows' existing sort_order values. Swapping assumes those values
    // are already distinct — if several rows share one (as happened when
    // an older bug reset edited rows to 0), swapping two equal values is a
    // no-op and the order silently snaps back on reload. Renumbering is
    // self-healing: it always writes a clean 0..n-1 sequence.
    var changed = rows.filter(function (row, i) { return row.sort_order !== i; });
    if (!changed.length) return;

    Promise.all(changed.map(function (row) {
      var newOrder = rows.indexOf(row);
      var payload = {};
      resource.fields.forEach(function (f) { payload[f.name] = row[f.name]; });
      payload.sort_order = newOrder;
      return api(resource.endpoint + "?id=" + row.id, { method: "PATCH", jsonBody: payload })
        .then(function (updated) { row.sort_order = updated.sort_order; });
    })).catch(function (err) {
      toast(err.message, true);
      loadAll(); // drifted from the server — resync rather than leave it wrong
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

          openCropper(file).then(function (result) {
            fileInput.value = ""; // let the same file be re-picked later if cancelled
            if (!result) return null; // cancelled — leave any existing photo untouched

            var isBlob = result !== file;
            // The cropper picks PNG or JPEG per source format (see
            // openCropper) — read it back from the resulting Blob rather
            // than assuming, so this stays correct either way.
            var mimeType = isBlob ? result.type : (file.type || "application/octet-stream");
            var ext = mimeType === "image/png" ? ".png" : ".jpg";
            var filename = isBlob ? file.name.replace(/\.\w+$/, "") + ext : file.name;

            toast("Uploading photo…");
            return result.arrayBuffer().then(function (buf) {
              return fetch("/api/admin/upload", {
                method: "POST",
                // The actual request Content-Type must stay octet-stream —
                // Vercel's Node runtime only auto-parses request.body into a
                // Buffer for a fixed short list of content types (json,
                // urlencoded, text/plain, octet-stream); a real image MIME
                // type like "image/png" isn't one of them, so the server
                // would never see a parsed body at all. The real type still
                // needs to reach the server (so the stored blob reports the
                // right content type), so it rides along in a custom header.
                headers: { "content-type": "application/octet-stream", "x-filename": filename, "x-content-type": mimeType },
                body: buf,
              });
            }).then(function (r) { return r.json(); });
          }).then(function (body) {
            if (!body) return; // cancelled — nothing more to do
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
