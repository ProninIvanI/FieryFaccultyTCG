import { Navigate, Route, Routes } from 'react-router-dom';
import {
  HomePage,
  LoginPage,
  RegisterPage,
  NewsPage,
  DemoPage,
  CardsPage,
  DebugPage,
  SettingsPage,
  RulesPage,
  DeckPage,
  ProfilePage,
  PlayPvpPage,
  PlayPvePage,
  PlaySimPage,
} from './pages';
import { ROUTES } from './constants';
import { UiThemeProvider } from './components/UiThemeProvider';
import { useUiTheme } from './hooks/useUiTheme';
import styles from './App.module.css';

function AppRoutes() {
  const { theme } = useUiTheme();

  return (
    <div className={styles.app} data-theme={theme}>
      <Routes>
        <Route path={ROUTES.HOME} element={<HomePage />} />
        <Route path={ROUTES.LOGIN} element={<LoginPage />} />
        <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
        <Route path={ROUTES.NEWS} element={<NewsPage />} />
        <Route path={ROUTES.DEMO} element={<DemoPage />} />
        <Route path={ROUTES.CARDS} element={<CardsPage />} />
        <Route path={ROUTES.DEBUG} element={<DebugPage />} />
        <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
        <Route path={ROUTES.RULES} element={<RulesPage />} />
        <Route path={ROUTES.DECKS} element={<DeckPage />} />
        <Route path={ROUTES.PROFILE} element={<ProfilePage />} />
        <Route path={ROUTES.PLAY_PVP} element={<PlayPvpPage />} />
        <Route path={ROUTES.PLAY_PVE} element={<PlayPvePage />} />
        <Route path={ROUTES.PLAY_SIM} element={<PlaySimPage />} />
        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <UiThemeProvider>
      <AppRoutes />
    </UiThemeProvider>
  );
}

export default App;
