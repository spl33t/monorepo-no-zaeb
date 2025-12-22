import { characterPage } from "../routes"
import { navigateTo } from "@monorepo/contract-page-2"

export const CharacterPage = characterPage.defineView(({ pageContext }) => {
  if (!pageContext) {
    return <div>Loading...</div>;
  }
  
  if (pageContext.type === "not-found" && pageContext.data) {
    return <div>{pageContext.data.message}</div>;
  }
  
  if (pageContext.type === "ok" && pageContext.data?.character) {
    const { character } = pageContext.data;
    return (
      <div>
        <button onClick={() => navigateTo('/')} style={{ marginBottom: '16px' }}>
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
  
  return null;
});

