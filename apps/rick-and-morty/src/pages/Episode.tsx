import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getEpisode, type Episode } from '@monorepo/core';

export function EpisodePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      
      setLoading(true);
      setError(null);
      try {
        const ep = await getEpisode(Number(id));
        setEpisode(ep);
      } catch (err) {
        console.error('Failed to load episode:', err);
        setError('Episode not found');
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

  if (!episode) {
    return <div>Episode not found</div>;
  }

  return (
    <div>
      <button onClick={() => navigate('/episodes')} style={{ marginBottom: '16px' }}>
        ← Back to Episodes
      </button>
      
      <h1>{episode.name}</h1>
      <p><strong>Episode:</strong> {episode.episode}</p>
      <p><strong>Air Date:</strong> {episode.air_date}</p>
      <p><strong>Characters:</strong> {episode.characters.length}</p>
    </div>
  );
}


import { useState, useEffect } from 'react';
import { getEpisode, type Episode } from '@monorepo/core';

export function EpisodePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      
      setLoading(true);
      setError(null);
      try {
        const ep = await getEpisode(Number(id));
        setEpisode(ep);
      } catch (err) {
        console.error('Failed to load episode:', err);
        setError('Episode not found');
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

  if (!episode) {
    return <div>Episode not found</div>;
  }

  return (
    <div>
      <button onClick={() => navigate('/episodes')} style={{ marginBottom: '16px' }}>
        ← Back to Episodes
      </button>
      
      <h1>{episode.name}</h1>
      <p><strong>Episode:</strong> {episode.episode}</p>
      <p><strong>Air Date:</strong> {episode.air_date}</p>
      <p><strong>Characters:</strong> {episode.characters.length}</p>
    </div>
  );
}

