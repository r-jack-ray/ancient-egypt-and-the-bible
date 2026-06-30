(function () {
  var themePicker = document.querySelector("[data-theme-picker]");
  var themeStorageKey = "aeb-theme";

  function storedTheme() {
    try {
      return localStorage.getItem(themeStorageKey) || "system";
    } catch (error) {
      return "system";
    }
  }

  function applyTheme(theme) {
    var normalized = theme === "dark" || theme === "light" ? theme : "system";
    if (normalized === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", normalized);
    }
    if (themePicker) {
      themePicker.value = normalized;
    }
  }

  if (themePicker) {
    applyTheme(storedTheme());
    themePicker.addEventListener("change", function () {
      var theme = themePicker.value;
      try {
        if (theme === "system") {
          localStorage.removeItem(themeStorageKey);
        } else {
          localStorage.setItem(themeStorageKey, theme);
        }
      } catch (error) {}
      applyTheme(theme);
    });
  }

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

  document.querySelectorAll("[data-expanded-answer-toggle]").forEach(function (button) {
    var targetSelector = button.getAttribute("data-expanded-answer-target");
    var target = targetSelector ? document.querySelector(targetSelector) : null;
    if (!target) {
      return;
    }

    var expandedAnswers = Array.prototype.slice.call(target.querySelectorAll("[data-expanded-answer]"));
    if (expandedAnswers.length === 0) {
      button.hidden = true;
      return;
    }

    function setExpandedAnswersVisible(isVisible) {
      expandedAnswers.forEach(function (answer) {
        answer.hidden = !isVisible;
      });

      button.setAttribute("aria-expanded", isVisible ? "true" : "false");
      button.textContent = isVisible ? "Hide expanded answers" : "Show expanded answers";
    }

    button.addEventListener("click", function () {
      setExpandedAnswersVisible(button.getAttribute("aria-expanded") !== "true");
    });

    setExpandedAnswersVisible(false);
  });
})();
