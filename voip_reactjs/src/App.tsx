import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Header from './components/Common/Header';
import Footer from './components/Common/Footer';
import Dashboard from './components/Dashboard/Dashboard';
import CallsPage from './components/Calls/CallsPage';
import CallHistoryPage from './components/History/CallHistoryPage';
import SettingsPage from './components/Settings/SettingsPage';
import AdvancedConfigPage from './components/Advanced/AdvancedConfigPage';
import HowToUsePage from './components/Help/HowToUsePage';
import LoadingSpinner from './components/Common/LoadingSpinner';
import { useVoipConfig } from './hooks';
import './App.css';

const AppContent: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const { config } = useVoipConfig();
  const navigate = useNavigate();
  const location = useLocation();

  // Calculate if API is configured based on current config state
  const apiConfigured = !!(config.api.key && config.api.userName && config.api.baseUrl);

  // Get current page from the URL path
  const getCurrentPage = () => {
    const path = location.pathname.slice(1); // Remove leading slash
    return path || 'dashboard';
  };

  // Simulate app initialization
  useEffect(() => {
    const initializeApp = async () => {
      // Simulate loading time
      await new Promise(resolve => setTimeout(resolve, 1000));
      setIsLoading(false);
    };

    initializeApp();
  }, []);

  const handleNavigation = (page: string) => {
    navigate(`/${page}`);
  };

  if (isLoading) {
    return <LoadingSpinner overlay message="Initializing VOIP Application..." />;
  }

  return (
    <div className={`app ${config.ui.theme}`}>
      <Header 
        currentPage={getCurrentPage()} 
        onNavigate={handleNavigation}
      />
      
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route 
            path="/dashboard" 
            element={
              <Dashboard 
                onNavigate={handleNavigation}
                isApiConfigured={apiConfigured}
              />
            } 
          />
          <Route 
            path="/calls" 
            element={
              <CallsPage 
                isApiConfigured={apiConfigured}
              />
            } 
          />
          <Route 
            path="/history" 
            element={
              <CallHistoryPage 
                isApiConfigured={apiConfigured}
              />
            } 
          />
          <Route 
            path="/settings" 
            element={<SettingsPage />} 
          />
          <Route 
            path="/advanced" 
            element={<AdvancedConfigPage />} 
          />
          <Route 
            path="/how-to-use" 
            element={<HowToUsePage />} 
          />
        </Routes>
      </main>

      <Footer />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;
