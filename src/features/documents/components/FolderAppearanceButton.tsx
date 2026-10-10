import { useState } from 'react';
import { Palette } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FolderGlyph } from './FolderIcon';
import {
  useFolderAppearance,
  FOLDER_COLORS,
  useFolderAppearanceStore,
} from '../store/folderAppearanceStore';

export function FolderAppearanceButton({ path, name }: { path: string; name: string }) {
  const [open, setOpen] = useState(false);
  const appearance = useFolderAppearance(path, name);
  const setAppearance = useFolderAppearanceStore((state) => state.setAppearance);
  const reset = useFolderAppearanceStore((state) => state.reset);

  return (
    <>
      <button
        type="button"
        className="document-tree-remove folder-appearance-trigger"
        aria-label={`Customize ${name} folder`}
        aria-haspopup="dialog"
        title="Customize folder"
        onClick={() => setOpen(true)}
      >
        <Palette size={13} aria-hidden />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Folder appearance"
        description="Choose a color and icon. Changes are saved automatically."
        className="folder-appearance-dialog"
        footer={
          <>
            <Button variant="ghost" onClick={() => reset(path)}>
              Reset to default
            </Button>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </>
        }
      >
        <div className="folder-appearance-preview">
          <FolderGlyph appearance={appearance} size={52} />
          <span>{name}</span>
        </div>
        <fieldset className="folder-appearance-field">
          <legend>Color</legend>
          <div className="folder-color-options">
            {FOLDER_COLORS.map(({ name: label, color }) => (
              <button
                key={color}
                type="button"
                className="folder-color-option"
                aria-label={label}
                aria-pressed={appearance.color.toLowerCase() === color}
                title={label}
                onClick={() => setAppearance(path, { color })}
              >
                <FolderGlyph appearance={{ ...appearance, color }} size={27} />
              </button>
            ))}
          </div>
          <label className="folder-custom-color">
            <span>Custom color</span>
            <span className="folder-color-value">{appearance.color.toUpperCase()}</span>
            <input
              type="color"
              aria-label="Custom folder color"
              value={appearance.color}
              onChange={(event) => setAppearance(path, { color: event.target.value })}
            />
          </label>
        </fieldset>
        <fieldset className="folder-appearance-field">
          <legend>Icon style</legend>
          <div className="folder-style-options">
            {(['layered', 'outline'] as const).map((style) => (
              <button
                key={style}
                type="button"
                aria-pressed={appearance.style === style}
                onClick={() => setAppearance(path, { ...appearance, style })}
              >
                <FolderGlyph appearance={{ ...appearance, style }} size={24} />
                {style === 'layered' ? 'Layered' : 'Outline'}
              </button>
            ))}
          </div>
        </fieldset>
      </Modal>
    </>
  );
}
