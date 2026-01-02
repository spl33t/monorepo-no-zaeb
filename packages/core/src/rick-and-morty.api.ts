/**
 * Rick and Morty API client
 * https://rickandmortyapi.com/
 */

const BASE_URL = 'https://rickandmortyapi.com/api';

// Types
export interface Character {
  id: number;
  name: string;
  status: 'Alive' | 'Dead' | 'unknown';
  species: string;
  type: string;
  gender: 'Female' | 'Male' | 'Genderless' | 'unknown';
  origin: {
    name: string;
    url: string;
  };
  location: {
    name: string;
    url: string;
  };
  image: string;
  episode: string[];
  url: string;
  created: string;
}

export interface Location {
  id: number;
  name: string;
  type: string;
  dimension: string;
  residents: string[];
  url: string;
  created: string;
}

export interface Episode {
  id: number;
  name: string;
  air_date: string;
  episode: string;
  characters: string[];
  url: string;
  created: string;
}

export interface PaginatedResponse<T> {
  info: {
    count: number;
    pages: number;
    next: string | null;
    prev: string | null;
  };
  results: T[];
}

// Characters
export async function getCharacters(page = 1): Promise<PaginatedResponse<Character>> {
  const res = await fetch(`${BASE_URL}/character?page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch characters');
  return res.json();
}

export async function getCharacter(id: number): Promise<Character> {
  const res = await fetch(`${BASE_URL}/character/${id}`);
  if (!res.ok) throw new Error(`Character ${id} not found`);
  return res.json();
}

export async function getCharactersByIds(ids: number[]): Promise<Character[]> {
  const res = await fetch(`${BASE_URL}/character/${ids.join(',')}`);
  if (!res.ok) throw new Error('Failed to fetch characters');
  return res.json();
}

export async function searchCharacters(name: string, page = 1): Promise<PaginatedResponse<Character>> {
  const res = await fetch(`${BASE_URL}/character?name=${encodeURIComponent(name)}&page=${page}`);
  if (!res.ok) {
    if (res.status === 404) return { info: { count: 0, pages: 0, next: null, prev: null }, results: [] };
    throw new Error('Failed to search characters');
  }
  return res.json();
}

// Locations
export async function getLocations(page = 1): Promise<PaginatedResponse<Location>> {
  const res = await fetch(`${BASE_URL}/location?page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch locations');
  return res.json();
}

export async function getLocation(id: number): Promise<Location> {
  const res = await fetch(`${BASE_URL}/location/${id}`);
  if (!res.ok) throw new Error(`Location ${id} not found`);
  return res.json();
}

export async function searchLocations(name: string, page = 1): Promise<PaginatedResponse<Location>> {
  const res = await fetch(`${BASE_URL}/location?name=${encodeURIComponent(name)}&page=${page}`);
  if (!res.ok) {
    if (res.status === 404) return { info: { count: 0, pages: 0, next: null, prev: null }, results: [] };
    throw new Error('Failed to search locations');
  }
  return res.json();
}

// Episodes
export async function getEpisodes(page = 1): Promise<PaginatedResponse<Episode>> {
  const res = await fetch(`${BASE_URL}/episode?page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch episodes');
  return res.json();
}

export async function getEpisode(id: number): Promise<Episode> {
  const res = await fetch(`${BASE_URL}/episode/${id}`);
  if (!res.ok) throw new Error(`Episode ${id} not found`);
  return res.json();
}

export async function getEpisodesByIds(ids: number[]): Promise<Episode[]> {
  const res = await fetch(`${BASE_URL}/episode/${ids.join(',')}`);
  if (!res.ok) throw new Error('Failed to fetch episodes');
  return res.json();
}

export async function searchEpisodes(name: string, page = 1): Promise<PaginatedResponse<Episode>> {
  const res = await fetch(`${BASE_URL}/episode?name=${encodeURIComponent(name)}&page=${page}`);
  if (!res.ok) {
    if (res.status === 404) return { info: { count: 0, pages: 0, next: null, prev: null }, results: [] };
    throw new Error('Failed to search episodes');
  }
  return res.json();
}

