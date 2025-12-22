import { episodePage } from "../routes"
import { navigateTo } from "@monorepo/contract-page-2"

export const EpisodePage = episodePage.defineView(({ pageContext }) => {
  if (!pageContext) {
    return <div>Loading...</div>;
  }
  
  if (pageContext.type === "not-found" && pageContext.data) {
    return <div>{pageContext.data.message}</div>;
  }
  
  if (pageContext.type === "ok" && pageContext.data?.episode) {
    const { episode } = pageContext.data;
    return (
      <div>
        <button onClick={() => navigateTo('/episodes')} style={{ marginBottom: '16px' }}>
          ← Back to Episodes
        </button>
        
        <h1>{episode.name}</h1>
        <p><strong>Episode:</strong> {episode.episode}</p>
        <p><strong>Air Date:</strong> {episode.air_date}</p>
        <p><strong>Characters:</strong> {episode.characters.length}</p>
      </div>
    );
  }
  
  return null;
});

