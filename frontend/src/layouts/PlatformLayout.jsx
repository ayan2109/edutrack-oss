import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Building2, LayoutDashboard, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function PlatformLayout({ children }) {
  const { profile, logout } = useAuth();
  return <div className="app-shell platform-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><ShieldCheck size={22}/></div><div><b>EduTrack<span>OSS</span></b><small>Platform console</small></div></div><div className="nav-label">PLATFORM</div><nav><NavLink className="nav-item" to="/platform"><LayoutDashboard size={18}/><span>Overview</span></NavLink><NavLink className="nav-item" to="/platform/institutions"><Building2 size={18}/><span>Institutions</span></NavLink></nav><div className="sidebar-bottom"><div className="profile"><b>{profile?.name || 'Platform Admin'}</b><small>Super administrator</small></div><button className="icon-button" onClick={logout} title="Sign out"><LogOut size={17}/></button></div></aside><main className="main-area"><div className="page-wrap">{children}</div></main></div>;
}
