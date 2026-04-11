import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants';
import { authService } from '@/services';
import {
  validateEmail,
  validateUsername,
  validatePassword,
  validatePasswordConfirm,
} from '@/utils';
import styles from './RegisterPage.module.css';

export const RegisterPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = [
      ...validateEmail(email),
      ...validateUsername(username),
      ...validatePassword(password),
      ...validatePasswordConfirm(password, confirm),
    ];
    if (!accepted) {
      nextErrors.push('Необходимо принять условия');
    }
    setErrors(nextErrors);
    if (nextErrors.length > 0) {
      return;
    }
    setIsSubmitting(true);
    const result = await authService.register({ email, username, password });
    setIsSubmitting(false);
    if (!result.ok) {
      setErrors([result.error ?? 'Ошибка регистрации']);
      return;
    }
    navigate(ROUTES.LOGIN);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.topActions}>
          <Link className={styles.backLink} to={ROUTES.HOME}>
            ← На главную
          </Link>
        </div>
        <h1 className={styles.title}>Создание аккаунта</h1>
        <p className={styles.subtitle}>Создайте аккаунт, чтобы выйти на арену.</p>

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
            Имя пользователя
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={styles.input}
              placeholder="nickname"
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

          <label className={styles.label}>
            Повторите пароль
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={styles.input}
              placeholder="Повторите пароль"
              required
            />
          </label>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            Я принимаю правила академии
          </label>

          {errors.length > 0 && (
            <div className={styles.errors}>
              {errors.map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          )}

          <button className={styles.button} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Создание...' : 'Создать аккаунт'}
          </button>
        </form>

        <div className={styles.footer}>
          Уже есть аккаунт? <Link to={ROUTES.LOGIN}>Войти</Link>
        </div>
      </div>
    </div>
  );
};
