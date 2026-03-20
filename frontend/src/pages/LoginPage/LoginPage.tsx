import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants';
import { authService } from '@/services';
import { validateEmail, validatePassword } from '@/utils';
import styles from './LoginPage.module.css';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = [
      ...validateEmail(email),
      ...validatePassword(password),
    ];
    setErrors(nextErrors);
    if (nextErrors.length > 0) {
      return;
    }
    setIsSubmitting(true);
    const result = await authService.login({ email, password });
    setIsSubmitting(false);
    if (!result.ok) {
      setErrors([result.error ?? 'Ошибка входа']);
      return;
    }
    navigate(ROUTES.HOME);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Вход</h1>
        <p className={styles.subtitle}>Войдите в аккаунт прототипа</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label}>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={styles.input}
              placeholder="you@example.com"
              required
            />
          </label>

          <label className={styles.label}>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={styles.input}
              placeholder="Пароль"
              required
            />
          </label>

          {errors.length > 0 && (
            <div className={styles.errors}>
              {errors.map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          )}

          <button className={styles.button} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div className={styles.footer}>
          Нет аккаунта? <Link to={ROUTES.REGISTER}>Создать</Link>
        </div>
      </div>
    </div>
  );
};
