import { Button, Modal } from '@/components/ui';
import { NAV_SECTIONS, getNavItemByPath } from '@/lib/navigation';
import { orderedPaths } from '@/lib/sidebar';
import { useSidebarStore } from '@/store/sidebarStore';

/** Like Finder's sidebar settings: one switch per page, in the student's order. */
export function CustomizeSidebarDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const order = useSidebarStore((state) => state.order);
  const hidden = useSidebarStore((state) => state.hidden);
  const setNavItemHidden = useSidebarStore((state) => state.setNavItemHidden);
  const resetLayout = useSidebarStore((state) => state.resetLayout);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize sidebar"
      description="Choose the pages you want to see. Drag entries in the sidebar to reorder them, and drop folders or notes onto it to keep them under Favorites."
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={resetLayout}>
            Restore defaults
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {NAV_SECTIONS.map((section) => (
          <fieldset key={section.id}>
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              {section.label}
            </legend>
            <ul className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line-soft">
              {orderedPaths(section, order).map((path) => {
                const item = getNavItemByPath(path);
                if (!item) return null;
                const Icon = item.icon;
                return (
                  <li key={path}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[13px] text-primary transition-colors hover:bg-surface-hover">
                      <Icon size={17} strokeWidth={1.75} aria-hidden className="text-secondary" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <input
                        type="checkbox"
                        role="switch"
                        className="toggle-switch"
                        checked={!hidden.includes(path)}
                        onChange={(event) => setNavItemHidden(path, !event.target.checked)}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
      </div>
    </Modal>
  );
}
