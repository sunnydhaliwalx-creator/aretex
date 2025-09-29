import 'bootstrap/dist/css/bootstrap.min.css'; // Bootstrap CSS first
import 'bootstrap-icons/font/bootstrap-icons.css'; // Bootstrap Icons
import '../styles/custom.css'; // Your custom overrides last

import { useEffect } from 'react';
import Navbar from '../components/Navbar';

export default function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // Load Bootstrap JavaScript and attach to window
    const loadBootstrap = async () => {
      try {
        const bootstrap = await import('bootstrap');
        window.bootstrap = bootstrap;
        
        // Verify it loaded
        //console.log('Bootstrap loaded:', !!window.bootstrap.Modal);
      } catch (error) {
        console.error('Error loading Bootstrap:', error);
      }
    };

    loadBootstrap();
  }, []);

  return (
    <>
      <Navbar />
      <Component {...pageProps} />
    </>
  );
}
