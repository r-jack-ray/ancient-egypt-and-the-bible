import { fuzzy } from "fast-fuzzy";

import type { ParsedQuestionTable } from "./table-analysis.js";
import MarkdownIt = require("markdown-it");

export type MechanicalWordingCell = "question" | "shortAnswer" | "expandedAnswer";
export type MechanicalWordingConfidence = "high" | "review";

export interface MechanicalWordingFinding {
  file: string;
  lineNumber: number;
  cell: MechanicalWordingCell;
  ruleId: string;
  confidence: MechanicalWordingConfidence;
  match: string;
  excerpt: string;
  guidance: string;
  characterStart: number;
  similarity?: number;
  referencePhrase?: string;
}

export interface MechanicalWordingOptions {
  includeReview?: boolean;
  includeFuzzy?: boolean;
  fuzzyThreshold?: number;
}

interface MechanicalWordingRule {
  id: string;
  confidence: MechanicalWordingConfidence;
  cells: readonly MechanicalWordingCell[];
  pattern: RegExp;
  captureGroup: string | null;
  guidance: string;
}

interface FuzzyPhrase {
  phrase: string;
  cells: readonly MechanicalWordingCell[];
}

interface LocatedFinding {
  finding: MechanicalWordingFinding;
  start: number;
  end: number;
}

interface WordToken {
  value: string;
  start: number;
  end: number;
}

const allCells: readonly MechanicalWordingCell[] = ["question", "shortAnswer", "expandedAnswer"];
const answerCells: readonly MechanicalWordingCell[] = ["shortAnswer", "expandedAnswer"];
const markdown = new MarkdownIt({html: true, linkify: false, typographer: false});

const deterministicRules: readonly MechanicalWordingRule[] = [
  {
    id: "transcript-position-reference",
    confidence: "high",
    cells: allCells,
    pattern: /\b(?:(?:earlier|later|elsewhere|previously|above|below)\s+(?:in|from|within)\s+(?:the|this)\s+transcript|(?:in|from|within)\s+(?:the|this)\s+transcript\s+(?:earlier|later|elsewhere|previously|above|below))\b/giu,
    captureGroup: null,
    guidance: "Remove transcript-position navigation and state the supported answer directly.",
  },
  {
    id: "transcript-rendering-reference",
    confidence: "high",
    cells: allCells,
    pattern: /\b(?:rendered|recorded|preserved|transcribed)\s+in\s+(?:the|this)\s+transcript\b/giu,
    captureGroup: null,
    guidance: "Use the intended wording only when the source supports it; otherwise preserve the uncertainty.",
  },
  {
    id: "conversation-position-reference",
    confidence: "high",
    cells: allCells,
    pattern: /\b(?:earlier|later|elsewhere|previously|above|below)\s+(?:in|from|within)\s+(?:the|this)\s+(?:discussion|exchange|answer|response|reply)\b/giu,
    captureGroup: null,
    guidance: "Remove navigation within the discussion or exchange and state the supported information directly.",
  },
  {
    id: "transcript-authority-frame",
    confidence: "high",
    cells: allCells,
    pattern: /\baccording\s+to\s+(?:the|this)\s+transcript\b/giu,
    captureGroup: null,
    guidance: "State the transcript-grounded answer directly instead of presenting the transcript as an authority.",
  },
  {
    id: "transcript-reporting-frame",
    confidence: "high",
    cells: allCells,
    pattern: /\b(?:the|this)\s+transcript\s+(?:says?|states?|notes?|records?|reads?|renders?|describes?|mentions?|shows?|identifies?|explains?|indicates?)\b/giu,
    captureGroup: null,
    guidance: "Rewrite as a direct answer when possible; keep explicit source limits when the exchange does not answer the question.",
  },
  {
    id: "answer-reporting-frame",
    confidence: "high",
    cells: answerCells,
    pattern: /\b(?:the|this)\s+(?:answer|response|reply)\s+(?:says?|states?|notes?|records?|reports?|explains?|describes?|mentions?|shows?|identifies?|indicates?|confirms?)\b/giu,
    captureGroup: null,
    guidance: "Replace commentary about the answer, response, or reply with a direct answer, not a passive synonym such as 'is described'; retain uncertainty about what was established.",
  },
  {
    id: "question-reporting-frame",
    confidence: "review",
    cells: answerCells,
    pattern: /\b(?:the|this)\s+question\s+(?:asks?|is\s+asking|says?|states?|mentions?)\b/giu,
    captureGroup: null,
    guidance: "Remove question-reporting commentary unless it is needed to explain a mismatch between the question and the available answer.",
  },
  {
    id: "routine-attribution-opening",
    confidence: "review",
    cells: answerCells,
    pattern: /(?:^|[.!?]\s+)(?<phrase>(?:he|the\s+host|(?:dr\.?\s+)?falk)\s+(?:said|says|explained|explains|described|describes|noted|notes|observed|observes|stated|states))\b/giu,
    captureGroup: "phrase",
    guidance: "Remove only routine reporting frames, and do not convert them mechanically to passive voice. Preserve attribution when it carries interpretation, uncertainty, disagreement, opinion, preference, or personal experience.",
  },
  {
    id: "subjectless-personal-verb-after-yes-no",
    confidence: "high",
    cells: answerCells,
    pattern: /^(?<phrase>(?:yes|no),\s+(?:once|twice|three\s+times|several\s+times|many\s+times|often|occasionally|rarely|never)\b[^.!?]{0,60},\s+and\s+(?:recommends?|prefers?|argues?|believes?|thinks?|says?|describes?|explains?))\b/giu,
    captureGroup: "phrase",
    guidance: "Restore the missing person or subject so the answer is a complete grammatical sentence.",
  },
];

const fuzzyGuidance =
    "Inspect the source before editing this possible variant; remove mechanical navigation without deleting uncertainty or meaningful attribution.";

const fuzzyPhrases: readonly FuzzyPhrase[] = [
  {phrase: "earlier in the transcript", cells: allCells},
  {phrase: "later in the transcript", cells: allCells},
  {phrase: "elsewhere in the transcript", cells: allCells},
  {phrase: "rendered in the transcript", cells: allCells},
  {phrase: "recorded in the transcript", cells: allCells},
  {phrase: "according to the transcript", cells: allCells},
];

export function visibleMarkdownText(value: string): string {
  const tokens = markdown.parseInline(value, {});
  const parts: string[] = [];
  for (const token of tokens) {
    appendVisibleTokenText(token, parts);
  }
  return parts.join("").replace(/\s+/gu, " ").trim();
}

export function scanQuestionTableMechanicalWording(
    table: ParsedQuestionTable,
    options: MechanicalWordingOptions = {},
): MechanicalWordingFinding[] {
  const includeFuzzy = options.includeFuzzy ?? false;
  const includeReview = options.includeReview ?? includeFuzzy;
  const fuzzyThreshold = options.fuzzyThreshold ?? 0.9;
  if (fuzzyThreshold < 0 || fuzzyThreshold > 1) {
    throw new Error("fuzzyThreshold must be between 0 and 1.");
  }

  const findings: MechanicalWordingFinding[] = [];
  for (const row of table.rows) {
    const cells: Array<[MechanicalWordingCell, string]> = [
      ["question", row.question],
      ["shortAnswer", row.shortAnswer],
    ];
    if (row.expandedAnswer !== null) {
      cells.push(["expandedAnswer", row.expandedAnswer]);
    }

    for (const [cell, value] of cells) {
      const text = visibleMarkdownText(value);
      findings.push(...scanCell(
          table.file,
          row.lineNumber,
          cell,
          text,
          includeReview,
          includeFuzzy,
          fuzzyThreshold,
      ));
    }
  }

  return findings.sort(compareFindings);
}

function scanCell(
    file: string,
    lineNumber: number,
    cell: MechanicalWordingCell,
    text: string,
    includeReview: boolean,
    includeFuzzy: boolean,
    fuzzyThreshold: number,
): MechanicalWordingFinding[] {
  const located: LocatedFinding[] = [];
  for (const rule of deterministicRules) {
    if (!rule.cells.includes(cell) || (!includeReview && rule.confidence === "review")) {
      continue;
    }
    for (const match of text.matchAll(rule.pattern)) {
      const phrase = rule.captureGroup === null
          ? match[0]
          : match.groups?.[rule.captureGroup];
      if (phrase === undefined) {
        continue;
      }
      const phraseOffset = match[0].lastIndexOf(phrase);
      const start = match.index + Math.max(phraseOffset, 0);
      located.push({
        finding: baseFinding(
            file,
            lineNumber,
            cell,
            rule.id,
            rule.confidence,
            phrase,
            text,
            start,
            rule.guidance,
        ),
        start,
        end: start + phrase.length,
      });
    }
  }

  if (includeReview && includeFuzzy) {
    located.push(...fuzzyFindings(file, lineNumber, cell, text, fuzzyThreshold, located));
  }
  return located.map((item) => item.finding);
}

function fuzzyFindings(
    file: string,
    lineNumber: number,
    cell: MechanicalWordingCell,
    text: string,
    threshold: number,
    deterministic: readonly LocatedFinding[],
): LocatedFinding[] {
  const words = wordTokens(text);
  const transcriptWordIndexes = words.flatMap((word, index) =>
      resemblesTranscript(word.value) ? [index] : []
  );
  const candidates: LocatedFinding[] = [];
  for (const reference of fuzzyPhrases) {
    if (!reference.cells.includes(cell)) {
      continue;
    }
    const referenceWordCount = wordTokens(reference.phrase).length;
    for (const transcriptWordIndex of transcriptWordIndexes) {
      const index = transcriptWordIndex - referenceWordCount + 1;
      if (index < 0) {
        continue;
      }
      const first = words[index];
      const last = words[transcriptWordIndex];
      if (first === undefined || last === undefined) {
        continue;
      }
      const candidate = text.slice(first.start, last.end);
      if (candidate.toLocaleLowerCase() === reference.phrase.toLocaleLowerCase()) {
        continue;
      }
      const score = fuzzy(reference.phrase, candidate, {
        ignoreCase: true,
        ignoreSymbols: true,
        normalizeWhitespace: true,
        useSellers: false,
      });
      if (score < threshold || overlaps(first.start, last.end, deterministic)) {
        continue;
      }
      candidates.push({
        finding: {
          ...baseFinding(
              file,
              lineNumber,
              cell,
              "possible-mechanical-phrase-variant",
              "review",
              candidate,
              text,
              first.start,
              fuzzyGuidance,
          ),
          similarity: roundedScore(score),
          referencePhrase: reference.phrase,
        },
        start: first.start,
        end: last.end,
      });
    }
  }

  candidates.sort((left, right) =>
      (right.finding.similarity ?? 0) - (left.finding.similarity ?? 0)
      || left.start - right.start
  );
  const selected: LocatedFinding[] = [];
  for (const candidate of candidates) {
    if (!overlaps(candidate.start, candidate.end, selected)) {
      selected.push(candidate);
    }
  }
  return selected;
}

function resemblesTranscript(value: string): boolean {
  const normalized = value.toLocaleLowerCase();
  if (!normalized.startsWith("t") || Math.abs(normalized.length - "transcript".length) > 3) {
    return false;
  }
  return fuzzy("transcript", normalized, {
    ignoreCase: true,
    ignoreSymbols: true,
    normalizeWhitespace: true,
    useSellers: false,
  }) >= 0.7;
}

function baseFinding(
    file: string,
    lineNumber: number,
    cell: MechanicalWordingCell,
    ruleId: string,
    confidence: MechanicalWordingConfidence,
    match: string,
    text: string,
    characterStart: number,
    guidance: string,
): MechanicalWordingFinding {
  return {
    file,
    lineNumber,
    cell,
    ruleId,
    confidence,
    match,
    excerpt: excerptAround(text, characterStart, match.length),
    guidance,
    characterStart,
  };
}

function appendVisibleTokenText(
    token: ReturnType<typeof markdown.parseInline>[number],
    parts: string[],
): void {
  if (token.children !== null) {
    for (const child of token.children) {
      appendVisibleTokenText(child, parts);
    }
    return;
  }
  if (["text", "code_inline", "image"].includes(token.type)) {
    parts.push(token.content);
  } else if (["softbreak", "hardbreak"].includes(token.type)) {
    parts.push(" ");
  } else if (token.type === "html_inline" && /^<br\s*\/?\s*>$/iu.test(token.content)) {
    parts.push(" ");
  }
}

function wordTokens(text: string): WordToken[] {
  const result: WordToken[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)) {
    result.push({value: match[0], start: match.index, end: match.index + match[0].length});
  }
  return result;
}

function overlaps(start: number, end: number, findings: readonly LocatedFinding[]): boolean {
  return findings.some((finding) => start < finding.end && end > finding.start);
}

function excerptAround(text: string, start: number, length: number): string {
  const radius = 70;
  const from = Math.max(0, start - radius);
  const to = Math.min(text.length, start + length + radius);
  const prefix = from > 0 ? "..." : "";
  const suffix = to < text.length ? "..." : "";
  return `${prefix}${text.slice(from, to).trim()}${suffix}`;
}

function roundedScore(score: number): number {
  return Math.round(score * 1_000) / 1_000;
}

function compareFindings(left: MechanicalWordingFinding, right: MechanicalWordingFinding): number {
  const cellOrder: Record<MechanicalWordingCell, number> = {
    question: 0,
    shortAnswer: 1,
    expandedAnswer: 2,
  };
  return left.file.localeCompare(right.file)
      || left.lineNumber - right.lineNumber
      || cellOrder[left.cell] - cellOrder[right.cell]
      || left.characterStart - right.characterStart
      || left.ruleId.localeCompare(right.ruleId);
}
