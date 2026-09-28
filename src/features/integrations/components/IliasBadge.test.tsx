import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IliasBadge } from '@/features/integrations/components/IliasBadge';

describe('IliasBadge', () => {
  it('renders with an accessible name and the ILIAS label by default', () => {
    render(<IliasBadge />);
    const badge = screen.getByRole('img', { name: 'Synced from ILIAS' });
    expect(badge).toHaveTextContent('ILIAS');
  });

  it('hides the label but keeps the accessible name when showLabel is false', () => {
    render(<IliasBadge showLabel={false} />);
    const badge = screen.getByRole('img', { name: 'Synced from ILIAS' });
    expect(badge).not.toHaveTextContent('ILIAS');
  });

  it('uses a custom title as the accessible name', () => {
    render(<IliasBadge title="Downloaded from ILIAS" />);
    expect(screen.getByRole('img', { name: 'Downloaded from ILIAS' })).toBeInTheDocument();
  });
});
