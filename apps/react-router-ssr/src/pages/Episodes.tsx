import { episodesPage } from "../routes"
import { navigateTo } from "@monorepo/contract-page-2"

export const EpisodesPage = episodesPage.defineView(({ pageContext }) => {
  if (!pageContext) {
    return <div>Loading...</div>;
  }
  
  if (pageContext.type === "ok" && pageContext.data?.episodes) {
    return (
      <div>
        <h1>Episodes</h1>
        <p>Total: {pageContext.data.info.count}</p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pageContext.data.episodes.map((ep) => (
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
              onClick={() => navigateTo(`/episode/${ep.id}`)}
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
  
  return null;
});

