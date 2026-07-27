import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getToken } from './api/client';
import { Login } from './pages/Login';
import { Layout } from './layouts/Layout';
import { Dashboard } from './pages/Dashboard';
import { Sources } from './pages/Sources';
import { Categories } from './pages/Categories';
import { ApiList } from './pages/ApiList';
import { Deposit } from './pages/Deposit';
import { ConfPage } from './pages/Conf';
import { Logs } from './pages/Logs';
import { Feedback } from './pages/Feedback';
import { Admins } from './pages/Admins';
import { Attach } from './pages/Attach';
import { Groups } from './pages/Groups';
import { Profile } from './pages/Profile';
import { Password } from './pages/Password';
import { Clean } from './pages/Clean';
import { AccessLogs } from './pages/AccessLogs';
import { ConfParams } from './pages/ConfParams';
import { Nodes } from './pages/Nodes';
import './styles.css';

function Private({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename="/qfadmin">
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Private>
            <Layout />
          </Private>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="sources" element={<Sources />} />
        <Route path="categories" element={<Categories />} />
        <Route path="apilist" element={<ApiList />} />
        <Route path="deposit" element={<Deposit />} />
        <Route path="conf" element={<ConfPage />} />
        <Route path="logs" element={<Logs />} />
        <Route path="feedback" element={<Feedback />} />
        <Route path="admins" element={<Admins />} />
        <Route path="attach" element={<Attach />} />
        <Route path="groups" element={<Groups />} />
        <Route path="profile" element={<Profile />} />
        <Route path="password" element={<Password />} />
        <Route path="clean" element={<Clean />} />
        <Route path="access-logs" element={<AccessLogs />} />
        <Route path="conf-params" element={<ConfParams />} />
        <Route path="nodes" element={<Nodes />} />
      </Route>
    </Routes>
  </BrowserRouter>
);
