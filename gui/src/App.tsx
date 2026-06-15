import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { SidecarGate } from './components/SidecarGate';
import { ActionsPage } from './pages/ActionsPage';
import { EventsPage } from './pages/EventsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TaskPage } from './pages/TaskPage';
import { TemplateLabPage } from './pages/TemplateLabPage';

export default function App() {
  return (
    <SidecarGate>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/events" replace />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="actions" element={<ActionsPage />} />
            <Route path="task" element={<TaskPage />} />
            <Route path="templates" element={<TemplateLabPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SidecarGate>
  );
}
