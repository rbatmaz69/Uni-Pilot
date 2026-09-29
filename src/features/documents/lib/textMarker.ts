import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/**
 * The Textmarker reads each sentence of a note and marks it by the role it
 * plays: a definition, a fact, a claim, an opinion or a qualification. It is
 * worked out on this device from wording cues in English and German, so it is
 * a reading aid, not a verdict, and it only ever adds decorations: the note,
 * its Markdown and its undo history stay as they are.
 */
export type SentenceKind = 'definition' | 'fact' | 'claim' | 'opinion' | 'qualification';

export const SENTENCE_KINDS: { kind: SentenceKind; label: string; hint: string }[] = [
  { kind: 'definition', label: 'Definition', hint: 'Says what a term means' },
  { kind: 'fact', label: 'Fact', hint: 'Numbers, dates and sources' },
  { kind: 'claim', label: 'Claim', hint: 'Asserts something that needs support' },
  { kind: 'opinion', label: 'Opinion', hint: 'A view or a judgement' },
  { kind: 'qualification', label: 'Qualification', hint: 'Hedges, limits and contrasts' },
];

/** Characters of the note per role; `plain` is text without a clear cue. */
export type MarkerTally = Record<SentenceKind | 'plain', number>;

export interface TextSpan {
  from: number;
  to: number;
}

// ---------------------------------------------------------------------------
// Sentences

const TERMINATOR = /[.!?…‽]/u;
const CLOSER = /["'”’»)\]]/u;
const SPACE = /\s/u;
const LOWERCASE = /\p{Ll}/u;
const LETTER_OR_DOT = /[\p{L}.]/u;
const DIGIT = /\d/u;
/** Abbreviations whose period does not end a sentence, written without their dots. */
const ABBREVIATIONS = new Set(
  // English
  (
    'eg ie vs cf approx ca fig figs eq dr prof mr mrs ms st jr sr vol pp ch sec al resp incl ' +
    'esp dept ' +
    // German
    'zb bzw vgl usw ua dh abb kap bspw sog ggf evtl inkl bzgl lt gem nr str hr fr jh jhd mio ' +
    'mrd tsd uu oä uä zt idr ia allg insb chr'
  ).split(' '),
);

/** Whether the period at `index` is part of an abbreviation, an initial or an ordinal. */
function shortensWord(text: string, index: number): boolean {
  let start = index;
  while (start > 0 && LETTER_OR_DOT.test(text.charAt(start - 1))) start -= 1;
  const word = text.slice(start, index).replace(/\./g, '').toLowerCase();
  if (word) return word.length === 1 || ABBREVIATIONS.has(word);
  // "am 3. Mai": a day or an ordinal, not the end of a sentence.
  let digits = 0;
  while (index - digits > 0 && DIGIT.test(text.charAt(index - digits - 1))) digits += 1;
  return digits > 0 && digits <= 2;
}

/**
 * Splits text into sentences, trimmed of the space around them. A line break
 * always ends one; `.` `!` `?` and `…` do unless lowercase text follows, and a
 * period does not after an abbreviation (`z. B.`, `e.g.`), an initial or `3.`.
 */
export function splitSentences(text: string): TextSpan[] {
  const sentences: TextSpan[] = [];
  let start = 0;
  const close = (end: number) => {
    let from = start;
    let to = end;
    while (from < to && SPACE.test(text.charAt(from))) from += 1;
    while (to > from && SPACE.test(text.charAt(to - 1))) to -= 1;
    if (to > from) sentences.push({ from, to });
    start = end;
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (character === '\n') {
      close(index);
      continue;
    }
    if (!TERMINATOR.test(character)) continue;
    let end = index + 1;
    while (TERMINATOR.test(text.charAt(end)) || CLOSER.test(text.charAt(end))) end += 1;
    const lone = !TERMINATOR.test(text.charAt(index + 1));
    let next = end;
    while (next < text.length && SPACE.test(text.charAt(next)) && text.charAt(next) !== '\n')
      next += 1;
    const ends =
      // `3.5` or `www.example.org`: the run is followed by more of the word.
      (end === text.length || SPACE.test(text.charAt(end))) &&
      !LOWERCASE.test(text.charAt(next)) &&
      !(character === '.' && lone && shortensWord(text, index));
    if (ends) close(end);
    index = end - 1;
  }
  close(text.length);
  return sentences;
}

// ---------------------------------------------------------------------------
// Roles

interface Cue {
  weight: number;
  pattern: RegExp;
}

// `\b` only knows ASCII letters, so `\bäußerst` would never match.
const WORD_START = '(?<![\\p{L}\\p{N}])';
const WORD_END = '(?![\\p{L}\\p{N}])';

/** `|`-separated phrases as one pattern; a space in a phrase stands for any run of space. */
function alternatives(phrases: string) {
  return phrases.replace(/ /g, '\\s+');
}

/** Whole words or phrases anywhere in the sentence. */
function words(weight: number, phrases: string): Cue {
  return {
    weight,
    pattern: new RegExp(`${WORD_START}(?:${alternatives(phrases)})${WORD_END}`, 'iu'),
  };
}

/** Words that must open the sentence, like "However," or "Jedoch". */
function opening(weight: number, phrases: string): Cue {
  return { weight, pattern: new RegExp(`^(?:${alternatives(phrases)})${WORD_END}`, 'iu') };
}

/** Stands for a footnote reference, which cites a source. */
export const SOURCE_MARK = String.fromCodePoint(0x2020);
/** Stands for any other inline object, such as a formula. */
const OBJECT_MARK = String.fromCodePoint(0xfffc);

const MONTHS =
  'january|february|march|april|june|july|august|september|october|november|december|' +
  'januar|februar|märz|mai|juni|juli|oktober|dezember';
const UNITS =
  '%|‰|°|€|\\$|percent|per cent|prozent|km|kg|cm|mm|ml|min|ms|eur|euro|usd|mio|mrd|' +
  'millions?|billions?|millionen|milliarden?';

/** Wording cues per role; the role with the highest total wins. */
const CUES: Record<SentenceKind, Cue[]> = {
  definition: [
    words(
      4,
      'is defined as|are defined as|(?:is|are) (?:called|termed|known as|referred to as)|' +
        'refers? to|(?:is|are) a (?:term|name|word) for|denotes|' +
        '(?:ist|sind) (?:definiert|festgelegt) als|' +
        '(?:wird|werden) [^.;]{0,40}(?:definiert|bezeichnet)|' +
        'bezeichnet man|versteht man|nennt man|spricht man von',
    ),
    // "Entropy: a measure of disorder", the way notes define a term.
    { weight: 3, pattern: /^\p{L}[\p{L}\p{N} ()/-]{0,38}:\s+\S/u },
    // "A stack is a data structure that …"
    {
      weight: 3,
      pattern:
        /^(?:(?:an?|the) )?[\p{L}\p{N}-]+(?: [\p{L}\p{N}-]+){0,3} (?:is|are) (?:an?|the) [^,.;]{1,60}?,? (?:that|which|who|where|used to|in which|consisting of)(?![\p{L}\p{N}])/iu,
    },
    // "Ein Stack ist eine Datenstruktur, die …"
    {
      weight: 3,
      pattern:
        /^(?:(?:ein|eine|der|die|das) )?[\p{L}\p{N}-]+(?: [\p{L}\p{N}-]+){0,3} (?:ist|sind) (?:ein|eine|einer|der|die|das) [^.;]{1,60}?,? (?:die|der|das|welche[rsm]?|bei (?:dem|der)|mit (?:dem|der)|in (?:dem|der))(?![\p{L}\p{N}])/iu,
    },
  ],
  fact: [
    // A quantity: "42 %", "3.5 kg", "12 Mio."
    { weight: 3, pattern: new RegExp(`\\d(?:[.,]\\d+)?\\s?(?:${UNITS})(?!\\p{L})`, 'iu') },
    // A year, a date or a month.
    { weight: 2, pattern: /(?<![\p{N}.,])(?:1[5-9]|20)\d{2}(?!\p{N}|[.,]\d)/u },
    { weight: 2, pattern: /\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4}/u },
    words(2, MONTHS),
    // A source: "(Smith, 2020)", "(Müller 2019, S. 12)", "[12]", or a footnote.
    {
      weight: 3,
      pattern: /\([^()]*\d{4}[a-z]?(?:,? (?:p|pp|s)\.\s?\d+)?\)|\[\d+(?:[,–-]\s?\d+)*\]/iu,
    },
    { weight: 3, pattern: new RegExp(SOURCE_MARK, 'u') },
    words(
      3,
      'according to|source|' +
        '(?:studies|research|data|surveys?|experiments?) ' +
        '(?:shows?|found|finds|suggests?|indicates?|confirms?)|' +
        'laut|gemäß|zufolge|nach angaben|quelle|' +
        '(?:studien|untersuchungen|daten|umfragen) (?:zeigen|belegen|ergaben|ergeben)',
    ),
    words(
      2,
      'was (?:founded|born|built|published|invented|discovered|signed)|took place|measured|' +
        'amounts? to|consists? of|' +
        'wurde (?:gegründet|geboren|gebaut|veröffentlicht|erfunden|entdeckt|unterzeichnet)|' +
        'fand statt|beträgt|besteht aus',
    ),
  ],
  claim: [
    words(
      2,
      'always|never|all|every|everyone|everything|nobody|no one|none|' +
        'immer|nie|niemals|alle|jede[rsnm]?|niemand',
    ),
    words(
      2,
      "must|cannot|can't|clearly|obviously|undoubtedly|certainly|definitely|of course|proves?|" +
        'muss|müssen|zweifellos|eindeutig|offensichtlich|natürlich|sicherlich|beweist',
    ),
    words(
      2,
      'leads? to|causes?|results? in|because|due to|therefore|thus|hence|consequently|' +
        'shows? that|means that|' +
        'führt zu|führen zu|verursacht|bewirkt|weil|deshalb|daher|deswegen|somit|folglich|' +
        'zeigt, dass|bedeutet, dass',
    ),
    words(
      1,
      'the most|the best|the worst|the only|key|essential|crucial|fundamental|' +
        'am wichtigsten|wichtigste[rsnm]?|entscheidend|wesentlich|grundlegend|einzige[rsnm]?',
    ),
  ],
  opinion: [
    words(
      3,
      "i (?:think|believe|feel|find|guess|suppose|reckon)|i(?:'d| would) (?:argue|say)|" +
        'in my (?:opinion|view)|for me|personally|' +
        'ich (?:denke|finde|glaube|meine|halte)|meiner meinung nach|meines erachtens|' +
        'm\\.\\s?e\\.|für mich|persönlich|mir (?:gefällt|scheint)',
    ),
    words(2, 'should|ought to|we need to|sollten?|wir müssen'),
    words(
      1,
      'good|bad|great|terrible|awful|excellent|wonderful|boring|interesting|fascinating|' +
        'beautiful|amazing|exceptional|brilliant|better|worse|overrated|underrated|' +
        'unfortunately|fortunately|sadly|luckily|surprisingly|honestly|frankly|love|hate|' +
        'gut|schlecht|toll|schrecklich|furchtbar|langweilig|spannend|interessant|faszinierend|' +
        'schön|besser|schlechter|leider|zum glück|glücklicherweise|erstaunlich(?:erweise)?|' +
        'überraschend(?:erweise)?|ehrlich gesagt',
    ),
    { weight: 1, pattern: /!["'”’»)]*$/u },
  ],
  qualification: [
    opening(
      3,
      'however|but|yet|although|though|while|whereas|nevertheless|nonetheless|still|despite|' +
        'on the other hand|in contrast|' +
        'jedoch|aber|allerdings|obwohl|obgleich|trotzdem|dennoch|hingegen|andererseits|' +
        'während|wohingegen|zwar',
    ),
    words(
      2,
      'however|although|though|whereas|nevertheless|despite|unless|except|' +
        'jedoch|allerdings|obwohl|trotzdem|dennoch|hingegen|es sei denn|außer|zwar',
    ),
    words(
      2,
      'may|might|could|perhaps|possibly|probably|likely|unlikely|seems?|appears? to|' +
        'suggests?|tends? to|arguably|presumably|apparently|to some extent|in some cases|' +
        'partly|partially|somewhat|' +
        'vielleicht|möglicherweise|vermutlich|wahrscheinlich|eventuell|evtl\\.|scheint|' +
        'scheinen|könnten?|dürften?|teilweise|bedingt|gewissermaßen|tendenziell|' +
        'unter umständen|eher',
    ),
    words(
      1,
      'but|aber|often|sometimes|usually|typically|generally|mostly|in most cases|' +
        'oft|häufig|manchmal|meist(?:ens)?|in der regel|normalerweise|überwiegend|größtenteils',
    ),
  ],
};

/** On a tie the more careful reading wins: a hedged sweeping statement is qualified. */
const TIE_ORDER: SentenceKind[] = ['definition', 'fact', 'qualification', 'opinion', 'claim'];

/**
 * The role a sentence most likely plays, or `null` when nothing in its wording
 * says. Questions ask rather than assert, so they are never marked.
 */
export function classifySentence(sentence: string): SentenceKind | null {
  const text = sentence.trim();
  if (!text || /\?["'”’»)]*$/u.test(text)) return null;
  let best: SentenceKind | null = null;
  let bestScore = 0;
  for (const kind of TIE_ORDER) {
    let score = 0;
    for (const cue of CUES[kind]) if (cue.pattern.test(text)) score += cue.weight;
    if (score > bestScore) {
      best = kind;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Decorations

/** A sentence in a text block; offsets count from the start of the block's content. */
interface MarkedSentence extends TextSpan {
  kind: SentenceKind | null;
  /** Where its first word ends and its last word starts, for the soft edges. */
  headEnd: number;
  tailStart: number;
}

/** Text blocks never change in place, so each one is read once. */
const analyses = new WeakMap<ProseMirrorNode, MarkedSentence[]>();

function analyse(block: ProseMirrorNode): MarkedSentence[] {
  const cached = analyses.get(block);
  if (cached) return cached;
  let text = '';
  // The document positions each character of `text` stands for.
  const starts: number[] = [];
  const ends: number[] = [];
  block.forEach((child, offset) => {
    if (child.isText) {
      const value = child.text ?? '';
      for (let index = 0; index < value.length; index += 1) {
        starts.push(offset + index);
        ends.push(offset + index + 1);
      }
      text += value;
      return;
    }
    text +=
      child.type.name === 'hardBreak'
        ? '\n'
        : child.type.name === 'footnoteReference'
          ? SOURCE_MARK
          : OBJECT_MARK;
    starts.push(offset);
    ends.push(offset + child.nodeSize);
  });
  const sentences = splitSentences(text).map(({ from, to }) => {
    const sentence = text.slice(from, to);
    const firstSpace = sentence.search(/\s/u);
    const lastSpace = sentence.search(/\s\S*$/u);
    const headEnd = firstSpace < 0 ? to : from + firstSpace;
    const tailStart = lastSpace < 0 ? from : from + lastSpace + 1;
    return {
      from: starts[from]!,
      to: ends[to - 1]!,
      kind: classifySentence(sentence),
      headEnd: ends[headEnd - 1]!,
      tailStart: starts[tailStart]!,
    };
  });
  analyses.set(block, sentences);
  return sentences;
}

/** Headings name things and code is not prose, so neither is marked. */
function isProse(block: ProseMirrorNode) {
  return !block.type.spec.code && block.type.name !== 'heading';
}

export function emptyTally(): MarkerTally {
  return { definition: 0, fact: 0, claim: 0, opinion: 0, qualification: 0, plain: 0 };
}

function build(doc: ProseMirrorNode, only: SentenceKind | null) {
  const decorations: Decoration[] = [];
  const tally = emptyTally();
  doc.descendants((node, position) => {
    if (!node.isTextblock) return true;
    if (!isProse(node)) return false;
    const sentences = analyse(node);
    const base = position + 1;
    // A neighbour in the spotlight's shadow does not tint the edge next to it.
    const shown = (sentence: MarkedSentence | undefined) =>
      sentence?.kind && (only === null || sentence.kind === only) ? sentence.kind : null;
    sentences.forEach((sentence, index) => {
      const { from, to, kind } = sentence;
      tally[kind ?? 'plain'] += to - from;
      if (!kind) return;
      const muted = only !== null && kind !== only;
      decorations.push(
        Decoration.inline(base + from, base + to, {
          class: `text-marker is-${kind}${muted ? ' is-muted' : ''}`,
        }),
      );
      if (muted) return;
      // Overlapping inline decorations share one element, joining classes and styles.
      const before = shown(sentences[index - 1]);
      const after = shown(sentences[index + 1]);
      decorations.push(
        Decoration.inline(base + from, base + sentence.headEnd, {
          class: 'is-marker-start',
          ...(before ? { style: `--marker-before: var(--marker-${before})` } : {}),
        }),
        Decoration.inline(base + sentence.tailStart, base + to, {
          class: 'is-marker-end',
          ...(after ? { style: `--marker-after: var(--marker-${after})` } : {}),
        }),
      );
    });
    return false;
  });
  return { decorations: DecorationSet.create(doc, decorations), tally };
}

export interface TextMarkerOptions {
  enabled: boolean;
  /** One role in the spotlight; the others fade back. */
  only: SentenceKind | null;
}

interface TextMarkerState extends TextMarkerOptions {
  decorations: DecorationSet;
  tally: MarkerTally;
}

export const textMarkerKey = new PluginKey<TextMarkerState>('textMarker');

function markerState(doc: ProseMirrorNode, options: TextMarkerOptions): TextMarkerState {
  if (!options.enabled)
    return { ...options, decorations: DecorationSet.empty, tally: emptyTally() };
  return { ...options, ...build(doc, options.only) };
}

/**
 * Colours sentences by their role while the Textmarker is on. Only
 * decorations: the document and the saved Markdown are never touched.
 */
export const TextMarker = Extension.create({
  name: 'textMarker',
  addProseMirrorPlugins() {
    return [
      new Plugin<TextMarkerState>({
        key: textMarkerKey,
        state: {
          init: (_config, state) => markerState(state.doc, { enabled: false, only: null }),
          apply(transaction, previous) {
            const options = transaction.getMeta(textMarkerKey) as TextMarkerOptions | undefined;
            if (options) return markerState(transaction.doc, options);
            if (transaction.docChanged && previous.enabled)
              return markerState(transaction.doc, previous);
            return previous;
          },
        },
        props: {
          decorations: (state) => textMarkerKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});

export function setTextMarker(view: EditorView, options: TextMarkerOptions) {
  const current = textMarkerKey.getState(view.state);
  if (current?.enabled === options.enabled && current.only === options.only) return;
  view.dispatch(view.state.tr.setMeta(textMarkerKey, options).setMeta('addToHistory', false));
}

/** How much of the note plays each role, or `null` while the Textmarker is off. */
export function textMarkerTally(state: EditorState): MarkerTally | null {
  const current = textMarkerKey.getState(state);
  return current?.enabled ? current.tally : null;
}
