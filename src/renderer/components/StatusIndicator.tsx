import React from 'react';

interface StatusIndicatorProps {
  label: string;
  active: boolean;
}

export default function StatusIndicator({ label, active }: StatusIndicatorProps) {
  return (
    <div className="status-item">
      <span className={`status-dot ${active ? 'active' : 'inactive'}`} />
      <span>{label}</span>
    </div>
  );
}
