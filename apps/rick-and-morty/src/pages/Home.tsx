import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getCharacters, type Character, type PaginatedResponse } from '@monorepo/core';

export function HomePage() {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const data: PaginatedResponse<Character> = await getCharacters(1);
        setCharacters(data.results);
        setTotal(data.info.count);
      } catch (error) {
        console.error('Failed to load characters:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!characters || characters.length === 0) {
    return <div>No characters found</div>;
  }

  return (
    <div>
      <h1>Rick and Morty Characters</h1>
      {total !== null && <p>Total: {total}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        {characters.map((char) => (
          <div 
            key={char.id} 
            style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '12px', cursor: 'pointer' }}
            onClick={() => navigate(`/character/${char.id}`)}
          >
            <img src={char.image} alt={char.name} style={{ width: '100%', borderRadius: '4px' }} />
            <h3 style={{ margin: '8px 0 4px' }}>{char.name}</h3>
            <p style={{ margin: 0, color: '#666' }}>{char.status} - {char.species}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

