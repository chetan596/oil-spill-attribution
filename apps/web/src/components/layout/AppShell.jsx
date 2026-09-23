import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import AppTopbar from './AppTopbar';
import SystemStatusModal from './SystemStatusModal';

export default function AppShell() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: 'var(--og-bg-base)',
      }}
    >
      {/* Tactical Left Operational Sidebar */}
      <AppSidebar
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        onOpenSystemStatus={() => setIsStatusModalOpen(true)}
      />

      {/* Main Workspace Frame */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        {/* Top Operational Status Header */}
        <AppTopbar onOpenSystemStatus={() => setIsStatusModalOpen(true)} />

        {/* Dynamic Page Workspace Content (Scrollable or Fullscreen Map) */}
        <main
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
          role="main"
        >
          <Outlet />
        </main>
      </div>

      {/* System Architecture & Provenance Status Modal */}
      <SystemStatusModal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
      />
    </div>
  );
}
