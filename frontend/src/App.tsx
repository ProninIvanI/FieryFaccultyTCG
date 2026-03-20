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
import styles from './App.module.css';

function App() {
  return (
    <div className={styles.app}>
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

export default App;
