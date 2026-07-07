(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.QuestionSearchCore = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var bibleReferenceBooks = [
    "genesis", "exodus", "leviticus", "numbers", "deuteronomy", "joshua",
    "judges", "ruth", "samuel", "kings", "chronicles", "ezra", "nehemiah",
    "esther", "proverbs", "ecclesiastes", "lamentations", "isaiah",
    "jeremiah", "ezekiel", "hosea", "obadiah", "micah", "nahum", "haggai",
    "zechariah", "malachi", "matthew", "mark", "luke", "romans",
    "corinthians", "galatians", "ephesians", "philippians", "colossians",
    "thessalonians", "hebrews", "james", "jude", "revelation", "apocalypse",
    "chron", "exod", "deut", "josh", "judg", "esth", "prov", "eccl", "ezek",
    "obad", "zech", "matt", "thess", "psalms", "psalm", "gen", "lev", "num",
    "rth", "sam", "kgs", "chr", "ezr", "neh", "lam", "isa", "jer", "hos",
    "mic", "nah", "hag", "mal", "mrk", "rom", "cor", "gal", "eph", "phil",
    "col", "heb", "jas", "jud", "rev", "psa", "mk", "lk", "ps"
  ];
  var bibleReferenceBookPattern = bibleReferenceBooks.slice().sort(function (a, b) {
    return b.length - a.length;
  }).join("|");
  var numberedBibleBooks = "sam|samuel|kgs|kings|chr|chron|chronicles|cor|corinthians|thess|thessalonians";

  function normalize(value) {
    return (value || "").toString().toLowerCase().trim();
  }

  function tokenize(value) {
    return normalize(value).split(/\s+/).filter(Boolean);
  }

  function tokenizeSearchTerms(value) {
    return normalize(value).replace(/<[^>]*>/g, " ").match(/[a-z0-9]+/g) || [];
  }

  function normalizeSearchPhrase(value) {
    return tokenizeSearchTerms(value).join(" ");
  }

  function normalizeBibleReferenceQuery(value) {
    var text = normalize(value);
    if (!text) {
      return "";
    }

    text = text.replace(new RegExp("\\b(first|1st|i)\\s+(" + numberedBibleBooks + ")\\b", "g"), "1 $2");
    text = text.replace(new RegExp("\\b(second|2nd|ii)\\s+(" + numberedBibleBooks + ")\\b", "g"), "2 $2");
    text = text.replace(new RegExp("\\b(third|3rd|iii)\\s+(" + numberedBibleBooks + ")\\b", "g"), "3 $2");
    text = text.replace(new RegExp("\\b([1-3])(" + numberedBibleBooks + ")(?=\\d|\\b)", "g"), "$1 $2");
    text = text.replace(new RegExp("\\b(" + bibleReferenceBookPattern + ")(\\d+)", "g"), "$1 $2");

    return text.replace(/\s+/g, " ").trim();
  }

  function readSearchAliasConfig(value) {
    var emptyConfig = {
      aliasGroups: [],
      phraseAliasGroups: []
    };

    if (!value) {
      return emptyConfig;
    }

    try {
      var data = typeof value === "string" ? JSON.parse(value || "{}") : value;
      if (typeof data === "string") {
        data = JSON.parse(data);
      }
      if (Array.isArray(data)) {
        return {
          aliasGroups: data,
          phraseAliasGroups: []
        };
      }
      if (data && Array.isArray(data.aliasGroups)) {
        return {
          aliasGroups: data.aliasGroups,
          phraseAliasGroups: Array.isArray(data.phraseAliasGroups) ? data.phraseAliasGroups : []
        };
      }
    } catch (error) {
      return emptyConfig;
    }

    return emptyConfig;
  }

  function uniqueValues(values) {
    var seen = {};
    return values.filter(function (value) {
      var key = normalizeSearchPhrase(value);
      if (!key || seen[key]) {
        return false;
      }
      seen[key] = true;
      return true;
    });
  }

  function createSearchAliasIndex(config) {
    var normalizedConfig = readSearchAliasConfig(config);
    var aliasGroups = normalizedConfig.aliasGroups;
    var phraseAliasGroups = normalizedConfig.phraseAliasGroups.map(function (group) {
      return uniqueValues(group.map(normalizeSearchPhrase));
    }).filter(function (group) {
      return group.length > 1;
    });
    var searchAliases = {};

    aliasGroups.forEach(function (group) {
      var terms = uniqueValues(group.map(normalizeSearchPhrase)).filter(function (term) {
        return term.indexOf(" ") === -1;
      });
      terms.forEach(function (term) {
        searchAliases[term] = terms.filter(function (alias) {
          return alias !== term;
        });
      });
    });

    return {
      aliasGroups: aliasGroups,
      phraseAliasGroups: phraseAliasGroups,
      searchAliases: searchAliases
    };
  }

  function getSearchAliases(value, aliasIndex) {
    var aliases = {};
    var tokens = tokenizeSearchTerms(value);
    var normalizedText = " " + tokens.join(" ") + " ";

    tokens.forEach(function (token) {
      (aliasIndex.searchAliases[token] || []).forEach(function (alias) {
        aliases[alias] = true;
      });
    });

    aliasIndex.phraseAliasGroups.forEach(function (group) {
      var hasMatch = group.some(function (term) {
        return normalizedText.indexOf(" " + term + " ") !== -1;
      });

      if (!hasMatch) {
        return;
      }

      group.forEach(function (alias) {
        aliases[alias] = true;
      });
    });

    return Object.keys(aliases).join(" ");
  }

  function getTextTokenSpans(value) {
    var text = value || "";
    var spans = [];
    var pattern = /[a-z0-9]+/gi;
    var match;

    while ((match = pattern.exec(text)) !== null) {
      spans.push({
        token: match[0].toLowerCase(),
        start: match.index,
        end: match.index + match[0].length
      });
    }

    return spans;
  }

  function getAliasAlternatives(token, aliasIndex) {
    return uniqueValues([token].concat(aliasIndex.searchAliases[token] || []));
  }

  function getPhraseAliasAlternatives(token, normalizedQueryText, aliasIndex) {
    var alternatives = [];

    aliasIndex.phraseAliasGroups.forEach(function (group) {
      var matchedTerms = group.filter(function (term) {
        return normalizedQueryText.indexOf(" " + term + " ") !== -1;
      });
      var tokenIsPartOfMatchedTerm = matchedTerms.some(function (term) {
        return tokenizeSearchTerms(term).indexOf(token) !== -1;
      });

      if (tokenIsPartOfMatchedTerm) {
        alternatives = alternatives.concat(group);
      }
    });

    return alternatives;
  }

  function createSearchMatchUnit(token, aliasIndex, normalizedQueryText) {
    return uniqueValues(getAliasAlternatives(token, aliasIndex).concat(
      getPhraseAliasAlternatives(token, normalizedQueryText, aliasIndex)
    )).map(function (term) {
      return {
        term: term,
        tokens: tokenizeSearchTerms(term)
      };
    }).filter(function (alternative) {
      return alternative.tokens.length > 0;
    });
  }

  function addCombinationPhrases(phraseSet, prefix, alternativesByToken, position, maxPhrases) {
    if (Object.keys(phraseSet).length >= maxPhrases) {
      return;
    }
    if (position >= alternativesByToken.length) {
      phraseSet[prefix.join(" ")] = true;
      return;
    }

    alternativesByToken[position].forEach(function (alternative) {
      if (Object.keys(phraseSet).length >= maxPhrases) {
        return;
      }
      addCombinationPhrases(phraseSet, prefix.concat(alternative), alternativesByToken, position + 1, maxPhrases);
    });
  }

  function buildHighlightModel(query, aliasIndex, options) {
    var settings = options || {};
    var safeAliasIndex = aliasIndex || createSearchAliasIndex({});
    var maxWindowLength = settings.maxWindowLength || 4;
    var maxPhrases = settings.maxPhrases || 100;
    var tokens = tokenizeSearchTerms(query);
    var normalizedQueryText = " " + tokens.join(" ") + " ";
    var phraseSet = {};
    var literalSet = {};

    safeAliasIndex.phraseAliasGroups.forEach(function (group) {
      var hasMatch = group.some(function (term) {
        return normalizedQueryText.indexOf(" " + term + " ") !== -1;
      });

      if (!hasMatch) {
        return;
      }

      group.forEach(function (term) {
        if (tokenizeSearchTerms(term).length > 1) {
          phraseSet[term] = true;
        }
      });
    });

    for (var start = 0; start < tokens.length; start++) {
      for (var length = 2; length <= maxWindowLength && start + length <= tokens.length; length++) {
        var windowTokens = tokens.slice(start, start + length);
        var alternativesByToken = windowTokens.map(function (token) {
          return getAliasAlternatives(token, safeAliasIndex);
        });
        var hasAliasExpansion = alternativesByToken.some(function (alternatives) {
          return alternatives.length > 1;
        });

        if (!hasAliasExpansion) {
          continue;
        }

        addCombinationPhrases(phraseSet, [], alternativesByToken, 0, maxPhrases);
      }
    }

    tokens.forEach(function (token) {
      if (token.length <= 1) {
        return;
      }

      createSearchMatchUnit(token, safeAliasIndex, normalizedQueryText).forEach(function (alternative) {
        if (alternative.tokens.length === 1) {
          literalSet[alternative.tokens[0]] = true;
        } else {
          phraseSet[alternative.tokens.join(" ")] = true;
        }
      });
    });

    return {
      literalTokens: Object.keys(literalSet),
      phraseCandidates: Object.keys(phraseSet).sort(function (a, b) {
        return b.length - a.length;
      })
    };
  }

  function collectPhraseMatches(text, phraseCandidates) {
    var matches = [];
    var textTokens = getTextTokenSpans(text);

    phraseCandidates.forEach(function (phrase) {
      var phraseTokens = tokenizeSearchTerms(phrase);
      if (phraseTokens.length < 2 || phraseTokens.length > textTokens.length) {
        return;
      }

      for (var i = 0; i <= textTokens.length - phraseTokens.length; i++) {
        var hasMatch = true;
        for (var j = 0; j < phraseTokens.length; j++) {
          if (textTokens[i + j].token !== phraseTokens[j]) {
            hasMatch = false;
            break;
          }
        }

        if (hasMatch) {
          matches.push({
            start: textTokens[i].start,
            end: textTokens[i + phraseTokens.length - 1].end
          });
        }
      }
    });

    return matches;
  }

  function collectLiteralMatches(text, literalTokens) {
    var textTokens = getTextTokenSpans(text);
    var matches = [];

    literalTokens.forEach(function (token) {
      textTokens.forEach(function (textToken) {
        if (textToken.token.indexOf(token) === 0) {
          matches.push({
            start: textToken.start,
            end: textToken.start + token.length
          });
        }
      });
    });

    return matches;
  }

  function mergeHighlightSpans(matches) {
    matches.sort(function (a, b) {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      return b.end - a.end;
    });

    var merged = [];
    matches.forEach(function (match) {
      var last = merged[merged.length - 1];
      if (!last || match.start > last.end) {
        merged.push({ start: match.start, end: match.end });
        return;
      }
      if (match.end > last.end) {
        last.end = match.end;
      }
    });

    return merged;
  }

  function getHighlightSpans(text, highlightModel) {
    var value = text || "";
    var model = highlightModel || {};
    var matches = collectPhraseMatches(value, model.phraseCandidates || [])
      .concat(collectLiteralMatches(value, model.literalTokens || []));

    return mergeHighlightSpans(matches);
  }

  function getHighlightedTerms(text, highlightModel) {
    var value = text || "";
    var terms = {};

    getHighlightSpans(value, highlightModel).forEach(function (match) {
      var term = normalize(value.slice(match.start, match.end));
      if (term) {
        terms[term] = true;
      }
    });

    return terms;
  }

  function hasUnrepresentedHighlightMatch(sourceText, visibleText, highlightModel) {
    var sourceTerms = getHighlightedTerms(sourceText, highlightModel);
    var visibleTerms = getHighlightedTerms(visibleText, highlightModel);

    return Object.keys(sourceTerms).some(function (term) {
      return !visibleTerms[term];
    });
  }

  function createSearchMatchModel(query, aliasIndex, options) {
    var safeAliasIndex = aliasIndex || createSearchAliasIndex({});
    var normalizedQuery = normalizeBibleReferenceQuery(query);
    var tokens = tokenizeSearchTerms(normalizedQuery);
    var normalizedQueryText = " " + tokens.join(" ") + " ";

    return {
      query: normalizedQuery,
      tokens: tokens,
      units: tokens.map(function (token) {
        return createSearchMatchUnit(token, safeAliasIndex, normalizedQueryText);
      }),
      highlightModel: buildHighlightModel(normalizedQuery, safeAliasIndex, options)
    };
  }

  function alternativeMatchesText(textTokens, alternative) {
    var alternativeTokens = alternative.tokens;

    if (alternativeTokens.length === 1) {
      return textTokens.some(function (textToken) {
        return textToken.token.indexOf(alternativeTokens[0]) === 0;
      });
    }

    for (var start = 0; start <= textTokens.length - alternativeTokens.length; start++) {
      var hasMatch = true;
      for (var i = 0; i < alternativeTokens.length; i++) {
        if (textTokens[start + i].token.indexOf(alternativeTokens[i]) !== 0) {
          hasMatch = false;
          break;
        }
      }
      if (hasMatch) {
        return true;
      }
    }

    return false;
  }

  function matchesSearchText(text, matchModel) {
    var model = matchModel || {};
    var units = model.units || [];
    var textTokens;

    if (!units.length) {
      return true;
    }

    textTokens = getTextTokenSpans(text);
    return units.every(function (unit) {
      return unit.some(function (alternative) {
        return alternativeMatchesText(textTokens, alternative);
      });
    });
  }

  function createMiniSearchOptions() {
    return {
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
        fuzzy: false
      }
    };
  }

  return {
    normalize: normalize,
    tokenize: tokenize,
    tokenizeSearchTerms: tokenizeSearchTerms,
    normalizeSearchPhrase: normalizeSearchPhrase,
    normalizeBibleReferenceQuery: normalizeBibleReferenceQuery,
    readSearchAliasConfig: readSearchAliasConfig,
    createSearchAliasIndex: createSearchAliasIndex,
    getSearchAliases: getSearchAliases,
    buildHighlightModel: buildHighlightModel,
    getHighlightSpans: getHighlightSpans,
    hasUnrepresentedHighlightMatch: hasUnrepresentedHighlightMatch,
    createSearchMatchModel: createSearchMatchModel,
    matchesSearchText: matchesSearchText,
    createMiniSearchOptions: createMiniSearchOptions
  };
}));
