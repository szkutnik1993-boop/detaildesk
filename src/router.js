import { useEffect, useState } from 'react';

function parse() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path, parts: path.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(qs || '')), key: raw };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const f = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return route;
}

export const go = (to) => {
  window.location.hash = to;
};

export const replace = (to) => {
  const url = new URL(window.location.href);
  url.hash = to;
  window.location.replace(url.toString());
};

export const back = (fallback = '/') => {
  if (window.history.length > 1) window.history.back();
  else go(fallback);
};
