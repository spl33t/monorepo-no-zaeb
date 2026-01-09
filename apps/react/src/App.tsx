import { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);


  console.log(process.env.NODE_ENV);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>🚀 react</h1>
      <p>Vite + React выавыаваываываыавываы ожение</p>
      <button onClick={() => setCount((count) => count + 1)}>
        count is {count}
      </button>
    </div>
  );
}

export default App;
