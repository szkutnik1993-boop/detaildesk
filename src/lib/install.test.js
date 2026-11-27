import { describe, it, expect } from 'vitest';
import { detectPlatform } from './install.js';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  iphoneGmail: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iphoneGoogle: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/344.0.6 Mobile/15E148 Safari/604.1',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.81 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.6261.105 Mobile Safari/537.36',
  androidWebView: 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.81 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
};

describe('rozpoznawanie urządzenia do instrukcji instalacji', () => {
  it('iPhone + Safari → kroki Safari', () => {
    expect(detectPlatform(UA.iphoneSafari)).toEqual({ os: 'ios', browser: 'safari', iosNeedsSafari: false });
  });
  it('iPhone w Chrome, Gmailu lub aplikacji Google → podpowiedź „otwórz w Safari”', () => {
    expect(detectPlatform(UA.iphoneChrome)).toMatchObject({ os: 'ios', browser: 'chrome', iosNeedsSafari: true });
    expect(detectPlatform(UA.iphoneGmail)).toMatchObject({ os: 'ios', browser: 'inapp', iosNeedsSafari: true });
    expect(detectPlatform(UA.iphoneGoogle)).toMatchObject({ os: 'ios', iosNeedsSafari: true });
  });
  it('iPad z iPadOS (udaje Maca) rozpoznany po ekranie dotykowym', () => {
    expect(detectPlatform(UA.ipadOS, { maxTouchPoints: 5 }).os).toBe('ios');
    expect(detectPlatform(UA.macSafari, { maxTouchPoints: 0 }).os).toBe('desktop');
  });
  it('Android: Chrome, Samsung Internet, Firefox, wbudowana przeglądarka', () => {
    expect(detectPlatform(UA.androidChrome)).toMatchObject({ os: 'android', browser: 'chrome' });
    expect(detectPlatform(UA.samsung)).toMatchObject({ os: 'android', browser: 'samsung' });
    expect(detectPlatform(UA.androidFirefox)).toMatchObject({ os: 'android', browser: 'firefox' });
    expect(detectPlatform(UA.androidWebView)).toMatchObject({ os: 'android', browser: 'inapp' });
  });
  it('komputer', () => {
    expect(detectPlatform(UA.winChrome)).toMatchObject({ os: 'desktop', browser: 'chrome', iosNeedsSafari: false });
  });
});
