import { initContract } from "@monorepo/contract-page-2";
import { getCharacters, getCharacter, getEpisodes, getEpisode } from "./api/rickAndMorty";

// Контракт
export const contractWithCtx = initContract({
  appContext: async (ctx) => {
    // Моковая функция, которая как будто получает данные с сервера
    // Имитируем задержку сети
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // В реальности здесь был бы запрос к серверу:
    // const response = await fetch(`/api/user/context?url=${ctx.url}`);
    // const data = await response.json();
    
    // Моковые данные, зависящие от URL
    const userId = ctx.url.includes('/character/') ? 'user-123-character' : 
                   ctx.url.includes('/episode/') ? 'user-123-episode' : 
                   'user-123-default';
    
    return { 
      userId,
      sessionId: `session-${Date.now()}`,
      url: ctx.url,
      // В реальности это могли бы быть данные пользователя с сервера:
      // permissions: data.permissions,
      // theme: data.theme,
      // etc.
    };
  },
});

// Главная — список персонажей
export const homePage = contractWithCtx.definePage({
  path: "/",
  page: async () => {
    const data = await getCharacters(1);

    return {
      type: "redirect",
      to: "/characters",
    }

    return {
      type: 'ok',
      data: {
        characters: data.results,
        info: data.info,
      }
    }
  },
});

// Персонаж
export const characterPage = contractWithCtx.definePage({
  path: '/character/:id',
  page: async ({ params }) => {
    try {
      const character = await getCharacter(Number(params.id));
      return {
        type: 'ok',
        data: { character },
      }
    } catch {
      return { type: "not-found", data: { message: `Character ${params.id} not found` } }
    }
  },
});

// Список эпизодов
export const episodesPage = contractWithCtx.definePage({
  path: '/episodes',
  page: async () => {
    const data = await getEpisodes(1);
    return {
      type: 'ok',
      data: {
        episodes: data.results,
        info: data.info,
      }
    }
  },
});

// Эпизод
export const episodePage = contractWithCtx.definePage({
  path: '/episode/:id',
  page: async ({ params }) => {
    try {
      const episode = await getEpisode(Number(params.id));
      return {
        type: 'ok',
        data: { episode },
      }
    } catch {
      return { type: "not-found", data: { message: `Episode ${params.id} not found` } }
    }
  },
});

