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

  var filterCore = window.QuestionSearchCore || null;
  var filterAliasIndex = null;

  function normalize(value) {
    return (value || "").toString().toLowerCase().trim();
  }

  function tokenize(value) {
    return normalize(value).split(/\s+/).filter(Boolean);
  }

  function getFilterAliasIndex() {
    if (!filterCore) {
      return null;
    }
    if (!filterAliasIndex) {
      filterAliasIndex = filterCore.createSearchAliasIndex(window.QuestionSearchAliasConfig || {});
    }
    return filterAliasIndex;
  }

  function tokenizeFilterQuery(value) {
    if (!filterCore) {
      return tokenize(value);
    }

    return filterCore.tokenizeSearchTerms(filterCore.normalizeBibleReferenceQuery(value));
  }

  function buildFilterHaystack(value) {
    var text = value || "";

    if (!filterCore) {
      return normalize(text);
    }

    var aliasIndex = getFilterAliasIndex();
    return normalize([
      text,
      filterCore.normalizeBibleReferenceQuery(text),
      filterCore.getSearchAliases(text, aliasIndex)
    ].join(" "));
  }

  function hydrateFilterInput(input) {
    var paramName = input.getAttribute("data-filter-param");
    if (!paramName) {
      return;
    }

    try {
      var params = new URLSearchParams(window.location.search);
      if (params.has(paramName)) {
        input.value = params.get(paramName) || "";
      }
    } catch (error) {}
  }

  function clearFilterHighlights(root) {
    Array.prototype.slice.call(root.querySelectorAll("mark[data-filter-highlight]")).forEach(function (marker) {
      var parent = marker.parentNode;
      if (!parent) {
        return;
      }
      parent.replaceChild(document.createTextNode(marker.textContent || ""), marker);
      parent.normalize();
    });
  }

  function highlightTextNode(textNode, highlightModel) {
    var text = textNode.nodeValue || "";
    var matches = filterCore.getHighlightSpans(text, highlightModel);
    var fragment;
    var cursor = 0;

    if (!matches.length) {
      return;
    }

    fragment = document.createDocumentFragment();
    matches.forEach(function (match) {
      if (match.start > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, match.start)));
      }
      var marker = document.createElement("mark");
      marker.setAttribute("data-filter-highlight", "");
      marker.textContent = text.slice(match.start, match.end);
      fragment.appendChild(marker);
      cursor = match.end;
    });

    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  function applyFilterHighlights(root, highlightModel) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!node.nodeValue || !node.nodeValue.trim() || !parent) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.closest("script, style, mark")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var textNodes = [];
    var node;

    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    textNodes.forEach(function (textNode) {
      highlightTextNode(textNode, highlightModel);
    });
  }

  document.querySelectorAll("[data-filter-control]").forEach(function (input) {
    var targetSelector = input.getAttribute("data-filter-target");
    var target = targetSelector ? document.querySelector(targetSelector) : null;
    if (!target) {
      return;
    }

    var countTarget = document.querySelector(input.getAttribute("data-filter-count") || "");
    var items = Array.prototype.slice.call(target.querySelectorAll("[data-filter-item]"));
    var highlightSelector = input.getAttribute("data-filter-highlight-target");
    var filterRows = items.map(function (item) {
      var filterText = item.getAttribute("data-filter-text") || item.textContent;
      var highlightRoot = highlightSelector ? item.querySelector(highlightSelector) : null;
      return {
        item: item,
        highlightRoot: highlightRoot,
        haystack: buildFilterHaystack(filterText)
      };
    });

    hydrateFilterInput(input);

    function applyFilter() {
      var tokens = tokenizeFilterQuery(input.value);
      var aliasIndex = getFilterAliasIndex();
      var highlightModel = filterCore && tokens.length ? filterCore.buildHighlightModel(filterCore.normalizeBibleReferenceQuery(input.value), aliasIndex) : null;
      var visible = 0;

      filterRows.forEach(function (row) {
        var matches = tokens.every(function (token) {
          return row.haystack.indexOf(token) !== -1;
        });

        row.item.hidden = !matches;
        if (row.highlightRoot) {
          clearFilterHighlights(row.highlightRoot);
          if (matches && highlightModel) {
            applyFilterHighlights(row.highlightRoot, highlightModel);
          }
        }
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
