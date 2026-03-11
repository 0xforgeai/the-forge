import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Nav from './components/Nav';
import Footer from './components/Footer';
import MatrixRain from './components/MatrixRain';
import Home from './pages/Home';
import Arena from './pages/Arena';
import Vault from './pages/Vault';
import Leaderboard from './pages/Leaderboard';
import Dashboard from './pages/Dashboard';

export default function App() {
  return (
    <BrowserRouter>
      <MatrixRain />
      <Nav />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/arena" element={<Arena />} />
          <Route path="/vault" element={<Vault />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </main>
      <Footer />
    </BrowserRouter>
  );
}
