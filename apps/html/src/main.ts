import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>🚀 html</h1>
    <p>Vite + Vanilla TypeScript приложение</p>
    <button id="counter" type="button">Count: 0</button>
  </div>
`;

const button = document.querySelector<HTMLButtonElement>('#counter')!;
let count = 0;

button.addEventListener('click', () => {
  count++;
  button.textContent = `Count: ${count}`;
});
