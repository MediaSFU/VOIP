import React from 'react';
import './HowToUsePage.css';

const HowToUsePage: React.FC = () => {
  return (
    <div className="how-to-use-page">
      <div className="how-to-use-container">
        <header className="page-header">
          <h1>📞 How to Use the VOIP Application</h1>
          <p className="page-subtitle">A complete guide to making calls and managing your communication</p>
        </header>

        <div className="guide-content">
          {/* Getting Started Section */}
          <section className="guide-section">
            <div className="section-header">
              <h2>🚀 Getting Started</h2>
            </div>
            <div className="section-content">
              <div className="step-card">
                <h3>1. Configure Your API Settings</h3>
                <ul>
                  <li>Go to <strong>Settings</strong> from the navigation menu</li>
                  <li>Enter your MediaSFU API credentials:
                    <ul>
                      <li><strong>API Key:</strong> Your MediaSFU API key</li>
                      <li><strong>Username:</strong> Your MediaSFU username</li>
                      <li><strong>Base URL:</strong> Leave as default (https://mediasfu.com)</li>
                    </ul>
                  </li>
                  <li>Click <strong>Save Settings</strong> to apply your configuration</li>
                </ul>
                
                <div className="special-note">
                  <p><strong>Important:</strong> Unless you are using a registered domain with MediaSFU, use the <strong>sandbox key</strong>.</p>
                </div>
              </div>

              <div className="step-card">
                <h3>2. Set Up Your SIP Configuration</h3>
                <ul>
                  <li>Your SIP configurations are automatically loaded from MediaSFU</li>
                  <li>Ensure your SIP numbers are configured for outgoing calls</li>
                  <li>Check that your numbers have proper permissions and are active</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Making Calls Section */}
          <section className="guide-section">
            <div className="section-header">
              <h2>📱 Making Calls</h2>
            </div>
            <div className="section-content">
              <div className="step-card">
                <h3>Step 1: Access the Calls Page</h3>
                <p>Navigate to the <strong>Calls</strong> section from the main menu. This is where you'll manage all your calling activities.</p>
              </div>

              <div className="step-card">
                <h3>Step 2: Choose Your Calling Method</h3>
                <div className="method-options">
                  <div className="method-card">
                    <h4>🤖 AI Agent Mode</h4>
                    <p><strong>Best for:</strong> Automated calls, IVR systems, or when you don't need to talk directly</p>
                    <ul>
                      <li>The AI agent handles the conversation</li>
                      <li>No voice room required</li>
                      <li>Great for surveys or automated announcements</li>
                    </ul>
                  </div>
                  
                  <div className="method-card">
                    <h4>🎤 Voice Mode</h4>
                    <p><strong>Best for:</strong> Direct conversations where you need to talk</p>
                    <ul>
                      <li>Requires an active MediaSFU voice room</li>
                      <li>You can speak directly with the call recipient</li>
                      <li>Full call control and interaction</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="step-card">
                <h3>Step 3: Make Your Call</h3>
                <ol>
                  <li><strong>Select a From Number:</strong> Choose from your available SIP numbers</li>
                  <li><strong>Enter Phone Number:</strong> Type the destination number in E.164 format (e.g., +15551234567)</li>
                  <li><strong>Choose Call Mode:</strong> Select AI Agent or Voice mode based on your needs</li>
                  <li><strong>Connect:</strong> Click "Make Call" to initiate the connection</li>
                </ol>
              </div>
            </div>
          </section>

          {/* Voice Rooms Section */}
          <section className="guide-section">
            <div className="section-header">
              <h2>🎧 Working with Voice Rooms</h2>
            </div>
            <div className="section-content">
              <div className="step-card">
                <h3>Creating a Voice Room</h3>
                <ul>
                  <li>Click <strong>"Connect to Voice Room"</strong> to create a new room</li>
                  <li>Your room will be automatically configured for voice calls</li>
                  <li>Enable your microphone when prompted for voice participation</li>
                </ul>
              </div>

              <div className="step-card">
                <h3>Room Controls</h3>
                <ul>
                  <li><strong>Microphone:</strong> Toggle your microphone on/off during calls</li>
                  <li><strong>Room Settings:</strong> Adjust room duration and other preferences</li>
                  <li><strong>Disconnect:</strong> Leave the room when finished</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Managing Calls Section */}
          <section className="guide-section">
            <div className="section-header">
              <h2>📋 Managing Your Calls</h2>
            </div>
            <div className="section-content">
              <div className="step-card">
                <h3>Active Calls</h3>
                <ul>
                  <li><strong>View Status:</strong> See real-time call status and duration</li>
                  <li><strong>End Calls:</strong> Terminate active calls when needed</li>
                  <li><strong>Join Calls:</strong> Connect to incoming calls through MediaSFU rooms</li>
                </ul>
              </div>

              <div className="step-card">
                <h3>Call History</h3>
                <ul>
                  <li>Visit the <strong>History</strong> page to view past calls</li>
                  <li>See detailed information including duration, status, and timestamps</li>
                  <li>Export call history or clear old records as needed</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Tips Section */}
          <section className="guide-section">
            <div className="section-header">
              <h2>💡 Tips & Best Practices</h2>
            </div>
            <div className="section-content">
              <div className="tip-grid">
                <div className="tip-card">
                  <h4>📞 Phone Number Format</h4>
                  <p>Always use E.164 format for phone numbers (e.g., +15551234567) for best compatibility.</p>
                </div>
                
                <div className="tip-card">
                  <h4>🎤 Microphone Permission</h4>
                  <p>Grant microphone access when prompted to ensure voice mode calls work properly.</p>
                </div>
                
                <div className="tip-card">
                  <h4>🌐 Browser Compatibility</h4>
                  <p>Use modern browsers (Chrome, Firefox, Safari, Edge) for optimal performance.</p>
                </div>
                
                <div className="tip-card">
                  <h4>🔄 Connection Issues</h4>
                  <p>If calls fail to connect, check your API configuration and SIP number permissions.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Troubleshooting Section */}
          <section className="guide-section">
            <div className="section-header">
              <h2>🔧 Troubleshooting</h2>
            </div>
            <div className="section-content">
              <div className="step-card">
                <h3>Common Issues</h3>
                <div className="troubleshoot-item">
                  <h4>❌ "API not configured" error</h4>
                  <p>Go to Settings and ensure your MediaSFU API credentials are correctly entered and saved.</p>
                </div>
                
                <div className="troubleshoot-item">
                  <h4>❌ "No eligible numbers" for outgoing calls</h4>
                  <p>Check that your SIP configurations in MediaSFU have outgoing calls enabled and SIP is active.</p>
                </div>
                
                <div className="troubleshoot-item">
                  <h4>❌ Voice room connection fails</h4>
                  <p>Ensure microphone permissions are granted and try refreshing the page.</p>
                </div>
                
                <div className="troubleshoot-item">
                  <h4>❌ Calls end immediately</h4>
                  <p>Verify the phone number format and that your SIP provider supports the destination.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Support Section */}
          <section className="guide-section">
            <div className="section-header">
              <h2>🆘 Need More Help?</h2>
            </div>
            <div className="section-content">
              <div className="support-links">
                <a href="https://mediasfu.com/telephony" target="_blank" rel="noopener noreferrer" className="support-link">
                  📚 MediaSFU Telephony Documentation
                </a>
                <a href="https://mediasfu.com/contact" target="_blank" rel="noopener noreferrer" className="support-link">
                  📧 Contact Support
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default HowToUsePage;