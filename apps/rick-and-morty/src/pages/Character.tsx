import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getCharacter, type Character } from '@monorepo/core';

export function CharacterPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      
      setLoading(true);
      setError(null);
      try {
        const char = await getCharacter(Number(id));
        setCharacter(char);
      } catch (err) {
        console.error('Failed to load character:', err);
        setError('Character not found');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [id]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  if (!character) {
    return <div>Character not found</div>;
  }

  return (
    <div>
      <button onClick={() => navigate('/')} style={{ marginBottom: '16px' }}>
        ← Back to Characters
      </button>
      
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <img 
          src={character.image} 
          alt={character.name} 
          style={{ width: '300px', borderRadius: '8px' }} 
        />
        
        <div>
          <h1 style={{ margin: '0 0 16px' }}>{character.name}</h1>
          
          <p><strong>Status:</strong> {character.status}</p>
          <p><strong>Species:</strong> {character.species}</p>
          <p><strong>Gender:</strong> {character.gender}</p>
          <p><strong>Origin:</strong> {character.origin.name}</p>
          <p><strong>Location:</strong> {character.location.name}</p>
          <p><strong>Episodes:</strong> {character.episode.length}</p>
        </div>
      </div>
    </div>
  );
}


import { useState, useEffect } from 'react';
import { getCharacter, type Character } from '@monorepo/core';

export function CharacterPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      
      setLoading(true);
      setError(null);
      try {
        const char = await getCharacter(Number(id));
        setCharacter(char);
      } catch (err) {
        console.error('Failed to load character:', err);
        setError('Character not found');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [id]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  if (!character) {
    return <div>Character not found</div>;
  }

  return (
    <div>
      <button onClick={() => navigate('/')} style={{ marginBottom: '16px' }}>
        ← Back to Characters
      </button>
      
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <img 
          src={character.image} 
          alt={character.name} 
          style={{ width: '300px', borderRadius: '8px' }} 
        />
        
        <div>
          <h1 style={{ margin: '0 0 16px' }}>{character.name}</h1>
          
          <p><strong>Status:</strong> {character.status}</p>
          <p><strong>Species:</strong> {character.species}</p>
          <p><strong>Gender:</strong> {character.gender}</p>
          <p><strong>Origin:</strong> {character.origin.name}</p>
          <p><strong>Location:</strong> {character.location.name}</p>
          <p><strong>Episodes:</strong> {character.episode.length}</p>
        </div>
      </div>
    </div>
  );
}

