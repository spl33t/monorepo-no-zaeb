// Rick and Morty роуты
// Определение контрактов и страниц для Rick and Morty приложения

import { initContract } from '@monorepo/contract-page-2';
import { getCharacters, getCharacter, getEpisodes, getEpisode, type Character, type Episode, type PaginatedResponse } from './rick-and-morty.api';

// Определяем контракт с appContext
export const contract = initContract({
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

// Создаем все роуты через фабрику
export const routes = contract.createRoutes({
  home: contract.createRoute("/", async ({ appContext, req }) => {
      const data = await getCharacters(1);
      return {
        type: 'ok',
        seo: {
          title: 'Rick and Morty Characters',
          description: `Browse through ${data.info.count} characters from Rick and Morty universe. Discover your favorite characters, their status, species, and more.`,
          keywords: 'rick and morty, characters, rick sanchez, morty smith, cartoon, adult swim',
          author: 'Rick and Morty',
          ogTitle: 'Rick and Morty Characters',
          ogDescription: `Browse through ${data.info.count} characters from Rick and Morty universe`,
          ogImage: 'https://rickandmortyapi.com/api/character/avatar/1.jpeg',
          ogUrl: 'https://rickandmorty.com/',
          twitterCard: 'summary_large_image',
          twitterTitle: 'Rick and Morty Characters',
          twitterDescription: `Browse through ${data.info.count} characters from Rick and Morty universe`,
          twitterImage: 'https://rickandmortyapi.com/api/character/avatar/1.jpeg',
        },
        data: {
          characters: data.results,
          info: data.info,
        }
      }
    }),
  character: contract.createRoute('/character/:id', async ({ appContext, params, req }) => {
      try {
        const character = await getCharacter(Number(params.id));
        return {
          type: 'ok',
          seo: {
            title: `${character.name} - Rick and Morty Character`,
            description: `${character.name} is a ${character.status.toLowerCase()} ${character.species} from ${character.origin.name}. Currently located at ${character.location.name}.`,
            keywords: `rick and morty, ${character.name}, ${character.species}, ${character.status}, character`,
            author: 'Rick and Morty',
            ogTitle: `${character.name} - Rick and Morty Character`,
            ogDescription: `${character.name} is a ${character.status.toLowerCase()} ${character.species} from ${character.origin.name}`,
            ogImage: character.image,
            ogUrl: `https://rickandmorty.com/character/${params.id}`,
            twitterCard: 'summary_large_image',
            twitterTitle: `${character.name} - Rick and Morty Character`,
            twitterDescription: `${character.name} is a ${character.status.toLowerCase()} ${character.species}`,
            twitterImage: character.image,
          },
          data: { character },
        }
      } catch {
        return { type: "not-found" }
      }
    }),
  episodes: contract.createRoute('/episodes', async ({ appContext, req }) => {
      const data = await getEpisodes(1);
      return {
        type: 'ok',
        seo: {
          title: 'Rick and Morty Episodes',
          description: `Watch all ${data.info.count} episodes of Rick and Morty. Explore the multiverse adventures of Rick Sanchez and Morty Smith.`,
          keywords: 'rick and morty, episodes, season, adult swim, cartoon, sci-fi',
          author: 'Rick and Morty',
          ogTitle: 'Rick and Morty Episodes',
          ogDescription: `Watch all ${data.info.count} episodes of Rick and Morty`,
          ogImage: 'https://rickandmortyapi.com/api/character/avatar/1.jpeg',
          ogUrl: 'https://rickandmorty.com/episodes',
          twitterCard: 'summary_large_image',
          twitterTitle: 'Rick and Morty Episodes',
          twitterDescription: `Watch all ${data.info.count} episodes of Rick and Morty`,
          twitterImage: 'https://rickandmortyapi.com/api/character/avatar/1.jpeg',
        },
        data: {
          episodes: data.results,
          info: data.info,
        }
      }
    }),
  episode: contract.createRoute('/episode/:id', async ({ appContext, params, req }) => {
      try {
        const episode = await getEpisode(Number(params.id));
        return {
          type: 'ok',
          seo: {
            title: `${episode.name} - Rick and Morty Episode ${episode.episode}`,
            description: `${episode.name} (${episode.episode}) aired on ${episode.air_date}. Featuring ${episode.characters.length} characters.`,
            keywords: `rick and morty, ${episode.name}, ${episode.episode}, episode, ${episode.air_date}`,
            author: 'Rick and Morty',
            ogTitle: `${episode.name} - Rick and Morty Episode`,
            ogDescription: `${episode.name} (${episode.episode}) aired on ${episode.air_date}`,
            ogImage: 'https://rickandmortyapi.com/api/character/avatar/1.jpeg',
            ogUrl: `https://rickandmorty.com/episode/${params.id}`,
            twitterCard: 'summary_large_image',
            twitterTitle: `${episode.name} - Rick and Morty Episode`,
            twitterDescription: `${episode.name} (${episode.episode}) aired on ${episode.air_date}`,
            twitterImage: 'https://rickandmortyapi.com/api/character/avatar/1.jpeg',
          },
          data: { episode },
        }
      } catch {
        return { type: "not-found" }
      }
    }),
});

// Экспортируем отдельные страницы для удобства
export const homePage = routes.home;
export const characterPage = routes.character;
export const episodesPage = routes.episodes;
export const episodePage = routes.episode;
