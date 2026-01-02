// core package
// Экспорт API функций и контрактов

// Экспортируем API функции
export * from './rick-and-morty.api';

// Экспортируем контракт и роуты для Rick and Morty
export { contract, homePage, characterPage, episodesPage, episodePage } from './rick-and-morty.routes';

// Экспортируем контракт как default для обратной совместимости
export { contract as default } from './rick-and-morty.routes';
