// Fallback handling for missing local image assets.
(function () {
  "use strict";

  var FALLBACK_SRC = "imgs/relacion.png";

  function applyFallback(img) {
    img.addEventListener("error", function handleImageError() {
      if (img.dataset.fallbackApplied === "1") return;
      img.dataset.fallbackApplied = "1";
      img.src = FALLBACK_SRC;
      img.alt = (img.alt ? img.alt + " " : "") + "(imagen de referencia)";
    });
  }

  document.querySelectorAll("img").forEach(applyFallback);
})();
