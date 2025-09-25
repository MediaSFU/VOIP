import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPhone, faCog, faHistory, faChartBar, faTools } from '@fortawesome/free-solid-svg-icons';
import './Header.css';

interface HeaderProps {
  title?: string;
  currentPage?: string;
  onNavigate?: (page: string) => void;
}

const Header: React.FC<HeaderProps> = ({ 
  title = 'VOIP Application', 
  currentPage = 'dashboard',
  onNavigate 
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: faChartBar },
    { id: 'calls', label: 'Calls', icon: faPhone },
    { id: 'history', label: 'History', icon: faHistory },
    { id: 'advanced', label: 'Advanced', icon: faTools },
    { id: 'settings', label: 'Settings', icon: faCog }
  ];

  return (
    <header className="app-header">
      <div className="header-container">
        <div className="header-brand">
          <FontAwesomeIcon icon={faPhone} className="brand-icon" />
          <h1 className="brand-title">{title}</h1>
        </div>
        
        <nav className="header-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => onNavigate?.(item.id)}
            >
              <FontAwesomeIcon icon={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default Header;
