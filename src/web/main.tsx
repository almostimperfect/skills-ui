import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/Layout.js'
import Dashboard from './pages/Dashboard.js'
import Skills from './pages/Skills.js'
import SkillDetail from './pages/SkillDetail.js'
import Projects from './pages/Projects.js'
import ProjectDetail from './pages/ProjectDetail.js'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="skills" element={<Skills />} />
            <Route path="skills/:name" element={<SkillDetail />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:projectPath" element={<ProjectDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
