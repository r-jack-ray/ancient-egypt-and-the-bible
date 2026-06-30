(function () {
  function normalize(value) {
    return (value || "").toString().toLowerCase().trim();
  }

  function tokenize(value) {
    return normalize(value).split(/\s+/).filter(Boolean);
  }

  document.querySelectorAll("[data-filter-control]").forEach(function (input) {
    var targetSelector = input.getAttribute("data-filter-target");
    var target = targetSelector ? document.querySelector(targetSelector) : null;
    if (!target) {
      return;
    }

    var countTarget = document.querySelector(input.getAttribute("data-filter-count") || "");
    var items = Array.prototype.slice.call(target.querySelectorAll("[data-filter-item]"));

    function applyFilter() {
      var tokens = tokenize(input.value);
      var visible = 0;

      items.forEach(function (item) {
        var haystack = normalize(item.getAttribute("data-filter-text") || item.textContent);
        var matches = tokens.every(function (token) {
          return haystack.indexOf(token) !== -1;
        });

        item.hidden = !matches;
        if (matches) {
          visible += 1;
        }
      });

      if (countTarget) {
        countTarget.textContent = visible.toLocaleString() + " shown";
      }
    }

    input.addEventListener("input", applyFilter);
    applyFilter();
  });
})();
