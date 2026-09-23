import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import Login from '../../pages/Login';
import Dashboard from '../../pages/Dashboard';
import NewAnalysis from '../../pages/NewAnalysis';
import Analysis from '../../pages/Analysis';
import ManualAnalysis from '../../pages/ManualAnalysis';
import SpillDetails from '../../pages/SpillDetails';
import VesselDetails from '../../pages/VesselDetails';
import Reports from '../../pages/Reports';
import Settings from '../../pages/Settings';
import SystemStatus from '../../pages/SystemStatus';
import DesignSystem from '../../pages/DesignSystem';

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
        <Route path="/new-mission" element={<NewAnalysis />} />
        <Route path="/new-analysis" element={<NewAnalysis />} />
        <Route path="/sentinel1" element={<NewAnalysis />} />
        <Route path="/analysis/manual" element={<ManualAnalysis />} />
        <Route path="/analysis/manual/:id" element={<ManualAnalysis />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/analysis/:id" element={<Analysis />} />
        <Route path="/spills/:id" element={<SpillDetails />} />
        <Route path="/vessels/:mmsi" element={<VesselDetails />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/dossier" element={<Reports />} />
        <Route path="/dossier-archive" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/system" element={<SystemStatus />} />
        <Route path="/system-status" element={<SystemStatus />} />
        <Route path="/design-system" element={<DesignSystem />} />
      </Route>

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
