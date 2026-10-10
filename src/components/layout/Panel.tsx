import {
  useId,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/*
 * The building blocks of a section's sidebar (`SectionPanel`), the same rows
 * Documents' sidebar is made of. They carry no behaviour of their own: a page
 * puts its own state and handlers on them. Classes live in globals.css under
 * "Section panel".
 */

interface PanelHeaderProps {
  /** The panel's name, as its heading. Ignored when `switcher` is given. */
  title?: ReactNode;
  /** Replaces the title: a control that opens a menu of places (Documents' spaces). It brings its own heading. */
  switcher?: ReactNode;
  /** Small icon buttons on the right: `PanelAction`s. */
  actions?: ReactNode;
  className?: string;
}

/** The top of a panel: its title (or a switcher) on the left, a few small icon actions on the right. */
export function PanelHeader({ title, switcher, actions, className }: PanelHeaderProps) {
  return (
    <div className={cn('panel-header', className)}>
      <div className="panel-header-lead">
        {switcher ?? <h2 className="panel-title">{title}</h2>}
      </div>
      {actions ? <div className="panel-actions">{actions}</div> : null}
    </div>
  );
}

interface PanelActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only button needs an accessible name. Also its tooltip. */
  label: string;
}

/**
 * A small icon button for a panel's header. `aria-current="page"` washes it
 * like an open row, for a toggle that stands for the place being shown.
 */
export function PanelAction({
  label,
  className,
  type = 'button',
  children,
  ...props
}: PanelActionProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn('panel-action', className)}
      {...props}
    >
      {children}
    </button>
  );
}

/** What a panel has between its header and footer, and the part that scrolls. */
export function PanelBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('panel-body scroll-area', className)} {...props}>
      {children}
    </div>
  );
}

interface PanelSectionProps {
  /** A small quiet heading above the rows. Without one the section is only spacing. */
  heading?: string;
  className?: string;
  children: ReactNode;
}

/** A group of rows under an optional small heading. With a heading it is a named group for screen readers. */
export function PanelSection({ heading, className, children }: PanelSectionProps) {
  const headingId = useId();
  return (
    <div
      role={heading ? 'group' : undefined}
      aria-labelledby={heading ? headingId : undefined}
      className={cn('panel-section', className)}
    >
      {heading ? (
        <h3 id={headingId} className="panel-heading">
          {heading}
        </h3>
      ) : null}
      {children}
    </div>
  );
}

interface PanelItemOwnProps {
  label: string;
  icon?: LucideIcon | undefined;
  /** A badge at the right edge, e.g. unread mail. Nothing shows for 0. It becomes part of the accessible name. */
  count?: number | undefined;
  /** The row for the place being shown: washed, bolder, and marked with `aria-current`. */
  active?: boolean | undefined;
  className?: string | undefined;
}

type PanelItemLinkProps = PanelItemOwnProps & { to: string } & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    keyof PanelItemOwnProps | 'href'
  >;
type PanelItemButtonProps = PanelItemOwnProps & { to?: undefined } & Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    keyof PanelItemOwnProps
  >;
export type PanelItemProps = PanelItemLinkProps | PanelItemButtonProps;

function PanelItemContent({ icon: Icon, label, count }: PanelItemOwnProps) {
  return (
    <>
      {Icon ? <Icon size={16} strokeWidth={1.8} aria-hidden className="panel-item-icon" /> : null}
      <span className="panel-item-label">{label}</span>
      {count ? (
        <>
          {/* Keeps the badge a word of its own in the accessible name; flex layout drops the space. */}{' '}
          <span className="panel-item-count">{count.toLocaleString()}</span>
        </>
      ) : null}
    </>
  );
}

/**
 * One row of a panel: an icon, a label and an optional count badge. With `to`
 * it is a router link (and `aria-current="page"` when active), without it a
 * button (`aria-current="true"` when active), so `onClick` is where a page
 * keeps its own selection.
 */
export function PanelItem(props: PanelItemProps) {
  if (props.to !== undefined) {
    const { label, icon, count, active, className, to, ...anchor } = props;
    return (
      <Link
        {...anchor}
        to={to}
        aria-current={active ? 'page' : undefined}
        className={cn('panel-row panel-item', active && 'is-active', className)}
      >
        <PanelItemContent icon={icon} label={label} count={count} />
      </Link>
    );
  }
  const { label, icon, count, active, className, type = 'button', ...button } = props;
  return (
    <button
      {...button}
      type={type}
      aria-current={active ? 'true' : undefined}
      className={cn('panel-row panel-item', active && 'is-active', className)}
    >
      <PanelItemContent icon={icon} label={label} count={count} />
    </button>
  );
}

/** The foot of a panel: a few quiet rows (Recently deleted, Settings…) that stay put while the body scrolls. */
export function PanelFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('panel-footer', className)} {...props}>
      {children}
    </div>
  );
}
