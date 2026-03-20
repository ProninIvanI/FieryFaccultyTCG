const EMAIL_REGEX =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;

export const validateEmail = (value: string): string[] => {
  if (!value.trim()) {
    return ['Email обязателен'];
  }
  if (!EMAIL_REGEX.test(value)) {
    return ['Некорректный формат email'];
  }
  return [];
};

export const validateUsername = (value: string): string[] => {
  if (!value.trim()) {
    return ['Имя пользователя обязательно'];
  }
  if (!USERNAME_REGEX.test(value)) {
    return ['Имя пользователя: 3-20 символов, буквы, цифры, _'];
  }
  return [];
};

export const validatePassword = (value: string): string[] => {
  const errors: string[] = [];
  if (!value) {
    return ['Пароль обязателен'];
  }
  if (value.length < 8 || value.length > 64) {
    errors.push('Пароль должен быть 8-64 символа');
  }
  if (!/[A-Z]/.test(value)) {
    errors.push('Пароль должен содержать заглавную букву');
  }
  if (!/[a-z]/.test(value)) {
    errors.push('Пароль должен содержать строчную букву');
  }
  if (!/[0-9]/.test(value)) {
    errors.push('Пароль должен содержать цифру');
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value)) {
    errors.push('Пароль должен содержать спецсимвол');
  }
  return errors;
};

export const validatePasswordConfirm = (password: string, confirm: string): string[] => {
  if (!confirm) {
    return ['Подтверждение пароля обязательно'];
  }
  if (password !== confirm) {
    return ['Пароли не совпадают'];
  }
  return [];
};
