import React from 'react';
import { Database, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function EmptyState({
  icon: Icon = Database,
  title = 'No Data Found',
  description = 'There are currently no records available.',
  actionText,
  actionLink,
  onAction,
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      textAlign: 'center',
      color: '#94a3b8',
      background: 'rgba(15, 23, 42, 0.5)',
      borderRadius: '8px',
      border: '1px dashed #334155',
      margin: '16px 0',
    }}>
      <div style={{ padding: '16px', background: '#1e293b', borderRadius: '50%', marginBottom: '16px', color: '#38bdf8' }}>
        <Icon size={32} />
      </div>
      <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', fontWeight: 600, marginBottom: '6px' }}>{title}</h3>
      <p style={{ fontSize: '0.9rem', maxWidth: '400px', marginBottom: '20px' }}>{description}</p>
      {actionLink && (
        <Link to={actionLink} className="btn-primary" style={{ textDecoration: 'none' }}>
          <Plus size={16} /> {actionText || 'Create New'}
        </Link>
      )}
      {onAction && !actionLink && (
        <button onClick={onAction} className="btn-primary">
          <Plus size={16} /> {actionText || 'Create New'}
        </button>
      )}
    </div>
  );
}
