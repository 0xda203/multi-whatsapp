import { app } from 'electron';
import translations from './translations.json';

export function t(key) {
  const systemLocale = app.getLocale() || 'en';
  const locale = systemLocale.split('-')[0];

  const lang = translations[locale] || translations['en'];

  return lang[key] || translations['en'][key] || key;
}
