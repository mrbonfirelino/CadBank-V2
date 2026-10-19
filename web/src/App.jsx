import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api';

export default function App() {
  const [me, setMe] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    api('/auth/me').then(setMe).catch(() => {});
  }, []);

  const logout = () => { setToken(''); nav('/login'); };

  return (
    <div>
      <div className="navbar">
        <span className="brand">📐 CadBank</span>
        <NavLink to="/" end>Desenhos</NavLink>
        <NavLink to="/batch">Lote</NavLink>
        {me?.role === 'admin' && <NavLink to="/admin">Administração</NavLink>}
        <span className="spacer" />
        <span className="muted">{me?.full_name || me?.username} ({me?.role})</span>
        <button className="secondary" onClick={logout}>Sair</button>
      </div>
      <div className="container">
        <Outlet context={{ me }} />
      </div>
    </div>
  );
}
