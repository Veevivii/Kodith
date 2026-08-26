/* ============================================================================
   KODITH — SITE CONTENT
   ============================================================================

   This is the ONLY file you need to edit to keep the site up to date.
   You do NOT need to touch index.html, the CSS, or any other JavaScript.

   Three sections of the site are built from this file:
     1. UPCOMING  — the next few workshops / meetups
     2. PROJECTS  — things members have built
     3. TEAM      — the core team grid

   HOW TO EDIT SAFELY
   ------------------
   - Everything lives inside { curly braces } separated by , commas.
   - Text goes inside "double quotes". Keep the quotes.
   - If your text contains a double quote, write it as \"  (backslash first).
   - Keep the comma after each } except the last one in a list.
   - To temporarily hide an entry, put // in front of each of its lines.
   - After editing, just save the file and refresh the page in the browser.

   If something disappears from the site after an edit, you almost certainly
   deleted a comma, a quote or a brace. Undo (Ctrl+Z) and try again.
   ========================================================================== */

const KODITH_DATA = {

  /* ==========================================================================
     1. UPCOMING
     --------------------------------------------------------------------------
     The next 2-3 workshops or meetups. Keep this list SHORT — it is meant to
     show what is coming next, not a full calendar.

     date    : machine-readable date, ALWAYS in YYYY-MM-DD format.
               This is what the site sorts by, and it is what makes past
               events disappear automatically. Get this format right.
     time    : free text, e.g. "19:00 IST" or "7-9pm". Leave "" to hide.
     title   : name of the session.
     format  : "Online" or "In person" or "Hybrid" — shown as a small tag.
     place   : where it happens. For online sessions put the platform.
     blurb   : one sentence on what it covers.
     link    : sign-up or details URL. Leave "" and no button is shown.

     Past events hide themselves automatically the day after they happen,
     so it is safe to leave an old one here for a while.
     ====================================================================== */
  upcoming: [
    {
      date:   "2026-09-06",
      time:   "19:00 IST",
      title:  "Getting started with ESP32",
      format: "Online",
      place:  "Discord",
      blurb:  "Flash your first board, read a sensor, push the data somewhere useful.",
      link:   ""
    },
    {
      date:   "2026-09-20",
      time:   "16:00 IST",
      title:  "Build night — home automation",
      format: "In person",
      place:  "Indore",
      blurb:  "Bring a half-finished project. Leave with it working, or at least understood.",
      link:   ""
    },
    {
      date:   "2026-10-04",
      time:   "19:00 IST",
      title:  "Data structures, without the leetcode grind",
      format: "Online",
      place:  "Discord",
      blurb:  "Why these shapes exist and when reaching for each one is the obvious move.",
      link:   ""
    }
  ],

  /* ==========================================================================
     2. PROJECTS
     --------------------------------------------------------------------------
     Things members have built — open source, hackathon projects, ongoing work.

     name    : project name.
     blurb   : ONE line. Two at the very most.
     tag     : short category, e.g. "IoT", "Web", "Tooling", "Hardware".
     status  : "Live", "In progress", or "Archived".
               "In progress" gets a small pulsing dot next to it.
     link    : GitHub / demo URL. Leave "" and the card is not clickable.
     ====================================================================== */
  projects: [
    {
      name:   "[PROJECT NAME]",
      blurb:  "[One line on what it does and why it exists.]",
      tag:    "IoT",
      status: "Live",
      link:   ""
    },
    {
      name:   "[PROJECT NAME]",
      blurb:  "[One line on what it does and why it exists.]",
      tag:    "Web",
      status: "In progress",
      link:   ""
    },
    {
      name:   "[PROJECT NAME]",
      blurb:  "[One line on what it does and why it exists.]",
      tag:    "Tooling",
      status: "Live",
      link:   ""
    },
    {
      name:   "[PROJECT NAME]",
      blurb:  "[One line on what it does and why it exists.]",
      tag:    "Hardware",
      status: "Archived",
      link:   ""
    }
  ],

  /* ==========================================================================
     3. TEAM
     --------------------------------------------------------------------------
     The core team.

     name  : full name as they want it shown.
     role  : keep it SHORT — "Technical — IoT", "Growth — content".
             Long roles wrap badly on phones.
     photo : path to the image, e.g. "assets/img/team/asha.jpg"
             Put photos in assets/img/team/. Square images work best
             (roughly 400x400). Leave "" and their initials are shown
             instead, which looks fine — better an empty slot than a
             stretched photo.
     link  : optional GitHub / LinkedIn URL. Leave "" for none.
     ====================================================================== */
  team: [
    { name: "[NAME]", role: "Founder — community", photo: "", link: "" },
    { name: "[NAME]", role: "Technical — IoT",     photo: "", link: "" },
    { name: "[NAME]", role: "Technical — software", photo: "", link: "" },
    { name: "[NAME]", role: "Growth — content",    photo: "", link: "" },
    { name: "[NAME]", role: "Events — meetups",    photo: "", link: "" },
    { name: "[NAME]", role: "Design",              photo: "", link: "" }
  ]

};
