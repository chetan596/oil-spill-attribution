import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import Login from '../../pages/Login';
import Dashboard from '../../pages/Dashboard';
import NewAnalysis from '../../pages/NewAnalysis';
import Analysis from '../../pages/Analysis';
import SpillDetails from '../../pages/SpillDetails';
import VesselDetails from '../../pages/VesselDetails';
import Reports from '../../pages/Reports';

export default function AppRouter() {
  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<Login />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/analysis/new" element={<NewAnalysis />} />
        <Route path="/analysis/:id" element={<Analysis />} />
        <Route path="/spills/:id" element={<SpillDetails />} />
        <Route path="/vessels/:mmsi" element={<VesselDetails />} />
        <Route path="/reports" element={<Reports />} />
      </Route>

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
