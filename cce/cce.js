/* /cce — Chief Campus Executive application form.
   Validates in the browser for fast feedback; the server (api/cce.js) re-checks
   everything and is the real authority. */
(function () {
  "use strict";

  var startedAt = Date.now();          // the server ignores forms filled faster than a person could
  var form = document.getElementById("cceForm");
  var errorBox = document.getElementById("formError");
  var submitBtn = document.getElementById("submitBtn");
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---- live character counters on the two long answers ---- */
  document.querySelectorAll(".cce-count").forEach(function (counter) {
    var field = document.getElementById("f-" + counter.dataset.for);
    var min = Number(field.dataset.min) || 0;
    function update() {
      var n = field.value.trim().length;
      counter.textContent = n < min ? n + " / " + min + " min" : String(n);
      counter.classList.toggle("is-ok", n >= min);
    }
    field.addEventListener("input", update);
    update();
  });

  /* ---- errors clear as the person fixes each field, not only on the next submit ---- */
  function clearFixed(e) {
    if (e.target.getAttribute("aria-invalid") === "true") e.target.removeAttribute("aria-invalid");
    if (!form.querySelector('[aria-invalid="true"]')) errorBox.hidden = true;
  }
  form.addEventListener("input", clearFixed);
  form.addEventListener("change", clearFixed);

  function value(name) { var el = form.elements[name]; return el ? el.value.trim() : ""; }

  /* ---- college: picked from the AISHE list, or explicitly "not listed" ---- */
  var collegeId = document.getElementById("f-college_id");
  var collegePicked = document.getElementById("college-picked");
  var collegeUnlisted = false;
  function showCollegeState(text) {
    collegePicked.textContent = text || "";
    collegePicked.hidden = !text;
  }
  window.KodithCollegeSearch.attach(document.getElementById("f-college"), {
    listbox: document.getElementById("college-list"),
    allowUnlisted: true,
    onPick: function (c) {
      collegeId.value = String(c.id); collegeUnlisted = false;
      showCollegeState("✓ From the official list · " + [c.district, c.state].filter(Boolean).join(", "));
    },
    onUnlisted: function () {
      collegeId.value = ""; collegeUnlisted = true;
      showCollegeState("Not in the list, so we'll use the name as you typed it.");
    },
    onEdit: function () { collegeId.value = ""; collegeUnlisted = false; showCollegeState(""); },
  });

  function showError(message, fieldNames) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    form.querySelectorAll("[aria-invalid]").forEach(function (el) { el.removeAttribute("aria-invalid"); });
    (fieldNames || []).forEach(function (name) {
      var el = document.getElementById("f-" + name);
      if (el) el.setAttribute("aria-invalid", "true");
    });
    var first = fieldNames && fieldNames.length && document.getElementById("f-" + fieldNames[0]);
    (first || errorBox).focus();
  }

  function validate() {
    var bad = [], msgs = [];
    function need(name, label, min) {
      var v = value(name);
      if (!v) { bad.push(name); msgs.push(label + " is required."); }
      else if (min && v.length < min) { bad.push(name); msgs.push(label + " needs at least " + min + " characters."); }
    }
    need("name", "Name", 2);
    need("email", "Email");
    if (value("email") && !EMAIL_RE.test(value("email"))) { bad.push("email"); msgs.push("That email address doesn't look right."); }
    need("college", "College", 2);
    if (value("college") && !collegeId.value && !collegeUnlisted) { bad.push("college"); msgs.push("Pick your college from the list, or choose “My college isn't listed”."); }
    need("about", "About you", 30);
    need("motivation", "Why you want to bring Kodith to your college", 30);
    if (!document.getElementById("f-consent").checked) { bad.push("consent"); msgs.push("Please confirm we can contact you about the role."); }
    return { bad: bad, msgs: msgs };
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var check = validate();
    if (check.bad.length) {
      showError(check.msgs.length > 1 ? check.msgs[0] + " (and " + (check.msgs.length - 1) + " more)" : check.msgs[0], check.bad);
      return;
    }
    errorBox.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    var payload = {
      name: value("name"), email: value("email"), phone: value("phone"), college: value("college"),
      college_id: collegeId.value ? Number(collegeId.value) : null, college_unlisted: collegeUnlisted,
      course_year: value("course_year"), city: value("city"), linkedin: value("linkedin"),
      about: value("about"), motivation: value("motivation"),
      consent: document.getElementById("f-consent").checked,
      website: value("website"),
      elapsed_ms: Date.now() - startedAt,
    };

    fetch("/api/cce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (body) { return { ok: r.ok, body: body }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body.error || "Something went wrong. Please try again, or email us instead.");
        // Thank them by first name. textContent, never HTML: this is what they typed.
        var first = value("name").split(/\s+/)[0];
        if (first) document.getElementById("doneTitle").textContent = "Thanks, " + first + ". We've got it.";
        form.hidden = true;
        var done = document.getElementById("done");
        done.hidden = false;
        done.focus();
        done.scrollIntoView({ block: "start" });
      })
      .catch(function (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send application";
        var msg = err && err.message && err.message !== "Failed to fetch" ? err.message
          : "Couldn't reach the server. Check your connection and try again, or email us instead.";
        showError(msg, []);
      });
  });
})();
