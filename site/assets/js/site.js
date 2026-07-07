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

  function isExpandedAnswersVisible(target) {
    return target.getAttribute("data-expanded-answers-visible") === "true";
  }

  function setExpandedAnswerAutoVisible(answer, isAutoVisible) {
    if (!answer) {
      return;
    }

    if (isAutoVisible) {
      answer.setAttribute("data-expanded-answer-auto", "true");
    } else {
      answer.removeAttribute("data-expanded-answer-auto");
    }
  }

  function refreshExpandedAnswerVisibility(target) {
    var showAll = isExpandedAnswersVisible(target);

    Array.prototype.slice.call(target.querySelectorAll("[data-expanded-answer]")).forEach(function (answer) {
      answer.hidden = !(showAll || answer.getAttribute("data-expanded-answer-auto") === "true");
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
      var expandedAnswer = item.querySelector("[data-expanded-answer]");
      var expandedAnswerText = expandedAnswer ? expandedAnswer.textContent || "" : "";
      var visibleText = item.textContent || "";

      if (expandedAnswerText) {
        visibleText = visibleText.replace(expandedAnswerText, "");
      }

      return {
        item: item,
        highlightRoot: highlightRoot,
        expandedAnswer: expandedAnswer,
        expandedAnswerText: expandedAnswerText,
        filterText: filterText,
        visibleText: visibleText,
        fallbackHaystack: normalize(filterText)
      };
    });

    hydrateFilterInput(input);

    function applyFilter() {
      var aliasIndex = getFilterAliasIndex();
      var matchModel = filterCore ? filterCore.createSearchMatchModel(input.value, aliasIndex) : null;
      var tokens = matchModel ? matchModel.tokens : tokenize(input.value);
      var highlightModel = matchModel && tokens.length ? matchModel.highlightModel : null;
      var visible = 0;

      filterRows.forEach(function (row) {
        var matches = matchModel
          ? filterCore.matchesSearchText(row.filterText, matchModel)
          : tokens.every(function (token) {
            return row.fallbackHaystack.indexOf(token) !== -1;
          });

        row.item.hidden = !matches;
        setExpandedAnswerAutoVisible(row.expandedAnswer, matches && highlightModel && filterCore
          ? filterCore.hasUnrepresentedHighlightMatch(row.expandedAnswerText, row.visibleText, highlightModel)
          : false);
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
      refreshExpandedAnswerVisibility(target);
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
      target.setAttribute("data-expanded-answers-visible", isVisible ? "true" : "false");
      refreshExpandedAnswerVisibility(target);
      button.setAttribute("aria-expanded", isVisible ? "true" : "false");
      button.textContent = isVisible ? "Hide expanded answers" : "Show expanded answers";
    }

    button.addEventListener("click", function () {
      setExpandedAnswersVisible(button.getAttribute("aria-expanded") !== "true");
    });

    setExpandedAnswersVisible(false);
  });
})();
