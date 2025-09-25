import React from 'react';
import './Footer.css';

interface FooterProps {
  className?: string;
}

const Footer: React.FC<FooterProps> = ({ className = '' }) => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className={`app-footer ${className}`}>
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-section">
            <h4>VOIP Application</h4>
            <p>Professional communication powered by <a href="https://mediasfu.com" target="_blank" rel="noopener noreferrer" className="mediasfu-link">MediaSFU</a></p>
          </div>
          
          <div className="footer-section">
            <h4>Support</h4>
            <ul>
              <li><a href="/how-to-use">How to Use</a></li>
              <li><a href="https://mediasfu.com/telephony" target="_blank" rel="noopener noreferrer">Telephony Docs</a></li>
              <li><a href="https://mediasfu.com/contact" target="_blank" rel="noopener noreferrer">Contact</a></li>
            </ul>
          </div>
        </div>
        
        <div className="footer-bottom">
          <p>&copy; {currentYear} VOIP Application. Built with MediaSFU SDK.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
