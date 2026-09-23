import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../app/store/authStore';
import {
  LayoutGrid,
  PlusCircle,
  Book,
  Radar,
  FileText,
  Settings,
  LogOut,
} from 'lucide-react';
import IconButton from '../common/IconButton';

export default function AppSidebar({ onOpenSystemStatus }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', label: 'Command Center', icon: LayoutGrid, exact: true },
    { to: '/analysis/new', label: 'New Mission', icon: PlusCircle },
    { to: '/reports', label: 'Dossier Archive', icon: Book },
  ];

  return (
    <nav
      className="rail w-16 bg-[#0A0A0B] border-r border-[#252529] flex flex-col items-center justify-between py-3 flex-shrink-0 z-40 select-none"
      data-brief-id="nav-rail"
      data-brief-role="nav-top"
      aria-label="Primary Navigation"
    >
      {/* Top Nav Rail Icons */}
      <div className="flex flex-col items-center gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);

          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 ${
                isActive
                  ? 'bg-[#222224] text-[#F5F5F5]'
                  : 'text-[#5C5C63] hover:text-[#C8C8CE] hover:bg-[rgba(255,255,255,0.03)]'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} className="flex-shrink-0" />
            </NavLink>
          );
        })}
      </div>

      {/* Bottom Controls: System Status Inspector & Logout */}
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onOpenSystemStatus}
          title="Subsystem Architecture & Health Status"
          className="w-10 h-10 rounded-lg text-[#5C5C63] hover:text-[#C8C8CE] hover:bg-[rgba(255,255,255,0.03)] flex items-center justify-center cursor-pointer transition-colors"
          aria-label="Open System Status"
        >
          <Settings size={20} />
        </button>

        <button
          type="button"
          onClick={handleLogout}
          title={`Signed in as ${user?.name || user?.email || 'Analyst'}. Click to Sign Out.`}
          className="w-10 h-10 rounded-lg text-[#5C5C63] hover:text-[#F87171] hover:bg-[rgba(248,113,113,0.08)] flex items-center justify-center cursor-pointer transition-colors"
          aria-label="Sign Out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </nav>
  );
}

