/* ==========================================================================
   KODITH ADMIN — shared shell: toast, the fetch wrapper, and the login /
   session / logout flow.

   Loaded by every admin page (/admin and /admin/cards) so the auth flow
   exists in exactly one place. Duplicating it per page would mean two
   copies of security-relevant logic drifting apart over time.

   Each page supplies its own init callback via KodithAdmin.start().

   Expects this markup on every page that uses it:
     #loginScreen  #loginForm  #loginError  #dashboard  #whoami
     #logoutBtn    #toast
   ========================================================================== */
window.KodithAdmin = (function () {
  "use strict";

  /* ------------------------------------------------------------- toast */

  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  function toast(message, isError) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastEl.classList.toggle("is-error", !!isError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3200);
  }

  /* --------------------------------------------------------------- api */

  // Set once the auth flow is wired up below — lets api() bounce back to the
  // login form on a 401 without needing to know about the DOM itself.
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

  /* --------------------------------------------------------- auth flow */

  /**
   * Runs the session check and wires up login/logout. `onAuthenticated` is
   * called with the signed-in admin once the session is confirmed — that's
   * where a page does its own initial load.
   */
  function start(onAuthenticated) {
    var loginScreen = document.getElementById("loginScreen");
    var dashboard = document.getElementById("dashboard");
    var loginForm = document.getElementById("loginForm");
    var loginError = document.getElementById("loginError");

    function showDashboard(who) {
      loginScreen.hidden = true;
      dashboard.hidden = false;
      var whoami = document.getElementById("whoami");
      if (whoami) whoami.textContent = who.name ? who.name + " (" + who.email + ")" : who.email;
      if (typeof onAuthenticated === "function") onAuthenticated(who);
      // The login card can leave the page scrolled partway down; without
      // this the dashboard renders from that offset, which reads as
      // "nothing happened" until you scroll back up.
      window.scrollTo(0, 0);
    }

    function showLogin() {
      dashboard.hidden = true;
      loginScreen.hidden = false;
    }

    // A 401 from any admin call means the session expired mid-use — bounce
    // back to the login form rather than leaving a half-broken page up.
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
  }

  return { toast: toast, api: api, start: start };
})();
