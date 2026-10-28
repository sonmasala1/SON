'use client';
import { Children, cloneElement, isValidElement } from 'react';
import { useLocale } from './LocaleProvider';

// Explicit React boundaries localize text without mutating the DOM or any form/API values.
export function Text({ children, error = false }) {
  const { t } = useLocale();
  return <>{Children.map(children, child => typeof child === 'string' ? t(child, { error }) : child)}</>;
}
export function LocalizedAttrs({ children, preserve = [] }) {
  const { locale, t } = useLocale();
  if (!isValidElement(children)) return children;
  const props = {};
  for (const key of ['aria-label', 'placeholder', 'title', 'alt']) if (!preserve.includes(key) && typeof children.props[key] === 'string') props[key] = t(children.props[key]);
  if (children.props.lang) props.lang = locale;
  return cloneElement(children, props);
}
