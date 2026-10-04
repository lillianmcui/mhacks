import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Dashboard } from './routes/Dashboard';
import { Operator } from './routes/Operator';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/operator" element={<Operator />} />
      </Routes>
    </BrowserRouter>
  );
}
