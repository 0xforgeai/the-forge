import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Nav from './components/Nav';
import Footer from './components/Footer';
import MatrixRain from './components/MatrixRain';
import { ToastProvider } from './components/Toast';
import Home from './pages/Home';
import Arena from './pages/Arena';
import Vault from './pages/Vault';
import Leaderboard from './pages/Leaderboard';
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <MatrixRain />
        <Nav />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/arena" element={<Arena />} />
            <Route path="/vault" element={<Vault />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/agents" element={<Agents />} />
          </Routes>
        </main>
        <Footer />
      </ToastProvider>
    </BrowserRouter>
  );
}

