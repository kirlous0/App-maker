import { dbStore } from '@/lib/db';
import { getDictionary, type Dictionary } from '@/lib/i18n/dictionary';
import { getLanguageCookie, getSession } from '@/lib/session';
import type { SupportedLanguage } from '@/lib/types';

export async function resolveServerLanguage(): Promise<{
  lang: SupportedLanguage;
  dir: 'rtl' | 'ltr';
  dict: Dictionary;
}> {
  const cookieLang = await getLanguageCookie();
  let lang: SupportedLanguage = cookieLang;

  const session = await getSession();
  if (session) {
    try {
      const user = await dbStore.getUserById(session.userId);
      if (user?.preferred_language === 'en' || user?.preferred_language === 'ar') {
        lang = user.preferred_language;
      }
    } catch {
      // keep cookie lang
    }
  }

  return {
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    dict: getDictionary(lang),
  };
}
