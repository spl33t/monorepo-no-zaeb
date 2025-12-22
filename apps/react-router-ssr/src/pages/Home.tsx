import { homePage } from "../routes"
import { navigateTo } from "@monorepo/contract-page-2"

export const HomePage = homePage.defineView(({ pageContext }) => {
  if (!pageContext) {
    return <div>Loading...</div>;
  }
  if (pageContext.type === "ok" && pageContext.data?.characters) {
    return (
      <div>
        <h1>Rick and Morty Characters</h1>
        <p>Total: {pageContext.data.info.count}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          {pageContext.data.characters.map((char) => (
            <div 
              key={char.id} 
              style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '12px', cursor: 'pointer' }}
              onClick={() => navigateTo(`/character/${char.id}`)}
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
  return null;
});