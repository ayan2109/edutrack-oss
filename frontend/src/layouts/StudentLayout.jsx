import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BookOpen, ChartNoAxesCombined, GraduationCap, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
export default function StudentLayout({ children }) {
  const { profile, logout } = useAuth();
  return <div className="app-shell student-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><GraduationCap size={22}/></div><div><b>EduTrack<span>OSS</span></b><small>Student portal</small></div></div><div className="nav-label">MY LEARNING</div><nav><NavLink className="nav-item" to="/student"><BookOpen size={18}/><span>My workspace</span></NavLink><NavLink className="nav-item" to="/student/results"><ChartNoAxesCombined size={18}/><span>My results</span></NavLink></nav><div className="sidebar-bottom"><div className="profile"><b>{profile?.name || 'Student'}</b><small>Student account</small></div><button className="icon-button" onClick={logout}><LogOut size={17}/></button></div></aside><main className="main-area"><div className="page-wrap">{children}</div></main></div>;
}
