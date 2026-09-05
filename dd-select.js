/* Arian — custom dropdown engine (v1.8.53).
   Converts every <select> into the strain-select look: a styled current-value
   button + glass listbox, fully keyboard-navigable, RTL/LTR aware, i18n-aware
   (option labels re-localized on rossim:lang via data-i18n options).
   Native <select> stays in the DOM (hidden) as the source of truth, so form
   logic reading .value keeps working unchanged. */
(function () {
  "use strict";

  var SKIP = ["env-exp-from", "env-exp-to"]; // date inputs are native by design

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function upgrade(sel) {
    if (sel.dataset.ddDone || SKIP.indexOf(sel.id) > -1 || sel.multiple) return;
    sel.dataset.ddDone = "1";
    sel.classList.add("dd-native");

    var box = document.createElement("div");
    box.className = "strain-select dd-select";
    box.setAttribute("role", "combobox");
    box.setAttribute("aria-expanded", "false");
    box.setAttribute("aria-controls", sel.id + "-dd-list");
    box.tabIndex = 0;
    if (sel.id) box.id = sel.id + "-dd";

    var current = document.createElement("div");
    current.className = "strain-select__current dd-current";
    current.innerHTML =
      '<span class="strain-select__value dd-value">' + esc(labelOf(sel)) + "</span>" +
      '<span class="strain-select__icon" aria-hidden="true">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
      "</span>";

    var list = document.createElement("ul");
    list.className = "strain-select__list dd-list";
    list.id = (sel.id || "dd") + "-dd-list";
    list.setAttribute("role", "listbox");
    list.hidden = true;
    list.innerHTML = [...sel.options].map(function (o) {
      return '<li class="strain-select__option" role="option" tabindex="-1" data-val="' +
        esc(o.value) + '" aria-selected="' + (o.selected ? "true" : "false") + '">' +
        esc(o.textContent) + "</li>";
    }).join("");

    sel.parentNode.insertBefore(box, sel);
    box.appendChild(current);
    box.appendChild(list);
    sel.classList.add("dd-hidden");

    function labelOf(s) {
      return s.options[s.selectedIndex] ? s.options[s.selectedIndex].textContent : "";
    }
    function isOpen() { return !list.hidden; }
    function open() {
      // close any other open dd
      document.querySelectorAll(".dd-select[data-open='1']").forEach(function (b) {
        b.dispatchEvent(new CustomEvent("dd-close"));
      });
      list.hidden = false; box.setAttribute("aria-expanded", "true");
      box.dataset.open = "1";
      var selOp = list.querySelector('[aria-selected="true"]');
      if (selOp) selOp.focus();
    }
    function close() {
      list.hidden = true; box.setAttribute("aria-expanded", "false");
      delete box.dataset.open;
    }
    function pick(opt) {
      sel.value = opt.getAttribute("data-val");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      list.querySelectorAll(".strain-select__option").forEach(function (o) {
        o.setAttribute("aria-selected", o === opt ? "true" : "false");
      });
      current.querySelector(".dd-value").textContent = opt.textContent;
      close();
    }

    box.addEventListener("dd-close", close);
    current.addEventListener("click", function (e) {
      e.stopPropagation(); isOpen() ? close() : open();
    });
    list.addEventListener("click", function (e) {
      var opt = e.target.closest(".strain-select__option");
      if (opt) pick(opt);
    });
    box.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "Enter" || e.key === " ") {
        if (isOpen()) { var s = list.querySelector('[aria-selected="true"]'); if (s) s.click(); }
        else open();
        e.preventDefault(); return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        var opts = [...list.querySelectorAll(".strain-select__option")];
        if (!opts.length) return;
        if (!isOpen()) { open(); return; }
        var i = opts.findIndex(function (o) { return o.getAttribute("aria-selected") === "true"; });
        i = (i + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length;
        opts.forEach(function (o) { o.setAttribute("aria-selected", o === opts[i] ? "true" : "false"); });
        opts[i].focus(); e.preventDefault();
      }
    });
    document.addEventListener("click", function (e) {
      if (isOpen() && !box.contains(e.target)) close();
    });

    // keep native select's programmatic .value changes reflected (one-way sync)
    sel.addEventListener("change", function () {
      current.querySelector(".dd-value").textContent = labelOf(sel);
      list.querySelectorAll(".strain-select__option").forEach(function (o) {
        o.setAttribute("aria-selected", o.value === sel.value ? "true" : "false");
      });
    });

    // re-localize labels on language switch (options carry data-i18n)
    window.addEventListener("rossim:lang", function () {
      list.querySelectorAll(".strain-select__option").forEach(function (o, idx) {
        var src = sel.options[idx];
        if (src && src.dataset.i18n && window.tr) o.textContent = window.tr(src.dataset.i18n);
        else if (src) o.textContent = src.textContent;
      });
      current.querySelector(".dd-value").textContent = labelOf(sel);
    });
  }

  function upgradeAll() {
    document.querySelectorAll("select").forEach(upgrade);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", upgradeAll);
  } else { upgradeAll(); }
  // dynamically-inserted selects (experiment pen rows, dialogs) get upgraded too
  new MutationObserver(function () { upgradeAll(); })
    .observe(document.body, { childList: true, subtree: true });
  window.DDSelect = { upgradeAll: upgradeAll };
})();
