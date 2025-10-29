import { useEffect, useMemo, useState } from 'react'
import { ThemeProvider } from './hooks/useTheme'
import { PageShell } from './components/layout/PageShell'
import { Home } from './pages/Home'
import { Rules } from './pages/Rules'

type RouteKey = 'home' | 'rules'

const getCurrentRoute = (): RouteKey => {
  if (typeof window === 'undefined') return 'home'
  const hash = window.location.hash.replace(/^#/, '')
  if (hash === '/rules' || hash === 'rules') {
    return 'rules'
  }
  return 'home'
}

function App() {
  const [route, setRoute] = useState<RouteKey>(getCurrentRoute)

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(getCurrentRoute())
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const page = useMemo(() => {
    switch (route) {
      case 'rules':
        return <Rules />
      case 'home':
      default:
        return <Home />
    }
  }, [route])

  return (
    <ThemeProvider>
      <PageShell>{page}</PageShell>
    </ThemeProvider>
  )
}

export default App
