import { useEffect, useState } from 'react';
import { Card, HomeLinkButton, PageShell } from '@/components';
import { API_URL } from '@/constants';
import styles from './NewsPage.module.css';

type NewsBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] };

type NewsItem = {
  id: string;
  patch: string;
  title: string;
  blocks: NewsBlock[];
};

type NewsResponse = {
  success: boolean;
  data: NewsItem[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isString = (value: unknown): value is string => typeof value === 'string';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);

const isNewsBlock = (value: unknown): value is NewsBlock => {
  if (!isRecord(value)) {
    return false;
  }
  if (value.type === 'paragraph' || value.type === 'heading') {
    return isString(value.text);
  }
  if (value.type === 'list') {
    return isStringArray(value.items);
  }
  return false;
};

const isNewsItem = (value: unknown): value is NewsItem => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isString(value.id) &&
    isString(value.patch) &&
    isString(value.title) &&
    Array.isArray(value.blocks) &&
    value.blocks.every(isNewsBlock)
  );
};

const isNewsResponse = (value: unknown): value is NewsResponse => {
  if (!isRecord(value)) {
    return false;
  }
  return value.success === true && Array.isArray(value.data) && value.data.every(isNewsItem);
};

export const NewsPage = () => {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadNews = async () => {
      try {
        const response = await fetch(`${API_URL}/api/news`);
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error('Не удалось загрузить новости');
        }
        if (!isNewsResponse(payload)) {
          throw new Error('Неверный формат данных новостей');
        }
        if (isMounted) {
          setItems(payload.data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Ошибка загрузки новостей');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadNews();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <PageShell
      title="Летопись академии"
      subtitle="Свежие вести, новые карты и перемены в магическом порядке."
      actions={<HomeLinkButton />}
    >
      {isLoading ? (
        <Card title="Новости">
          <p>Загружаем свежие новости...</p>
        </Card>
      ) : null}

      {error ? (
        <Card title="Новости">
          <p>{error}</p>
        </Card>
      ) : null}

      {!isLoading && !error && items.length === 0 ? (
        <Card title="Новости">
          <p>Пока нет опубликованных новостей.</p>
        </Card>
      ) : null}

      {!isLoading && !error
        ? items.map((item) => (
            <Card key={item.id} title={`Патч ${item.patch}`}>
              <article>
                <h3 className={styles.newsTitle}>
                  <span className={styles.patchBadge}>Патч {item.patch}</span>
                  {item.title}
                </h3>
                {item.blocks.map((block, index) => {
                  if (block.type === 'paragraph') {
                    return <p key={`${item.id}-p-${index}`}>{block.text}</p>;
                  }
                  if (block.type === 'heading') {
                    return <h4 key={`${item.id}-h-${index}`}>{block.text}</h4>;
                  }
                  return (
                    <ul key={`${item.id}-l-${index}`}>
                      {block.items.map((entry, entryIndex) => (
                        <li key={`${item.id}-l-${index}-${entryIndex}`}>{entry}</li>
                      ))}
                    </ul>
                  );
                })}
              </article>
            </Card>
          ))
        : null}
    </PageShell>
  );
};
