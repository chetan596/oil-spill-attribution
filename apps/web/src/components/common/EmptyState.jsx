import React from 'react';
import { Database, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from './Button';

export default function EmptyState({
  icon: Icon = Database,
  title = 'No Data Found',
  description = 'There are currently no records available.',
  actionText,
  actionLink,
  onAction,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-12 text-center rounded-[8px] border border-dashed border-[var(--og-border,#25292F)] bg-[var(--og-surface-recessed,#0C0E11)] my-4 ${className}`}
      role="status"
    >
      <div className="w-12 h-12 rounded-[8px] bg-[var(--og-surface-raised,#171A1E)] border border-[var(--og-border,#25292F)] text-[var(--og-violet,#A855F7)] flex items-center justify-center mb-4">
        <Icon size={24} />
      </div>
      <h3 className="text-sm font-display font-medium text-[var(--og-text-primary,#ECEEF1)] mb-1.5">
        {title}
      </h3>
      <p className="text-xs text-[var(--og-text-muted,#777E87)] max-w-sm mb-5 leading-relaxed">
        {description}
      </p>
      {actionLink && (
        <Link to={actionLink} style={{ textDecoration: 'none' }}>
          <Button variant="primary" size="sm" icon={Plus}>
            {actionText || 'Create New'}
          </Button>
        </Link>
      )}
      {onAction && !actionLink && (
        <Button variant="primary" size="sm" onClick={onAction} icon={Plus}>
          {actionText || 'Create New'}
        </Button>
      )}
    </div>
  );
}
