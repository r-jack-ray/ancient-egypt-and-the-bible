(function () {
  var root = document.querySelector("[data-question-search]");
  var dataNode = document.getElementById("question-search-data");
  var aliasNode = document.getElementById("question-search-aliases");
  var template = document.getElementById("question-result-template");
  var core = window.QuestionSearchCore;

  if (!root || !dataNode || !template || !core) {
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
  var sortControl = root.querySelector("[data-sort-control]");
  var clearButton = root.querySelector("[data-clear-search]");
  var loadMoreButton = root.querySelector("[data-load-more]");
  var resultList = root.querySelector("[data-search-results]");
  var resultCount = root.querySelector("[data-result-count]");
  var emptyState = root.querySelector("[data-empty-state]");
  var resultLimitStep = 100;
  var resultLimit = resultLimitStep;
  var currentRows = [];
  var currentHighlightModel = null;
  var questionBySearchId = {};
  var normalize = core.normalize;
  var tokenize = core.tokenize;
  var normalizeBibleReferenceQuery = core.normalizeBibleReferenceQuery;
  var searchAliasConfig = core.readSearchAliasConfig(aliasNode ? aliasNode.textContent : "");
  var searchAliasIndex = core.createSearchAliasIndex(searchAliasConfig);

  function getSearchAliases(value) {
    return core.getSearchAliases(value, searchAliasIndex);
  }

  function prepareSearchRows(rows) {
    rows.forEach(function (row, index) {
      row.search_id = index.toString();
      row.episode_number_text = row.episode_number ? row.episode_number.toString() : "";
      row.search_aliases = getSearchAliases([
        row.episode_title,
        row.question,
        row.short_answer,
        row.search_text
      ].join(" "));
      questionBySearchId[row.search_id] = row;
    });
  }

  function createMiniSearchIndex(rows) {
    var MiniSearchConstructor = window.MiniSearch || (typeof MiniSearch === "function" ? MiniSearch : null);
    if (typeof MiniSearchConstructor !== "function") {
      return null;
    }

    try {
      var index = new MiniSearchConstructor({
        idField: "search_id",
        fields: [
          "episode_number_text",
          "episode_title",
          "question",
          "short_answer",
          "search_text",
          "search_aliases"
        ],
        storeFields: ["search_id"],
        searchOptions: {
          boost: {
            question: 6,
            episode_title: 4,
            short_answer: 3,
            episode_number_text: 5,
            search_text: 1,
            search_aliases: 2
          },
          combineWith: "AND",
          prefix: true,
          fuzzy: function (term) {
            return term.length > 4 ? 0.2 : false;
          }
        }
      });

      index.addAll(rows);
      return index;
    } catch (error) {
      return null;
    }
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

  function compareByNewest(a, b) {
    var aNumber = a.episode_number || 0;
    var bNumber = b.episode_number || 0;
    if (aNumber !== bNumber) {
      return bNumber - aNumber;
    }
    return (a.row_index || 0) - (b.row_index || 0);
  }

  function compareByOldest(a, b) {
    var aNumber = a.episode_number || 0;
    var bNumber = b.episode_number || 0;
    if (aNumber !== bNumber) {
      return aNumber - bNumber;
    }
    return (a.row_index || 0) - (b.row_index || 0);
  }

  function compareByTime(a, b) {
    var aNumber = a.episode_number || 0;
    var bNumber = b.episode_number || 0;
    if (aNumber !== bNumber) {
      return bNumber - aNumber;
    }
    return (a.start_seconds || 0) - (b.start_seconds || 0);
  }

  function scoreRow(row, query, tokens) {
    if (!tokens.length) {
      return 1;
    }

    var title = normalize(row.episode_title);
    var question = normalize(row.question);
    var answer = normalize(row.short_answer);
    var searchText = normalize([row.search_text || [title, question, answer].join(" "), row.search_aliases].join(" "));

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

  function exactBoost(row, query, tokens) {
    if (!tokens.length) {
      return 0;
    }

    var title = normalize(row.episode_title);
    var question = normalize(row.question);
    var answer = normalize(row.short_answer);
    var score = 0;

    if (question.indexOf(query) !== -1) {
      score += 8;
    }
    if (title.indexOf(query) !== -1) {
      score += 5;
    }
    if (answer.indexOf(query) !== -1) {
      score += 3;
    }

    tokens.forEach(function (token) {
      if (question.indexOf(token) !== -1) {
        score += 1.5;
      }
      if (title.indexOf(token) !== -1) {
        score += 1;
      }
      if (answer.indexOf(token) !== -1) {
        score += 0.75;
      }
    });

    return score;
  }

  function fallbackSearch(query, tokens) {
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

    return scored;
  }

  function searchQuestions(query, tokens, miniSearch) {
    if (!tokens.length || !miniSearch) {
      return fallbackSearch(query, tokens);
    }

    return miniSearch.search(query).reduce(function (scored, result) {
      var row = questionBySearchId[result.id];
      if (row && matchesFilters(row)) {
        scored.push({
          row: row,
          score: result.score + exactBoost(row, query, tokens)
        });
      }
      return scored;
    }, []);
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

  function appendHighlightedText(target, value, highlightModel) {
    var text = value || "";
    var matches = core.getHighlightSpans(text, highlightModel);

    target.textContent = "";
    if (!matches.length) {
      target.textContent = text;
      return;
    }

    var cursor = 0;
    matches.forEach(function (match) {
      if (match.start > cursor) {
        target.appendChild(document.createTextNode(text.slice(cursor, match.start)));
      }
      var marker = document.createElement("mark");
      marker.textContent = text.slice(match.start, match.end);
      target.appendChild(marker);
      cursor = match.end;
    });

    if (cursor < text.length) {
      target.appendChild(document.createTextNode(text.slice(cursor)));
    }
  }

  function render(rows, highlightModel) {
    resultList.textContent = "";

    rows.slice(0, resultLimit).forEach(function (row) {
      var fragment = template.content.cloneNode(true);
      var item = fragment.querySelector("[data-result-item]");
      var episodeLink = fragment.querySelector("[data-episode-link]");
      var videoLink = fragment.querySelector("[data-video-link]");
      var questionNode = fragment.querySelector("[data-result-question]");
      var answerNode = fragment.querySelector("[data-result-answer]");

      setText("[data-result-meta]", [
        row.is_numbered ? "Live Stream #" + row.episode_number : "Special",
        "question " + row.row_index
      ].join(" · "), fragment);

      if (episodeLink) {
        episodeLink.href = siteUrl(row.content_path);
        appendHighlightedText(episodeLink, row.episode_title || "Question page", highlightModel);
      }
      if (videoLink) {
        videoLink.href = row.video_url;
        videoLink.setAttribute("aria-label", "Watch video at " + row.time_label);
        videoLink.title = "Watch video at " + row.time_label;
        videoLink.textContent = "";
        var videoLabel = document.createElement("span");
        var videoTime = document.createElement("strong");
        videoLabel.textContent = "Video";
        videoTime.textContent = row.time_label;
        videoLink.appendChild(videoLabel);
        videoLink.appendChild(videoTime);
      }
      if (questionNode) {
        appendHighlightedText(questionNode, row.question, highlightModel);
      }
      if (answerNode) {
        appendHighlightedText(answerNode, row.short_answer, highlightModel);
      }

      if (item) {
        resultList.appendChild(item);
      }
    });

    if (resultCount) {
      var shown = Math.min(rows.length, resultLimit);
      resultCount.textContent = shown.toLocaleString() + " of " + rows.length.toLocaleString() + " results";
    }
    if (loadMoreButton) {
      loadMoreButton.hidden = rows.length <= resultLimit;
    }
    if (emptyState) {
      emptyState.hidden = rows.length !== 0;
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
    if (sortControl && sortControl.value !== "relevance") {
      params.set("sort", sortControl.value);
    }

    var nextUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
    window.history.replaceState({}, "", nextUrl);
  }

  prepareSearchRows(questions);
  var miniSearch = createMiniSearchIndex(questions);

  function applySearch() {
    var query = normalizeBibleReferenceQuery(input ? input.value : "");
    var tokens = tokenize(query);
    var highlightModel = core.buildHighlightModel(query, searchAliasIndex);
    var scored = searchQuestions(query, tokens, miniSearch);
    var sortMode = sortControl ? sortControl.value : "relevance";

    var rows;
    if (tokens.length && sortMode === "relevance") {
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

    if (sortMode === "newest") {
      rows = rows.sort(compareByNewest);
    } else if (sortMode === "oldest") {
      rows = rows.sort(compareByOldest);
    } else if (sortMode === "time") {
      rows = rows.sort(compareByTime);
    }

    currentRows = rows;
    currentHighlightModel = highlightModel;
    render(rows, highlightModel);
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
    if (sortControl && params.has("sort")) {
      sortControl.value = params.get("sort");
    }
  }

  [input, typeFilter, episodeFilter, sortControl].forEach(function (control) {
    if (control) {
      control.addEventListener("input", function () {
        resultLimit = resultLimitStep;
        applySearch();
      });
      control.addEventListener("change", function () {
        resultLimit = resultLimitStep;
        applySearch();
      });
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
      if (sortControl) {
        sortControl.value = "relevance";
      }
      resultLimit = resultLimitStep;
      applySearch();
      if (input) {
        input.focus();
      }
    });
  }

  if (loadMoreButton) {
    loadMoreButton.addEventListener("click", function () {
      resultLimit += resultLimitStep;
      render(currentRows, currentHighlightModel);
      updateUrl();
    });
  }

  hydrateFromUrl();
  applySearch();
})();
