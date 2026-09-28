import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const STYLES = [
  { id: 'grid', label: 'Grid' },
  { id: 'soft', label: 'Soft' },
  { id: 'striped', label: 'Striped' },
  { id: 'minimal', label: 'Minimal' },
] as const;
const DENSITIES = [
  { id: 'compact', label: 'Compact' },
  { id: 'normal', label: 'Regular' },
  { id: 'spacious', label: 'Spacious' },
] as const;
const COLORS = [
  { id: 'neutral', label: 'None' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'yellow', label: 'Yellow' },
  { id: 'orange', label: 'Orange' },
  { id: 'pink', label: 'Pink' },
  { id: 'lavender', label: 'Lavender' },
] as const;
const INKS = [
  { id: 'default', label: 'Default' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'rose', label: 'Rose' },
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="note-table-tools-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function TableTools({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const table = current.getAttributes('table');
      const cell = current.getAttributes(
        current.isActive('tableHeader') ? 'tableHeader' : 'tableCell',
      );
      return {
        variant: String(table.variant ?? 'grid'),
        density: String(table.density ?? 'normal'),
        tableTone: String(table.tone ?? 'neutral'),
        cellTone: String(cell.tone ?? 'neutral'),
        ink: String(cell.ink ?? 'default'),
        align: String(cell.align ?? 'left'),
        canMerge: current.can().mergeCells(),
        canSplit: current.can().splitCell(),
      };
    },
  });
  const run = () => editor.chain().focus();
  const setTable = (attributes: Record<string, string>) =>
    run().updateAttributes('table', attributes).run();
  const setCell = (name: string, value: string | null) => run().setCellAttribute(name, value).run();

  return (
    <div className="note-table-tools" aria-label="Table options">
      <div className="note-table-tools-heading">
        <div>
          <span>TABLE</span>
          <strong>Make it yours</strong>
        </div>
        <span className="note-table-tools-hint">Drag column edges to resize</span>
      </div>
      <Section title="Appearance">
        <div className="note-table-style-grid" role="group" aria-label="Table style">
          {STYLES.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              className={cn('note-table-style-option', state.variant === id && 'is-active')}
              aria-label={`${label} table style`}
              aria-pressed={state.variant === id}
              onClick={() => setTable({ variant: id })}
            >
              <span className={cn('note-table-style-preview', `is-${id}`)} aria-hidden>
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="note-table-segmented" role="group" aria-label="Table spacing">
          {DENSITIES.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              aria-pressed={state.density === id}
              className={cn(state.density === id && 'is-active')}
              onClick={() => setTable({ density: id })}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Table accent">
        <div className="note-table-swatches" role="group" aria-label="Table accent color">
          {COLORS.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              className={cn('note-table-swatch', `is-${id}`, state.tableTone === id && 'is-active')}
              aria-label={`${label} table accent`}
              aria-pressed={state.tableTone === id}
              title={label}
              onClick={() => setTable({ tone: id })}
            />
          ))}
        </div>
      </Section>
      <Section title="Selected cell">
        <div className="note-table-swatches" role="group" aria-label="Cell fill color">
          {COLORS.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              className={cn('note-table-swatch', `is-${id}`, state.cellTone === id && 'is-active')}
              aria-label={`${label} cell fill`}
              aria-pressed={state.cellTone === id}
              title={label}
              onClick={() => setCell('tone', id === 'neutral' ? null : id)}
            />
          ))}
        </div>
        <div className="note-table-ink-row">
          <span>Text color</span>
          <div role="group" aria-label="Cell text color">
            {INKS.map(({ id, label }) => (
              <button
                type="button"
                key={id}
                className={cn('note-table-ink', `is-${id}`, state.ink === id && 'is-active')}
                aria-label={`${label} cell text`}
                aria-pressed={state.ink === id}
                title={label}
                onClick={() => setCell('ink', id)}
              >
                A
              </button>
            ))}
          </div>
        </div>
        <div
          className="note-table-segmented note-table-align"
          role="group"
          aria-label="Cell alignment"
        >
          {(
            [
              { id: 'left', label: 'Align left' },
              { id: 'center', label: 'Align center' },
              { id: 'right', label: 'Align right' },
            ] as const
          ).map(({ id, label }) => (
            <button
              type="button"
              key={id}
              aria-label={label}
              aria-pressed={state.align === id}
              className={cn(state.align === id && 'is-active')}
              onClick={() => setCell('align', id)}
            >
              {label.replace('Align ', '')}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Insert rows & columns">
        <div className="note-table-action-grid">
          <button type="button" onClick={() => run().addRowBefore().run()}>
            Row above
          </button>
          <button type="button" onClick={() => run().addRowAfter().run()}>
            Row below
          </button>
          <button type="button" onClick={() => run().addColumnBefore().run()}>
            Column left
          </button>
          <button type="button" onClick={() => run().addColumnAfter().run()}>
            Column right
          </button>
        </div>
      </Section>
      <Section title="Headers & cells">
        <div className="note-table-action-grid">
          <button type="button" onClick={() => run().toggleHeaderRow().run()}>
            Toggle header row
          </button>
          <button type="button" onClick={() => run().toggleHeaderColumn().run()}>
            Toggle header column
          </button>
          <button type="button" disabled={!state.canMerge} onClick={() => run().mergeCells().run()}>
            Merge cells
          </button>
          <button type="button" disabled={!state.canSplit} onClick={() => run().splitCell().run()}>
            Split cell
          </button>
        </div>
      </Section>
      <Section title="Remove">
        <div className="note-table-action-grid">
          <button type="button" onClick={() => run().deleteRow().run()}>
            Delete row
          </button>
          <button type="button" onClick={() => run().deleteColumn().run()}>
            Delete column
          </button>
        </div>
      </Section>
      <button type="button" className="note-table-delete" onClick={() => run().deleteTable().run()}>
        Delete table
      </button>
    </div>
  );
}
