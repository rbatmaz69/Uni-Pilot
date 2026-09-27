import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionKeyDownProps } from '@tiptap/suggestion';
import {
  filterSlashCommands,
  runSlashCommand,
  type SlashCommand,
} from '@/features/documents/lib/blockTypes';

/** What the `/` menu shows while it is open. */
export interface SlashMenuState {
  query: string;
  items: SlashCommand[];
  range: Range;
  /** Where the typed `/query` is on screen, to place the menu under it. */
  anchor: () => DOMRect | null;
  choose: (command: SlashCommand) => void;
}

export interface SlashCommandOptions {
  /** Called with the menu's state as the query changes, and with `null` when it closes. */
  onChange: (state: SlashMenuState | null) => void;
}

/** Set by the components that draw the menu and own the file picker. */
export interface SlashCommandStorage {
  /** The open menu handles ↑ ↓ Enter; returns whether it used the key. */
  keyHandler: (event: KeyboardEvent) => boolean;
  /** Opens the image picker for the Image command. */
  pickImage: () => void;
}

declare module '@tiptap/core' {
  interface Storage {
    slashCommand: SlashCommandStorage;
  }
}

export const slashCommandKey = new PluginKey('slashCommand');

/** Lets the open menu answer ↑ ↓ Enter and Tab; returns the unregister function. */
export function registerSlashKeys(editor: Editor, handler: SlashCommandStorage['keyHandler']) {
  const storage = editor.storage.slashCommand;
  storage.keyHandler = handler;
  return () => {
    if (storage.keyHandler === handler) storage.keyHandler = () => false;
  };
}

/** Lets the Image command open the host's file picker; returns the unregister function. */
export function registerImagePicker(editor: Editor, pick: () => void) {
  const storage = editor.storage.slashCommand;
  storage.pickImage = pick;
  return () => {
    if (storage.pickImage === pick) storage.pickImage = () => undefined;
  };
}

/**
 * Opens the block menu when `/` is typed at the start of a line or after a
 * space, so "and/or" and URLs never trigger it. The typed `/query` stays
 * ordinary text until a command replaces it, so dismissing the menu keeps it.
 */
export const SlashCommandExtension = Extension.create<SlashCommandOptions, SlashCommandStorage>({
  name: 'slashCommand',
  addOptions() {
    return { onChange: () => undefined };
  },
  addStorage() {
    return { keyHandler: () => false, pickImage: () => undefined };
  },
  addProseMirrorPlugins() {
    const { options, storage } = this;
    return [
      Suggestion<SlashCommand, SlashCommand>({
        editor: this.editor,
        pluginKey: slashCommandKey,
        char: '/',
        allowedPrefixes: [' '],
        // Code keeps its slashes: `//` comments, paths, `a / b`.
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => filterSlashCommands(query),
        command: ({ editor, range, props }) =>
          runSlashCommand(editor, range, props, () => storage.pickImage()),
        render: () => {
          const publish = (props: {
            query: string;
            items: SlashCommand[];
            range: Range;
            clientRect?: (() => DOMRect | null) | null;
            command: (command: SlashCommand) => void;
          }) =>
            options.onChange({
              query: props.query,
              items: props.items,
              range: props.range,
              anchor: () => props.clientRect?.() ?? null,
              choose: props.command,
            });
          return {
            onStart: publish,
            onUpdate: publish,
            onExit: () => options.onChange(null),
            onKeyDown: ({ event }: SuggestionKeyDownProps) => storage.keyHandler(event),
          };
        },
      }),
    ];
  },
});
