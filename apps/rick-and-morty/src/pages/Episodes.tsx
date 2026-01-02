import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getEpisodes, type Episode, type PaginatedResponse } from '@monorepo/core';

export function EpisodesPage() {
  const navigate = useNavigate();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const data: PaginatedResponse<Episode> = await getEpisodes(1);
        setEpisodes(data.results);
        setTotal(data.info.count);
      } catch (error) {
        console.error('Failed to load episodes:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!episodes || episodes.length === 0) {
    return <div>No episodes found</div>;
  }

  return (
    <div>
      <h1>Episodes</h1>
      {total !== null && <p>Total: {total}</p>}
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {episodes.map((ep) => (
          <div 
            key={ep.id} 
            style={{ 
              border: '1px solid #ccc', 
              borderRadius: '8px', 
              padding: '12px', 
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
            onClick={() => navigate(`/episode/${ep.id}`)}
          >
            <div>
              <strong>{ep.episode}</strong> - {ep.name}
            </div>
            <div style={{ color: '#666' }}>
              {ep.air_date}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


import { useState, useEffect } from 'react';
import { getEpisodes, type Episode, type PaginatedResponse } from '@monorepo/core';

export function EpisodesPage() {
  const navigate = useNavigate();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const data: PaginatedResponse<Episode> = await getEpisodes(1);
        setEpisodes(data.results);
        setTotal(data.info.count);
      } catch (error) {
        console.error('Failed to load episodes:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!episodes || episodes.length === 0) {
    return <div>No episodes found</div>;
  }

  return (
    <div>
      <h1>Episodes</h1>
      {total !== null && <p>Total: {total}</p>}
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {episodes.map((ep) => (
          <div 
            key={ep.id} 
            style={{ 
              border: '1px solid #ccc', 
              borderRadius: '8px', 
              padding: '12px', 
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
            onClick={() => navigate(`/episode/${ep.id}`)}
          >
            <div>
              <strong>{ep.episode}</strong> - {ep.name}
            </div>
            <div style={{ color: '#666' }}>
              {ep.air_date}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

