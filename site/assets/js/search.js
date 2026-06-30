(function () {
  var root = document.querySelector("[data-question-search]");
  var dataNode = document.getElementById("question-search-data");
  var template = document.getElementById("question-result-template");

  if (!root || !dataNode || !template) {
    return;
  }

  var questions = JSON.parse(dataNode.textContent || "[]");
  if (typeof questions === "string") {
    questions = JSON.parse(questions);
  }
  var basePath = root.getAttribute("data-base-path") || "/";
  var input = root.querySelector("[data-search-input]");
  var typeFilter = root.querySelector("[data-type-filter]");
  var episodeFilter = root.querySelector("[data-episode-filter]");
  var clearButton = root.querySelector("[data-clear-search]");
  var resultList = root.querySelector("[data-search-results]");
  var resultCount = root.querySelector("[data-result-count]");
  var resultLimit = 100;

  function normalize(value) {
    return (value || "").toString().toLowerCase().trim();
  }

  function tokenize(value) {
    return normalize(value).split(/\s+/).filter(Boolean);
  }

  function siteUrl(path) {
    return basePath.replace(/\/?$/, "/") + (path || "").replace(/^\/+/, "");
  }

  function sortedDefaultRows(rows) {
    return rows.slice().sort(function (a, b) {
      var aNumber = a.episode_number || 0;
      var bNumber = b.episode_number || 0;
      if (aNumber !== bNumber) {
        return bNumber - aNumber;
      }
      return (a.row_index || 0) - (b.row_index || 0);
    });
  }

  function scoreRow(row, query, tokens) {
    if (!tokens.length) {
      return 1;
    }

    var title = normalize(row.episode_title);
    var question = normalize(row.question);
    var answer = normalize(row.short_answer);
    var searchText = normalize(row.search_text || [title, question, answer].join(" "));

    if (!tokens.every(function (token) { return searchText.indexOf(token) !== -1; })) {
      return 0;
    }

    var score = 10;
    if (question.indexOf(query) !== -1) {
      score += 80;
    }
    if (title.indexOf(query) !== -1) {
      score += 45;
    }
    if (answer.indexOf(query) !== -1) {
      score += 25;
    }

    tokens.forEach(function (token) {
      if (question.indexOf(token) !== -1) {
        score += 8;
      }
      if (answer.indexOf(token) !== -1) {
        score += 4;
      }
      if (title.indexOf(token) !== -1) {
        score += 5;
      }
    });

    score += Math.min((row.episode_number || 0) / 1000, 1);
    return score;
  }

  function matchesFilters(row) {
    var type = typeFilter ? typeFilter.value : "all";
    var episode = episodeFilter ? parseInt(episodeFilter.value, 10) : NaN;

    if (type === "numbered" && !row.is_numbered) {
      return false;
    }
    if (type === "special" && !row.is_special) {
      return false;
    }
    if (!Number.isNaN(episode) && row.episode_number !== episode) {
      return false;
    }

    return true;
  }

  function setText(selector, value, node) {
    var target = node.querySelector(selector);
    if (target) {
      target.textContent = value || "";
    }
  }

  function render(rows) {
    resultList.textContent = "";

    rows.slice(0, resultLimit).forEach(function (row) {
      var fragment = template.content.cloneNode(true);
      var item = fragment.querySelector("[data-result-item]");
      var episodeLink = fragment.querySelector("[data-episode-link]");
      var videoLink = fragment.querySelector("[data-video-link]");

      setText("[data-result-question]", row.question, fragment);
      setText("[data-result-answer]", row.short_answer, fragment);
      setText("[data-result-meta]", [
        row.is_numbered ? "Live Stream #" + row.episode_number : "Special",
        row.time_label
      ].join(" · "), fragment);

      if (episodeLink) {
        episodeLink.href = siteUrl(row.content_path);
        episodeLink.textContent = row.episode_title || "Question page";
      }
      if (videoLink) {
        videoLink.href = row.video_url;
        videoLink.textContent = "Watch at " + row.time_label;
      }

      if (item) {
        resultList.appendChild(item);
      }
    });

    if (resultCount) {
      var limited = rows.length > resultLimit ? " showing first " + resultLimit.toLocaleString() : "";
      resultCount.textContent = rows.length.toLocaleString() + " results" + limited;
    }
  }

  function updateUrl() {
    var params = new URLSearchParams();
    if (input && input.value.trim()) {
      params.set("q", input.value.trim());
    }
    if (typeFilter && typeFilter.value !== "all") {
      params.set("type", typeFilter.value);
    }
    if (episodeFilter && episodeFilter.value.trim()) {
      params.set("episode", episodeFilter.value.trim());
    }

    var nextUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
    window.history.replaceState({}, "", nextUrl);
  }

  function applySearch() {
    var query = normalize(input ? input.value : "");
    var tokens = tokenize(query);
    var scored = [];

    questions.forEach(function (row) {
      if (!matchesFilters(row)) {
        return;
      }

      var score = scoreRow(row, query, tokens);
      if (score > 0) {
        scored.push({ row: row, score: score });
      }
    });

    var rows;
    if (tokens.length) {
      rows = scored.sort(function (a, b) {
        if (a.score !== b.score) {
          return b.score - a.score;
        }
        return (b.row.episode_number || 0) - (a.row.episode_number || 0);
      }).map(function (entry) {
        return entry.row;
      });
    } else {
      rows = sortedDefaultRows(scored.map(function (entry) {
        return entry.row;
      }));
    }

    render(rows);
    updateUrl();
  }

  function hydrateFromUrl() {
    var params = new URLSearchParams(window.location.search);
    if (input && params.has("q")) {
      input.value = params.get("q");
    }
    if (typeFilter && params.has("type")) {
      typeFilter.value = params.get("type");
    }
    if (episodeFilter && params.has("episode")) {
      episodeFilter.value = params.get("episode");
    }
  }

  [input, typeFilter, episodeFilter].forEach(function (control) {
    if (control) {
      control.addEventListener("input", applySearch);
      control.addEventListener("change", applySearch);
    }
  });

  if (clearButton) {
    clearButton.addEventListener("click", function () {
      if (input) {
        input.value = "";
      }
      if (typeFilter) {
        typeFilter.value = "all";
      }
      if (episodeFilter) {
        episodeFilter.value = "";
      }
      applySearch();
      if (input) {
        input.focus();
      }
    });
  }

  hydrateFromUrl();
  applySearch();
})();
