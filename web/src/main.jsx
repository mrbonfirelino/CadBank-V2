import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import Login from './pages/Login';
import Drawings from './pages/Drawings';
import DrawingDetail from './pages/DrawingDetail';
import Admin from './pages/Admin';
import Batch from './pages/Batch';
import { getToken } from './api';
import './styles.css';

function RequireAuth({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><App /></RequireAuth>}>
        <Route index element={<Drawings />} />
        <Route path="drawings/:id" element={<DrawingDetail />} />
        <Route path="admin" element={<Admin />} />
        <Route path="batch" element={<Batch />} />
      </Route>
    </Routes>
  </BrowserRouter>
);
