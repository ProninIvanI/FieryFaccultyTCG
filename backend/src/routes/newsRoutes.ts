import { Router } from 'express';
import rawNews from '../data/news.json';

type NewsBlock = {
  type: 'paragraph' | 'heading' | 'list';
  text?: string;
  items?: string[];
};

type NewsItem = {
  id: string;
  patch: string;
  title: string;
  blocks: NewsBlock[];
};

type NewsData = {
  news: NewsItem[];
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
  if (value.type !== 'paragraph' && value.type !== 'heading' && value.type !== 'list') {
    return false;
  }
  if (value.type === 'list') {
    return value.items === undefined || isStringArray(value.items);
  }
  return value.text === undefined || isString(value.text);
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

const isNewsData = (value: unknown): value is NewsData => {
  if (!isRecord(value)) {
    return false;
  }
  return Array.isArray(value.news) && value.news.every(isNewsItem);
};

const newsData = isNewsData(rawNews) ? rawNews : { news: [] };

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: newsData.news,
  });
});

export default router;
