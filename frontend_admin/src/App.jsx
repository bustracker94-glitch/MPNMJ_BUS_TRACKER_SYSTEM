import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminLogin from './pages/admin/AdminLogin';
import InstallButton from './components/admin/InstallButton';
import DriverLogin from './pages/driver/DriverLogin';
import DriverPanel from './pages/driver/DriverPanel';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
        <Routes>
          <Route path="/" element={<Navigate to="/admin/login" replace />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/*" element={<AdminDashboard />} />
          <Route path="/driver/login" element={<DriverLogin />} />
          <Route path="/driver/panel" element={<DriverPanel />} />
          <Route path="*" element={<Navigate to="/admin/login" replace />} />
        </Routes>
        <InstallButton />
      </div>
    </Router>
  );
}

export default App;
