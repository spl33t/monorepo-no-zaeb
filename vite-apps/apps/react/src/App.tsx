import { useState } from 'react';
import { Badge } from '@monorepo/ui';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>🚀 react</h1>
      <p>
        Vite + React · <Badge>@monorepo/ui</Badge>
      </p>
      <p>📦 NODE_ENV: {import.meta.env.MODE}</p>
      <button onClick={() => setCount((count) => count + 1)}>
        count is {count}
      </button>
    </div>
  );
}

export default App;
